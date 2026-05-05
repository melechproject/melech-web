"use strict";

class UserLibrary {
  constructor() {
    this.userSongGrid = document.getElementById("userSongGrid");
    this.exploreTab = document.getElementById("exploreTab");
    this.libraryTab = document.getElementById("libraryTab");
    this.exploreContent = document.getElementById("exploreContent");
    this.libraryContent = document.getElementById("libraryContent");
    this.refreshLibraryBtn = document.getElementById("refreshLibrary");
    this.songSearchInput = document.getElementById("songSearch");
    this.mobileSearchToggle = document.getElementById("mobileSearchToggle");
    this.songLibraryHeader = document.getElementById("songLibraryHeader");

    this.uploadModal = document.getElementById("uploadSongsModal");
    this.closeUploadModal = document.getElementById("closeUploadModal");
    this.uploadSongsBackdrop = document.getElementById("uploadSongsBackdrop");
    this.uploadFileTab = document.getElementById("uploadFileTab");
    this.uploadUrlTab = document.getElementById("uploadUrlTab");
    this.fileUploadSection = document.getElementById("fileUploadSection");
    this.urlUploadSection = document.getElementById("urlUploadSection");
    this.dropZone = document.getElementById("dropZone");
    this.fileInput = document.getElementById("fileInput");
    this.uploadPreview = document.getElementById("uploadPreview");
    this.uploadPreviewList = document.getElementById("uploadPreviewList");
    this.cancelUpload = document.getElementById("cancelUpload");
    this.confirmUpload = document.getElementById("confirmUpload");

    this.songUrlInput = document.getElementById("songUrlInput");
    this.urlSongTitle = document.getElementById("urlSongTitle");
    this.urlSongArtist = document.getElementById("urlSongArtist");
    this.addUrlSongBtn = document.getElementById("addUrlSongBtn");

    this.pendingSongs = [];
    this.userSongs = [];
    this.displaySongs = [];
    this.isMobileSearchOpen = false;
    this.tempCoverBlob = null;
    this.pendingCustomCovers = {};
    this.pendingCoverIndex = null;

    this.contextMenu = null;
    this.longPressTimer = null;
    this.isLongPress = false;
    this.currentEditTrack = null;

    this.renderedSongs = new Set();
    this.batchSize = 20;
    this.observer = null;
    this.scrollObserver = null;
    this.sentinel = null;
    this.nextRenderIndex = 0;
    this.placeholderHeight = 200;

    this.init();
  }

  async init() {
    this.setupTabSwitching();
    this.setupSongSearch();
    this.setupUploadModal();
    this.setupFileUpload();
    this.setupUrlUpload();
    this.createCustomCoverInput();
    this.createContextMenu();
    this.setupEditModal();
    this.setupEventDelegation();
    await this.loadUserSongs();
    await this.restoreLastTab();
  }

  setupSongSearch() {
    if (!this.songSearchInput) return;

    if (this.mobileSearchToggle) {
      this.mobileSearchToggle.addEventListener("click", () =>
        this.toggleMobileSearch(),
      );
    }

    window.addEventListener("resize", () => {
      const clearBtn = document.getElementById("clearSearch");
      const hasText = this.songSearchInput.value.length > 0;
      clearBtn.classList.add("hidden");
      this.songSearchInput.classList.remove("pr-8");
      if (!this.isCompactSearchViewport()) {
        if (hasText) {
          clearBtn.classList.remove("hidden");
          this.songSearchInput.classList.add("pr-8");
        }
        this.closeMobileSearch();
      }
    });

    this.songSearchInput.addEventListener("keydown", async (event) => {
      if (event.key === "Escape") {
        if (this.isMobileSearchOpen) {
          this.closeMobileSearch();
        }
        return;
      }

      if (event.key !== "Enter") return;
      event.preventDefault();

      const query = this.songSearchInput.value.trim();
      const isExploreActive = !this.exploreContent.classList.contains("hidden");

      if (isExploreActive) {
        await window.melechLibrary?.searchExplore(query);
      } else {
        this.searchUserLibrary(query);
      }
    });

    const clearBtn = document.getElementById("clearSearch");
    if (clearBtn) {
      this.songSearchInput.addEventListener("input", () => {
        const hasText = this.songSearchInput.value.length > 0;
        if (hasText) {
          clearBtn.classList.remove("hidden");
          this.songSearchInput.classList.add("pr-8");
        } else {
          clearBtn.classList.add("hidden");
          this.songSearchInput.classList.remove("pr-8");
        }
      });

      clearBtn.addEventListener("click", async () => {
        this.songSearchInput.value = "";
        clearBtn.classList.add("hidden");
        this.songSearchInput.classList.remove("pr-8");
        this.songSearchInput.focus();

        const isExploreActive =
          !this.exploreContent.classList.contains("hidden");
        if (isExploreActive) {
          await window.melechLibrary?.searchExplore("");
        } else {
          this.searchUserLibrary("");
        }
      });
    }
  }

  isCompactSearchViewport() {
    return window.innerWidth < 550;
  }

  toggleMobileSearch() {
    if (!this.isCompactSearchViewport()) return;

    const clearBtn = document.getElementById("clearSearch");
    if (this.isMobileSearchOpen) {
      clearBtn?.classList.add("hidden");
      this.closeMobileSearch();
    } else {
      const hasText = this.songSearchInput.value.length > 0;
      if (hasText) {
        clearBtn.classList.remove("hidden");
        this.songSearchInput.classList.add("pr-8");
      } else {
        clearBtn.classList.add("hidden");
        this.songSearchInput.classList.remove("pr-8");
      }
      this.openMobileSearch();
    }
  }

  openMobileSearch() {
    this.isMobileSearchOpen = true;
    this.songLibraryHeader?.classList.add("mobile-search-open");
    this.mobileSearchToggle?.setAttribute("aria-expanded", "true");
    const icon = this.mobileSearchToggle?.querySelector(
      ".material-symbols-rounded",
    );
    if (icon) icon.textContent = "close";
    this.songSearchInput?.focus();
  }

  closeMobileSearch() {
    this.isMobileSearchOpen = false;
    this.songLibraryHeader?.classList.remove("mobile-search-open");
    this.mobileSearchToggle?.setAttribute("aria-expanded", "false");
    const icon = this.mobileSearchToggle?.querySelector(
      ".material-symbols-rounded",
    );
    if (icon) icon.textContent = "search";
  }

  normalizeSearchKeywords(query) {
    return query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  }

  calculateKeywordScore(track, keywords) {
    if (!keywords.length) return 0;

    const title = (track.title || "").toLowerCase();
    const artist = (track.artist || "").toLowerCase();
    const combined = `${title} ${artist}`.trim();
    const fullQuery = keywords.join(" ");

    let score = 0;
    if (combined.includes(fullQuery)) score += 100;
    if (title.includes(fullQuery)) score += 40;
    if (artist.includes(fullQuery)) score += 30;

    keywords.forEach((keyword) => {
      if (title.includes(keyword)) score += 18;
      if (artist.includes(keyword)) score += 12;
      if (combined.includes(keyword)) score += 6;
    });

    return score;
  }

  searchUserLibrary(query) {
    const searchQuery = (query || "").trim();
    if (!searchQuery) {
      this.renderUserSongs(this.userSongs);
      return;
    }

    const keywords = this.normalizeSearchKeywords(searchQuery);
    const matchedSongs = this.userSongs
      .map((song) => ({
        song,
        score: this.calculateKeywordScore(song, keywords),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.song);

    this.renderUserSongs(matchedSongs);
  }

  async restoreLastTab() {
    let savedTab = "explore";
    if (window.melechDB) {
      savedTab = await window.melechDB.getSetting("lastActiveTab", "explore");
    }

    if (savedTab === "library") {
      this.switchTab("library");
    } else {
      this.switchTab("explore");
    }
  }

  createCustomCoverInput() {
    this.customCoverFileInput = document.createElement("input");
    this.customCoverFileInput.type = "file";
    this.customCoverFileInput.accept = "image/*";
    this.customCoverFileInput.classList.add("hidden");
    this.customCoverFileInput.addEventListener("change", (e) =>
      this.handleCustomCoverSelection(e),
    );
    document.body.appendChild(this.customCoverFileInput);
  }

  async handleCustomCoverSelection(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const resizedCover = await this.processCoverImage(file);
    if (!resizedCover) return;

    if (this.pendingCoverIndex !== null) {
      this.pendingCustomCovers[this.pendingCoverIndex] = resizedCover;
      this.pendingSongs[this.pendingCoverIndex].image = resizedCover;
      this.showUploadPreview();
      this.pendingCoverIndex = null;
    } else {
      this.tempCoverBlob = resizedCover;
      const coverImg = document.getElementById("urlCoverImage");
      const coverPreview = document.getElementById("urlCoverPreview");
      if (coverImg && coverPreview) {
        coverImg.src = resizedCover;
        coverPreview.classList.remove("hidden");
      }
    }
  }

  triggerCustomCoverSelect(songIndex = null) {
    this.pendingCoverIndex = songIndex;
    this.customCoverFileInput?.click();
  }

  createContextMenu() {
    this.contextMenu = document.createElement("div");
    this.contextMenu.className = "context-menu";
    this.contextMenu.innerHTML = `
            <div class="context-menu-item" data-action="edit">
                <span translate="no" class="material-symbols-rounded">edit</span>
                <span data-i18n="song.editSong">Edit Song</span>
            </div>
            <div class="context-menu-item" data-action="share">
                <span translate="no" class="material-symbols-rounded">share</span>
                <span data-i18n="song.shareSong">Share Song</span>
            </div>
            <div class="context-menu-item delete" data-action="delete">
                <span translate="no" class="material-symbols-rounded">delete</span>
                <span data-i18n="song.deleteSong">Delete Song</span>
            </div>
            <div class="context-menu-divider"></div>
            <div class="context-menu-item" data-action="download">
                <span translate="no" class="material-symbols-rounded">download</span>
                <span data-i18n="contextMenu.download">Download</span>
            </div>
        `;
    document.body.appendChild(this.contextMenu);

    this.contextMenu.addEventListener("click", async (e) => {
      const item = e.target.closest(".context-menu-item");
      if (!item) return;

      const action = item.dataset.action;
      const trackId = this.contextMenu.dataset.trackId;
      const track = this.userSongs.find((s) => s.id === trackId);

      if (track) {
        switch (action) {
          case "edit":
            this.editTrack(track);
            break;
          case "share":
            this.shareTrack(track);
            break;
          case "delete":
            this.deleteTrack(track);
            break;
          case "download":
            await this.downloadTrack(track);
            break;
        }
      }

      this.hideContextMenu();
    });

    document.addEventListener(
      "click",
      (e) => {
        if (!this.contextMenu.contains(e.target)) {
          this.hideContextMenu();
        }
      },
      true,
    );

    window.addEventListener("scroll", () => this.hideContextMenu(), true);
  }

  showContextMenu(x, y, trackId) {
    this.contextMenu.dataset.trackId = trackId;
    const track = this.userSongs.find((s) => s.id === trackId);
    const deleteItemSpan = this.contextMenu.querySelector(
      ".context-menu-item.delete span:last-child",
    );
    const editItem = this.contextMenu.querySelector(
      '.context-menu-item[data-action="edit"]',
    );
    const shareItem = this.contextMenu.querySelector(
      '.context-menu-item[data-action="share"]',
    );
    const downloadItem = this.contextMenu.querySelector(
      '.context-menu-item[data-action="download"]',
    );
    const divider = this.contextMenu.querySelector(".context-menu-divider");

    if (track) {
      if (track.source === "radio") {
        if (deleteItemSpan) {
          deleteItemSpan.setAttribute("data-i18n", "song.remove");
          deleteItemSpan.textContent = window.t
            ? window.t("song.remove")
            : "Remove";
        }
        if (editItem) editItem.style.display = "none";
        if (shareItem) shareItem.style.display = "none";
        if (downloadItem) downloadItem.style.display = "none";
        if (divider) divider.style.display = "none";
      } else {
        if (deleteItemSpan) {
          deleteItemSpan.setAttribute("data-i18n", "song.deleteSong");
          deleteItemSpan.textContent = window.t
            ? window.t("song.deleteSong")
            : "Delete Song";
        }
        if (editItem) editItem.style.display = "";
        if (shareItem) shareItem.style.display = "";
        if (downloadItem) downloadItem.style.display = "";
        if (divider) divider.style.display = "";
      }
    }

    this.contextMenu.style.left = `${x}px`;
    this.contextMenu.style.top = `${y}px`;
    this.contextMenu.classList.add("active");

    const rect = this.contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      this.contextMenu.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
      this.contextMenu.style.top = `${y - rect.height}px`;
    }
  }

  hideContextMenu() {
    this.contextMenu.classList.remove("active");
  }

  editTrack(track) {
    this.currentEditTrack = track;

    const modal = document.getElementById("editSongModal");
    const titleInput = document.getElementById("editSongTitleInput");
    const artistInput = document.getElementById("editSongArtistInput");
    const idInput = document.getElementById("editSongId");
    const coverImg = document.getElementById("editSongCoverImg");

    if (!modal || !titleInput || !artistInput || !idInput) return;

    titleInput.value = track.title || "";
    artistInput.value = track.artist || "";
    idInput.value = track.id;

    if (coverImg) {
      coverImg.src = track.image || "./resources/MelechCover.png";
    }

    modal.classList.remove("opacity-0", "pointer-events-none");
    modal.classList.add("opacity-100", "pointer-events-auto");
    const content = modal.querySelector(".transform");
    if (content) {
      content.classList.remove("scale-95");
      content.classList.add("scale-100");
    }
  }

  async deleteTrack(track) {
    const confirmed = await window.melechConfirm(
      "song.confirmDelete",
      "common.confirm",
      {
        i18nParams: { title: track.title },
      },
    );
    if (!confirmed) return;

    try {
      if (window.playlistManager) {
        await window.playlistManager.removeTrackFromAllPlaylists(track.id);
      }

      if (window.melechDB) {
        await window.melechDB.deleteUserSong(track.id);
      }

      this.removeSongFromGrid(track.id);
      window.dispatchEvent(
        new CustomEvent("userSongDeleted", { detail: { trackId: track.id } }),
      );

      if (track.source === "radio") {
        window.dispatchEvent(
          new CustomEvent("favoritesUpdated", {
            detail: { trackId: track.id, isFavorite: false },
          }),
        );
      }
    } catch (error) {
      window.notifications?.error("song.deleteError");
    }
  }

  async downloadTrack(track) {
    if (!track) {
      window.notifications?.error("song.downloadError");
      return;
    }

    const fileName = `${track.title || "Unknown"} - ${track.artist || "Unknown"}.mp3`;

    try {
      if (track.source === "user" && track.hasAudioBlob) {
        const fullSong = await window.melechDB?.getUserSongById(track.id);
        if (fullSong?.audioBlob instanceof Blob) {
          const blobUrl = URL.createObjectURL(fullSong.audioBlob);
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
          return;
        }
      }

      const audioUrl = track.audio;
      if (!audioUrl) {
        window.notifications?.error("song.downloadError");
        return;
      }

      if (track.source === "url") {
        const response = await fetch(audioUrl, { method: "GET" });
        if (!response.ok) throw new Error("Failed to fetch URL");
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      } else {
        const a = document.createElement("a");
        a.href = audioUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (error) {
      window.notifications?.error("song.downloadError");
    }
  }

  shareTrack(track) {
    const songData = {
      id: track.id,
      name: `${track.title} - ${track.artist}`,
      songs: [
        {
          id: track.id,
          title: track.title,
          artist: track.artist,
          image: track.image,
          audio: track.audio,
          audioDataUrl: track.audioDataUrl,
          source: track.source || "library",
        },
      ],
      createdAt: Date.now(),
      isSingleSong: true,
    };

    if (window.playlistShare) {
      window.playlistShare.openShareModal(songData, "song");
    }
  }

  setupEditModal() {
    const modal = document.getElementById("editSongModal");
    const cancelBtn = document.getElementById("cancelEditSong");
    const confirmBtn = document.getElementById("confirmEditSong");
    const backdrop = document.getElementById("editSongBackdrop");
    const coverBtn = document.getElementById("editSongCoverBtn");

    const closeModal = () => {
      if (!modal) return;
      modal.classList.add("opacity-0", "pointer-events-none");
      modal.classList.remove("opacity-100", "pointer-events-auto");
      const content = modal.querySelector(".transform");
      if (content) {
        content.classList.add("scale-95");
        content.classList.remove("scale-100");
      }
      this.currentEditTrack = null;
    };

    if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
    if (backdrop) backdrop.addEventListener("click", closeModal);

    if (coverBtn) {
      coverBtn.addEventListener("click", () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;

          const resizedCover = await this.processCoverImage(file);
          if (resizedCover) {
            const coverImg = document.getElementById("editSongCoverImg");
            if (coverImg) coverImg.src = resizedCover;
            if (this.currentEditTrack) {
              this.currentEditTrack.newImage = resizedCover;
            }
          }
        };
        input.click();
      });
    }

    if (confirmBtn) {
      confirmBtn.addEventListener("click", async () => {
        const titleInput = document.getElementById("editSongTitleInput");
        const artistInput = document.getElementById("editSongArtistInput");
        const idInput = document.getElementById("editSongId");

        if (!titleInput || !artistInput || !idInput) return;

        const trackId = idInput.value;
        const newTitle = titleInput.value.trim();
        const newArtist = artistInput.value.trim();

        if (!newTitle || !newArtist) {
          window.notifications?.warning("song.emptyNameError");
          return;
        }

        try {
          const song = await window.melechDB?.getUserSongById(trackId);
          if (song) {
            song.title = newTitle;
            song.artist = newArtist;

            if (this.currentEditTrack?.newImage) {
              song.image = this.currentEditTrack.newImage;
            }

            await window.melechDB?.saveUserSong(song);

            const localSong = this.userSongs.find((s) => s.id === trackId);
            if (localSong) {
              localSong.title = newTitle;
              localSong.artist = newArtist;
              if (this.currentEditTrack?.newImage) {
                localSong.image = this.currentEditTrack.newImage;
              }
            }

            this.renderUserSongs();

            window.dispatchEvent(
              new CustomEvent("userSongUpdated", { detail: { trackId, song } }),
            );

            window.notifications?.success("song.editSuccess");

            closeModal();
          }
        } catch (error) {
          window.notifications?.error("song.editError");
        }
      });
    }
  }

  setupTabSwitching() {
    this.exploreTab?.addEventListener("click", () => this.switchTab("explore"));
    this.libraryTab?.addEventListener("click", () => this.switchTab("library"));
  }

  async switchTab(tab) {
    if (window.melechDB) {
      await window.melechDB.setSetting("lastActiveTab", tab);
    }

    if (tab === "explore") {
      this.exploreTab.setAttribute("aria-selected", "true");
      this.libraryTab.setAttribute("aria-selected", "false");
      this.exploreTab.classList.remove("text-white/50", "border-transparent");
      this.exploreTab.classList.add(
        "text-white",
        "border-[var(--primary-color)]",
      );
      this.libraryTab.classList.remove(
        "text-white",
        "border-[var(--primary-color)]",
      );
      this.libraryTab.classList.add("text-white/50", "border-transparent");

      this.clearUserLibraryDOM();

      this.libraryContent.classList.add("hidden");
      this.exploreContent.classList.remove("hidden");

      if (
        window.melechLibrary &&
        !window.melechLibrary.isLoading &&
        window.melechLibrary.allTracks.length === 0
      ) {
        window.melechLibrary.loadLibrary();
      }

      this.toggleActionButton("refresh");
    } else {
      this.libraryTab.setAttribute("aria-selected", "true");
      this.exploreTab.setAttribute("aria-selected", "false");
      this.libraryTab.classList.remove("text-white/50", "border-transparent");
      this.libraryTab.classList.add(
        "text-white",
        "border-[var(--primary-color)]",
      );
      this.exploreTab.classList.remove(
        "text-white",
        "border-[var(--primary-color)]",
      );
      this.exploreTab.classList.add("text-white/50", "border-transparent");

      if (window.melechLibrary) {
        window.melechLibrary.clearDOM();
      }
      this.exploreContent.classList.add("hidden");

      this.libraryContent.classList.remove("hidden");
      this.renderUserSongs();

      this.toggleActionButton("add");
    }
  }

  clearUserLibraryDOM() {
    if (this.scrollObserver) {
      this.scrollObserver.disconnect();
      this.scrollObserver = null;
    }

    if (this.sentinel && this.sentinel.parentNode) {
      this.sentinel.parentNode.removeChild(this.sentinel);
      this.sentinel = null;
    }

    if (this.userSongGrid) {
      this.userSongGrid.innerHTML = "";
    }

    this.renderedSongs.clear();
    this.nextRenderIndex = 0;
  }

  toggleActionButton(mode) {
    const btn = this.refreshLibraryBtn;
    if (!btn) return;

    if (mode === "refresh") {
      btn.innerHTML =
        '<span translate="no" class="material-symbols-rounded">refresh</span>';
      btn.title = window.t ? window.t("playlist.refresh") : "Refresh";
      btn.onclick = () => {
        if (window.melechLibrary) {
          window.melechLibrary.loadLibrary();
        }
      };
    } else {
      btn.innerHTML =
        '<span translate="no" class="material-symbols-rounded">add</span>';
      btn.title = window.t ? window.t("song.addSong") : "Add Song";
      btn.onclick = () => this.openUploadModal();
    }
  }

  setupUploadModal() {
    this.closeUploadModal?.addEventListener("click", () =>
      this.closeUploadModalFn(),
    );
    this.uploadSongsBackdrop?.addEventListener("click", () =>
      this.closeUploadModalFn(),
    );
    this.uploadFileTab?.addEventListener("click", () =>
      this.switchUploadTab("file"),
    );
    this.uploadUrlTab?.addEventListener("click", () =>
      this.switchUploadTab("url"),
    );
    this.cancelUpload?.addEventListener("click", () =>
      this.closeUploadModalFn(),
    );
    this.confirmUpload?.addEventListener("click", () =>
      this.confirmFileUpload(),
    );
  }

  openUploadModal() {
    this.uploadModal.classList.remove("opacity-0", "pointer-events-none");
    const modalContent = this.uploadModal.querySelector(
      'div[class*="transform"]',
    );
    if (modalContent) {
      modalContent.classList.remove("scale-95");
      modalContent.classList.add("scale-100");
    }
    this.resetUploadForm();
  }

  closeUploadModalFn() {
    this.uploadModal.classList.add("opacity-0", "pointer-events-none");
    const modalContent = this.uploadModal.querySelector(
      'div[class*="transform"]',
    );
    if (modalContent) {
      modalContent.classList.add("scale-95");
      modalContent.classList.remove("scale-100");
    }
  }

  resetUploadForm() {
    this.pendingSongs = [];
    this.uploadPreview?.classList.add("hidden");
    this.fileInput.value = "";
    this.songUrlInput.value = "";
    this.urlSongTitle.value = "";
    this.urlSongArtist.value = "";
    this.tempCoverBlob = null;

    const coverImg = document.getElementById("urlCoverImage");
    if (coverImg) {
      coverImg.src = "./resources/MelechCover.png";
    }
    this.switchUploadTab("file");
  }

  switchUploadTab(tab) {
    this.uploadFileTab?.classList.remove("bg-[var(--primary-color)]");
    this.uploadFileTab?.classList.add("bg-white/10");
    this.uploadUrlTab?.classList.remove("bg-[var(--primary-color)]");
    this.uploadUrlTab?.classList.add("bg-white/10");

    this.fileUploadSection?.classList.add("hidden");
    this.urlUploadSection?.classList.add("hidden");

    if (tab === "file") {
      this.uploadFileTab?.classList.remove("bg-white/10");
      this.uploadFileTab?.classList.add("bg-[var(--primary-color)]");
      this.fileUploadSection?.classList.remove("hidden");
    } else if (tab === "url") {
      this.uploadUrlTab?.classList.remove("bg-white/10");
      this.uploadUrlTab?.classList.add("bg-[var(--primary-color)]");
      this.urlUploadSection?.classList.remove("hidden");
    }
  }

  setupFileUpload() {
    this.dropZone?.addEventListener("click", () => this.fileInput?.click());
    this.fileInput?.addEventListener("change", (e) =>
      this.handleFiles(e.target.files),
    );
    this.dropZone?.addEventListener("dragover", (e) => {
      e.preventDefault();
      this.dropZone.classList.add(
        "border-[var(--primary-color)]",
        "bg-white/5",
      );
    });
    this.dropZone?.addEventListener("dragleave", () => {
      this.dropZone.classList.remove(
        "border-[var(--primary-color)]",
        "bg-white/5",
      );
    });
    this.dropZone?.addEventListener("drop", (e) => {
      e.preventDefault();
      this.dropZone.classList.remove(
        "border-[var(--primary-color)]",
        "bg-white/5",
      );
      this.handleFiles(e.dataTransfer.files);
    });
  }

  async handleFiles(files) {
    if (!files || files.length === 0) return;

    for (const file of files) {
      if (!file.type.startsWith("audio/")) continue;
      const songData = await this.processAudioFile(file);
      this.pendingSongs.push(songData);
    }
    if (this.pendingSongs.length > 0) {
      this.showUploadPreview();
    }
  }

  async processAudioFile(file) {
    const id = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    let metadata = await this.extractMetadata(file);

    let resizedCover = null;
    if (metadata.cover) {
      resizedCover = await this.resizeImageTo325(metadata.cover);
    }

    const tempUrl = URL.createObjectURL(file);

    return {
      id,
      file,
      url: tempUrl,
      title: metadata.title || file.name.replace(/\.[^/.]+$/, ""),
      artist:
        metadata.artist ||
        (window.t ? window.t("song.unknownArtist") : "Unknown Artist"),
      image: resizedCover,
      audioBlob: file,
      source: "user",
    };
  }

  fileToDataURL(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  async extractMetadata(file) {
    return new Promise((resolve) => {
      const result = { title: null, artist: null, cover: null };

      if (typeof jsmediatags === "undefined") {
        resolve(result);
        return;
      }

      jsmediatags.read(file, {
        onSuccess: (tag) => {
          const tags = tag.tags;
          if (tags.title) {
            result.title = tags.title;
          }
          if (tags.artist) {
            result.artist = tags.artist;
          }
          if (tags.picture) {
            const picture = tags.picture;
            let format = picture.format;
            if (!format.startsWith("image/")) {
              format = "image/" + format.replace("image/", "");
            }
            const byteArray = new Uint8Array(picture.data);
            const blob = new Blob([byteArray], { type: format });
            result.cover = URL.createObjectURL(blob);
          }
          resolve(result);
        },
        onError: (error) => {
          resolve(result);
        },
      });
    });
  }

  showUploadPreview() {
    if (!this.uploadPreview || !this.uploadPreviewList) return;
    this.uploadPreview.classList.remove("hidden");

    const pendingCount = document.getElementById("pendingCount");
    if (pendingCount) {
      pendingCount.textContent = `(${this.pendingSongs.length})`;
    }

    this.uploadPreviewList.innerHTML = this.pendingSongs
      .map((song, index) => {
        return `
            <div class="flex items-stretch gap-2 h-[105px] bg-white/5 rounded-xl p-2">
                <div class="h-full aspect-square flex-shrink-0">
                    <div class="relative h-full w-full rounded-xl overflow-hidden cursor-pointer group"
                        onclick="userLibrary.triggerCustomCoverSelect(${index})">
                        ${
                          song.image
                            ? `<img src="${song.image}" class="w-full h-full object-cover">`
                            : `<span translate="no" class="material-symbols-rounded text-white/40 w-full h-full flex items-center justify-center bg-white/10">music_note</span>`
                        }
                        <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                            <span translate="no" class="material-symbols-rounded text-white text-2xl">photo_camera</span>
                        </div>
                    </div>
                </div>
                <div class="flex flex-col gap-2 justify-between flex-grow">
                    <div class="flex items-center gap-2">
                        <input type="text" value="${song.title}" placeholder="Song Name"
                            class="flex-1 h-10 px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white text-sm placeholder-white/40 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus:border-[var(--primary-color)] transition-colors"
                            onchange="userLibrary.updatePendingTitle(${index}, this.value)">
                    </div>
                    <input type="text" value="${song.artist}" placeholder="Artist Name"
                        class="w-full h-10 px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white text-sm placeholder-white/40 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus:border-[var(--primary-color)] transition-colors"
                        onchange="userLibrary.updatePendingArtist(${index}, this.value)">
                </div>
                <button onclick="userLibrary.removePendingSong(${index})"
                    class="h-full px-3 hover:bg-white/10 rounded-xl transition-all flex items-center justify-center">
                    <span translate="no" class="material-symbols-rounded text-white/60 text-xl">close</span>
                </button>
            </div>
        `;
      })
      .join("");
  }

  updatePendingTitle(index, value) {
    this.pendingSongs[index].title = value;
  }

  updatePendingArtist(index, value) {
    this.pendingSongs[index].artist = value;
  }

  removePendingSong(index) {
    this.pendingSongs.splice(index, 1);
    if (this.pendingSongs.length === 0) {
      this.uploadPreview?.classList.add("hidden");
    } else {
      this.showUploadPreview();
    }
  }

  async confirmFileUpload() {
    for (const song of this.pendingSongs) {
      let finalImage = song.image;
      if (
        finalImage &&
        !finalImage.startsWith("data:") &&
        !finalImage.startsWith("blob:")
      ) {
        finalImage = await this.resizeImageTo325(finalImage);
      } else if (finalImage && finalImage.startsWith("blob:")) {
        finalImage = await this.blobUrlToDataUrl(finalImage);
      }

      const audioUrl = song.url || song.audio;

      const songToSave = {
        id: song.id,
        title: song.title,
        artist: song.artist,
        image: finalImage,
        audio: audioUrl,
        audioBlob: song.audioBlob || null,
        source: song.source || "user",
        addedAt: Date.now(),
      };
      await window.melechDB.saveUserSong(songToSave);

      this.userSongs.push({
        id: songToSave.id,
        title: songToSave.title,
        artist: songToSave.artist,
        image: songToSave.image,
        source: songToSave.source,
        addedAt: songToSave.addedAt,
        hasAudioBlob: !!songToSave.audioBlob,
        audio: songToSave.audio,
      });
    }
    this.pendingCustomCovers = {};
    this.pendingSongs = [];
    this.uploadPreview?.classList.add("hidden");
    this.closeUploadModalFn();
    if (
      this.libraryContent &&
      !this.libraryContent.classList.contains("hidden")
    ) {
      this.renderUserSongs();
    }
  }

  async blobUrlToDataUrl(blobUrl) {
    try {
      const response = await fetch(blobUrl);
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  setupUrlUpload() {
    this.addUrlSongBtn?.addEventListener("click", () => this.addUrlSong());
    this.songUrlInput?.addEventListener("change", () =>
      this.fetchAndExtractUrlMetadata(),
    );
  }

  async fetchAndExtractUrlMetadata() {
    const url = this.songUrlInput.value.trim();
    if (!url) return;

    this.urlSongTitle.placeholder = "Preparing...";
    this.urlSongArtist.placeholder = "Preparing...";

    try {
      const metadata = await this.extractMetadataFromUrl(url);
      if (metadata) {
        if (metadata.title && !this.urlSongTitle.value) {
          this.urlSongTitle.value = metadata.title;
        }
        if (metadata.artist && !this.urlSongArtist.value) {
          this.urlSongArtist.value = metadata.artist;
        }
        if (metadata.coverBlob) {
          this.tempCoverBlob = metadata.coverBlob;

          const resizedCover = await this.processCoverImage(metadata.coverBlob);
          const coverImg = document.getElementById("urlCoverImage");
          if (coverImg) {
            coverImg.src = resizedCover;
          }
        }
      } else {
        const filename =
          url
            .split("/")
            .pop()
            ?.replace(/\.[^/.]+$/, "") || "";
        if (!this.urlSongTitle.value && filename) {
          this.urlSongTitle.value = filename.replace(/[_-]/g, " ");
        }
      }
    } catch (err) {
      const filename =
        url
          .split("/")
          .pop()
          ?.replace(/\.[^/.]+$/, "") || "";
      if (!this.urlSongTitle.value && filename) {
        this.urlSongTitle.value = filename.replace(/[_-]/g, " ");
      }
    } finally {
      this.urlSongTitle.placeholder = "Song Name";
      this.urlSongArtist.placeholder = "Artist Name";
    }
  }

  async extractMetadataFromUrl(url) {
    return new Promise(async (resolve) => {
      try {
        const response = await fetch(url, { method: "GET" });
        if (!response.ok) {
          resolve(null);
          return;
        }

        const reader = response.body.getReader();
        const chunks = [];
        let received = 0;
        const maxSize = 256 * 1024;

        while (received < maxSize) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
        }

        const buffer = new Uint8Array(received);
        let position = 0;
        for (const chunk of chunks) {
          buffer.set(chunk, position);
          position += chunk.length;
        }

        if (typeof jsmediatags === "undefined") {
          resolve(null);
          return;
        }

        const blob = new Blob([buffer]);

        jsmediatags.read(blob, {
          onSuccess: (tag) => {
            const tags = tag.tags;
            const result = { title: null, artist: null, coverBlob: null };

            if (tags.title) result.title = tags.title;
            if (tags.artist) result.artist = tags.artist;
            if (tags.picture) {
              const picture = tags.picture;
              let format = picture.format;
              if (!format.startsWith("image/")) {
                format = "image/" + format;
              }
              const byteArray = new Uint8Array(picture.data);
              result.coverBlob = new Blob([byteArray], { type: format });
            }
            resolve(result);
          },
          onError: (error) => {
            resolve(null);
          },
        });
      } catch (error) {
        resolve(null);
      }
    });
  }

  blobToDataURL(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  }

  resizeImageTo325(imageSource) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 325;
        canvas.height = 325;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, 325, 325);
        resolve(canvas.toDataURL("image/jpeg", 0.9));
      };
      img.onerror = () => resolve(null);
      if (typeof imageSource === "string") {
        img.src = imageSource;
      } else {
        const url = URL.createObjectURL(imageSource);
        img.src = url;
        img.onload = () => {
          URL.revokeObjectURL(url);
          const canvas = document.createElement("canvas");
          canvas.width = 325;
          canvas.height = 325;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, 325, 325);
          resolve(canvas.toDataURL("image/jpeg", 0.9));
        };
      }
    });
  }

  async processCoverImage(fileOrBlob) {
    return await this.resizeImageTo325(fileOrBlob);
  }

  isValidAudioUrl(url) {
    try {
      const urlObj = new URL(url);
      if (!urlObj.protocol.startsWith("http")) {
        return { valid: false, error: "upload.invalidUrlProtocol" };
      }

      const audioExtensions = [
        ".mp3",
        ".wav",
        ".ogg",
        ".flac",
        ".aac",
        ".m4a",
        ".webm",
        ".mp4",
      ];
      const hasAudioExt = audioExtensions.some((ext) =>
        urlObj.pathname.toLowerCase().endsWith(ext),
      );

      return { valid: true, hasAudioExt };
    } catch (e) {
      return { valid: false, error: "upload.invalidUrlFormat" };
    }
  }

  async validateUrlAccessible(url) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        method: "HEAD",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return { accessible: false, error: "upload.urlNotAccessible" };
      }

      const contentType = response.headers.get("content-type");
      const contentLength = response.headers.get("content-length");

      if (contentLength && parseInt(contentLength) === 0) {
        return { accessible: false, error: "upload.urlEmptyFile" };
      }

      return { accessible: true, contentType };
    } catch (err) {
      if (err.name === "AbortError") {
        return { accessible: false, error: "upload.urlTimeout" };
      }
      if (err.message?.includes("CORS")) {
        return { accessible: true, warning: "upload.urlCorsWarning" };
      }
      return { accessible: false, error: "upload.urlNetworkError" };
    }
  }

  resetUrlUploadUI() {
    this.songUrlInput.value = "";
    this.urlSongTitle.value = "";
    this.urlSongArtist.value = "";
    this.tempCoverBlob = null;

    const coverImg = document.getElementById("urlCoverImage");
    if (coverImg) {
      coverImg.src = "./resources/MelechCover.png";
    }

    this.urlSongTitle.placeholder = window.t
      ? window.t("upload.songNamePlaceholder")
      : "Song Name";
    this.urlSongArtist.placeholder = window.t
      ? window.t("upload.artistNamePlaceholder")
      : "Artist Name";
  }

  async addUrlSong() {
    const url = this.songUrlInput.value.trim();
    if (!url) {
      window.notifications?.warning("upload.urlRequired");
      return;
    }

    const urlCheck = this.isValidAudioUrl(url);
    if (!urlCheck.valid) {
      window.notifications?.error(urlCheck.error || "upload.invalidUrl");
      return;
    }

    const originalBtnText = this.addUrlSongBtn.textContent;
    this.addUrlSongBtn.textContent = window.t
      ? window.t("upload.validatingUrl")
      : "Validating URL...";
    this.addUrlSongBtn.disabled = true;

    try {
      const accessCheck = await this.validateUrlAccessible(url);
      if (!accessCheck.accessible) {
        window.notifications?.error(
          accessCheck.error || "upload.urlNotAccessible",
        );
        this.addUrlSongBtn.textContent = originalBtnText;
        this.addUrlSongBtn.disabled = false;
        return;
      }

      this.addUrlSongBtn.textContent = window.t
        ? window.t("upload.gettingMetadata")
        : "Getting metadata...";

      try {
        await this.fetchAndExtractUrlMetadata();
      } catch (metadataErr) {
        const filename =
          url
            .split("/")
            .pop()
            ?.replace(/\.[^/.]+$/, "") || "";
        if (!this.urlSongTitle.value && filename) {
          this.urlSongTitle.value = filename.replace(/[_-]/g, " ");
        }
      }

      const id = `user-url-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      let imageUrl = null;
      if (this.tempCoverBlob) {
        imageUrl = await this.processCoverImage(this.tempCoverBlob);
      }

      this.pendingSongs.push({
        id,
        title:
          this.urlSongTitle.value.trim() ||
          url
            .split("/")
            .pop()
            ?.replace(/\.[^/.]+$/, "") ||
          (window.t ? window.t("song.unknownSong") : "Unknown Song"),
        artist:
          this.urlSongArtist.value.trim() ||
          (window.t ? window.t("song.unknownArtist") : "Unknown Artist"),
        image: imageUrl,
        audio: url,
        source: "url",
      });

      this.showUploadPreview();
      this.switchUploadTab("file");
      this.resetUrlUploadUI();
    } catch (err) {
      window.notifications?.error("song.addError");
    } finally {
      this.addUrlSongBtn.textContent = originalBtnText;
      this.addUrlSongBtn.disabled = false;
    }
  }

  async loadUserSongs() {
    const allSongs = await window.melechDB.getUserSongs();

    this.userSongs = allSongs.map((song) => ({
      id: song.id,
      title: song.title,
      artist: song.artist,
      image: song.image,
      source: song.source,
      addedAt: song.addedAt,

      hasAudioBlob: !!song.audioBlob,
      isFavorite: !!song.isFavorite,
      audio: song.audio,
    }));
  }

  async getFullSongData(songId) {
    const fullSong = await window.melechDB.getUserSongById(songId);
    if (!fullSong) return null;

    return {
      ...fullSong,
      audio: fullSong.audio,
      audioBlob: fullSong.audioBlob,
    };
  }

  renderUserSongs(songs = this.userSongs) {
    this.displaySongs = Array.isArray(songs) ? songs : [];

    if (this.displaySongs.length === 0) {
      this.userSongGrid.innerHTML = `<p class="col-span-full text-center text-white/50 py-10" data-i18n="library.emptyLibraryText">This corner is the summer corner, that corner is the winter corner, in the middle is a water bottle.</p>`;
      return;
    }

    this.renderedSongs.clear();
    this.nextRenderIndex = 0;

    this.userSongGrid.innerHTML = "";

    this.setupScrollObserver();

    this.renderNextBatch();
  }

  setupScrollObserver() {
    if (this.scrollObserver) {
      this.scrollObserver.disconnect();
    }

    this.sentinel = document.createElement("div");
    this.sentinel.className = "scroll-sentinel";
    this.sentinel.style.height = "10px";
    this.sentinel.style.width = "100%";
    this.sentinel.style.gridColumn = "1 / -1";
  }

  renderNextBatch() {
    const batchSize = this.batchSize;
    const startIndex = this.nextRenderIndex;
    const endIndex = Math.min(startIndex + batchSize, this.displaySongs.length);

    if (this.sentinel && this.sentinel.parentNode) {
      this.sentinel.remove();
    }

    const fragment = document.createDocumentFragment();
    for (let i = startIndex; i < endIndex; i++) {
      const track = this.displaySongs[i];
      const cardHTML = this.getTrackHTML(track);
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = cardHTML;
      const card = tempDiv.firstElementChild;
      card.dataset.index = i;
      fragment.appendChild(card);
      this.renderedSongs.add(i);
    }
    this.userSongGrid.appendChild(fragment);

    if (window.playlistManager) {
      for (let i = startIndex; i < endIndex; i++) {
        const track = this.displaySongs[i];
        const card = this.userSongGrid.querySelector(
          `.song-card[data-id="${track.id}"]`,
        );
        if (card) {
          const favBtn = card.querySelector(".favorite-track-btn");
          if (favBtn) {
            this.updateFavoriteIcon(favBtn, track.id);
          }
        }
      }
    }

    this.nextRenderIndex = endIndex;

    if (this.nextRenderIndex < this.displaySongs.length) {
      this.userSongGrid.appendChild(this.sentinel);

      if (!this.scrollObserver) {
        this.scrollObserver = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting && entry.target === this.sentinel) {
                this.renderNextBatch();
              }
            });
          },
          {
            root: null,
            rootMargin: "200px",
            threshold: 0,
          },
        );
      }

      this.scrollObserver.observe(this.sentinel);
    }
  }

  setupIntersectionObserver() {
    this.setupScrollObserver();
  }

  renderVisibleSongs() {}

  renderSongAtIndex(index) {}

  setupEventDelegation() {
    if (this._delegationSetup) return;
    this._delegationSetup = true;

    this.userSongGrid.addEventListener("click", async (e) => {
      const card = e.target.closest(".song-card");
      if (!card) return;

      const trackId = card.getAttribute("data-id");
      const track = this.userSongs.find((s) => s.id === trackId);
      if (!track) return;

      if (e.target.closest(".add-to-playlist-btn")) {
        e.stopPropagation();
        const fullTrack = await this.getFullSongData(track.id);
        if (fullTrack && window.addTrackToPlaylist) {
          window.addTrackToPlaylist(fullTrack);
        }
        return;
      }

      if (e.target.closest(".favorite-track-btn")) {
        e.stopPropagation();
        this.handleFavoriteClick(track, card);
        return;
      }

      if (e.target.closest(".play-track-btn")) {
        e.stopPropagation();
        const fullTrack = await this.getFullSongData(track.id);
        window.dispatchEvent(
          new CustomEvent("playTrack", { detail: fullTrack || track }),
        );
        return;
      }

      const playButtonOverlay = card.querySelector(".play-button");
      const isPlayButtonHidden =
        playButtonOverlay &&
        window.getComputedStyle(playButtonOverlay).display === "none";
      if (isPlayButtonHidden) {
        const fullTrack = await this.getFullSongData(track.id);
        window.dispatchEvent(
          new CustomEvent("playTrack", { detail: fullTrack || track }),
        );
      }
    });

    this.userSongGrid.addEventListener("contextmenu", (e) => {
      const card = e.target.closest(".song-card");
      if (!card) return;

      const trackId = card.getAttribute("data-id");
      e.preventDefault();
      this.showContextMenu(e.clientX, e.clientY, trackId);
    });
  }

  async handleFavoriteClick(track, card) {
    if (!track || !window.playlistManager) return;

    const favBtn = card.querySelector(".favorite-track-btn");
    const trackId = track.id;
    const currentIsFav =
      window.playlistManager?.isTrackFavorite(trackId) || false;
    const newIsFav = !currentIsFav;

    this.updateFavoriteIcon(favBtn, trackId, newIsFav);

    try {
      const fullTrack = await this.getFullSongData(track.id);
      const isNowFavorite = await window.playlistManager.toggleFavorite(
        fullTrack || track,
      );
      if (isNowFavorite !== newIsFav) {
        this.updateFavoriteIcon(favBtn, trackId, isNowFavorite);
      }
    } catch (error) {
      this.updateFavoriteIcon(favBtn, trackId, currentIsFav);
    }
  }

  addSongToGrid(track) {
    if (!this.userSongs.find((s) => s.id === track.id)) {
      this.userSongs.unshift({
        ...track,
        isFavorite: true,
        addedAt: Date.now(),
      });
    }

    const emptyMsg = this.userSongGrid.querySelector(
      '[data-i18n="library.emptyLibraryText"]',
    );
    if (emptyMsg) {
      this.userSongGrid.innerHTML = "";
    }

    if (this.userSongGrid.querySelector(`.song-card[data-id="${track.id}"]`))
      return;

    const cardHTML = this.getTrackHTML(track);
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = cardHTML;
    const card = tempDiv.firstElementChild;

    if (this.userSongGrid.firstChild) {
      this.userSongGrid.insertBefore(card, this.userSongGrid.firstChild);
    } else {
      this.userSongGrid.appendChild(card);
    }

    const favBtn = card.querySelector(".favorite-track-btn");
    if (favBtn) this.updateFavoriteIcon(favBtn, track.id, true);
  }

  removeSongFromGrid(trackId) {
    this.userSongs = this.userSongs.filter((s) => s.id !== trackId);
    const card = this.userSongGrid.querySelector(
      `.song-card[data-id="${trackId}"]`,
    );
    if (card) {
      card.style.transition = "all 0.3s ease";
      card.style.opacity = "0";
      card.style.transform = "scale(0.9)";

      setTimeout(() => {
        if (card.parentNode) card.remove();

        if (
          this.userSongs.length === 0 &&
          this.userSongGrid.children.length === 0
        ) {
          this.userSongGrid.innerHTML = `<p class="col-span-full text-center text-white/50 py-10" data-i18n="library.emptyLibraryText">This corner is the summer corner, that corner is the winter corner, in the middle is a water bottle.</p>`;
        }
      }, 300);
    }
  }

  getTrackHTML(track) {
    const audioUrl = track.audio;
    const isFavorite =
      window.playlistManager?.isTrackFavorite(track.id) || false;
    const favIconClass = isFavorite ? "text-red-500" : "text-white/40";
    const favFill = isFavorite ? "'FILL' 1" : "'FILL' 0";
    return `
            <div class="song-card bg-white/5 p-3 md:p-4 rounded-2xl fade-in" data-id="${track.id}" data-audio="${audioUrl}">
                <div class="relative aspect-square mb-3 overflow-hidden rounded-xl bg-white/10">
                    ${
                      track.source !== "radio"
                        ? `
                    <button class="add-to-playlist-btn" data-id="${track.id}" title="Add to playlist">
                        <span translate="no" class="material-symbols-rounded !text-lg">playlist_add</span>
                    </button>
                    `
                        : ""
                    }
                    <button class="favorite-track-btn" data-id="${track.id}" title="Add to favorites">
                        <span translate="no" class="material-symbols-rounded !text-lg ${favIconClass}" style="font-variation-settings: ${favFill}">favorite</span>
                    </button>
                    ${
                      track.image
                        ? `<img src="${track.image}" alt="${track.title}" class="w-full h-full object-cover" loading="lazy" decoding="async">`
                        : `<div class="w-full h-full flex items-center justify-center bg-white/5">
                        <span translate="no" class="material-symbols-rounded !text-5xl text-white/20">music_note</span>
                    </div>`
                    }
                    <div class="track-loading-overlay hidden" id="loading-${track.id}">
                        <div class="track-loading-spinner"></div>
                    </div>
                    <div class="play-button absolute inset-0 flex items-center justify-center bg-black/50">
                        <button class="play-track-btn w-12 h-12 bg-primary-color rounded-full flex items-center justify-center text-white shadow-lg" style="background-color: var(--primary-color);">
                            <span translate="no" class="material-symbols-rounded !text-3xl">play_arrow</span>
                        </button>
                    </div>
                </div>
                <h3 class="text-white font-bold truncate text-sm md:text-base">${track.title}</h3>
                <p class="text-white/50 text-xs md:text-sm truncate">${track.artist}</p>
            </div>
        `;
  }

  updateFavoriteIcon(btn, trackId, isFav = null) {
    const isFavorite =
      isFav !== null
        ? isFav
        : window.playlistManager?.isTrackFavorite(trackId) || false;
    const icon = btn.querySelector(".material-symbols-rounded");
    if (icon) {
      icon.style.fontVariationSettings = isFavorite ? "'FILL' 1" : "'FILL' 0";
      if (isFavorite) {
        icon.classList.add("text-red-500");
        icon.classList.remove("text-white/40");
      } else {
        icon.classList.remove("text-red-500");
        icon.classList.add("text-white/40");
      }
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.userLibrary = new UserLibrary();
  window.addEventListener("favoritesUpdated", (e) => {
    const { trackId, isFavorite } = e.detail;

    if (!window.userLibrary) return;

    if (trackId.startsWith("radio-") && !isFavorite) {
      window.userLibrary.removeSongFromGrid(trackId);
      return;
    }

    document
      .querySelectorAll(
        `#userSongGrid .song-card[data-id="${trackId}"] .favorite-track-btn`,
      )
      .forEach((favBtn) => {
        if (window.userLibrary) {
          window.userLibrary.updateFavoriteIcon(favBtn, trackId, isFavorite);
        }
      });
  });

  window.addEventListener("trackLoading", (e) => {
    const { trackId, isLoading } = e.detail;
    if (!trackId) {
      document
        .querySelectorAll("#userSongGrid .song-card .track-loading-overlay")
        .forEach((overlay) => {
          overlay.classList.add("hidden");
        });
      return;
    }
    const loadingOverlay = document.getElementById(`loading-${trackId}`);
    if (loadingOverlay && loadingOverlay.closest("#userSongGrid")) {
      if (isLoading) {
        loadingOverlay.classList.remove("hidden");
      } else {
        loadingOverlay.classList.add("hidden");
      }
    }
  });
});
