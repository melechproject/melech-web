class PlaylistManager {
  constructor() {
    this.playlists = [];
    this.currentPlaylistId = null;
    this.draggedItem = null;
    this.isShuffle = false;
    this.newPlaylistCoverImage = null;
    this.contextMenuTargetId = null;
    this.tempCoverImage = null;

    this.initElements();

    this.playlistOverlay?.classList.add("transition-none");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.playlistOverlay?.classList.remove("transition-none");
      });
    });
    this.initEventListeners();

    this.originalTrackOrder = null;
    this.shuffledTrackOrder = null;

    this.loadPlaylists().then(() => {
      this.renderPlaylistList();
      window.dispatchEvent(new CustomEvent("playlistsLoaded"));
    });

    window.addEventListener("playTrack", (e) => {
      if (this.isShuffle && window.currentPlaylist) {
        const track = e.detail;
        const index = window.currentPlaylist.tracks.findIndex(
          (t) => t.id === track.id,
        );
        if (index !== -1) {
          window.currentPlaylist.currentIndex = index;
        }
      }
    });

    window.addEventListener("libraryImported", async (e) => {
      const { songsAdded, playlistsAdded } = e.detail;
      this.playlists = await this.loadPlaylists();
      this.renderPlaylistList();
      if (this.currentPlaylistId) {
        this.renderDetailTracks();
      }

      if (window.userLibrary) {
        await window.userLibrary.loadUserSongs();
        window.userLibrary.renderUserSongs();
      }
    });

    window.addEventListener("playPauseStateChanged", (e) => {
      this.updatePlaylistActionButtons();
    });

    window.addEventListener("favoritesUpdated", async (e) => {
      const { trackId, isFavorite } = e.detail;
      const favs = this.getFavoritesPlaylist();
      if (!favs) return;

      if (!favs.trackIds) {
        favs.trackIds = favs.tracks?.map((t) => t.id) || [];
      }

      if (this.currentPlaylistId === favs.id) {
        const resolvedTracks =
          (await window.melechDB?.resolveTrackIds(favs.trackIds)) || [];
        if (this.isShuffle && this.shuffledTrackOrder) {
          if (isFavorite) {
            this.shuffledTrackOrder =
              this.createShuffledTrackOrder(resolvedTracks);
          } else {
            const shuffledIndex = this.shuffledTrackOrder.findIndex(
              (t) => t.id === trackId,
            );
            if (shuffledIndex !== -1) {
              this.shuffledTrackOrder.splice(shuffledIndex, 1);
            }
          }
        }

        if (window.currentPlaylist?.id === favs.id) {
          window.currentPlaylist.tracks = resolvedTracks;
          window.currentPlaylist.trackIds = [...favs.trackIds];
        }

        await this.renderDetailTracks();
      }

      this.renderPlaylistList();
    });
  }

  updatePlaylistActionButtons() {
    const currentPlaylistId = window.currentPlaylist?.id;
    const isMusicPlaying = window.getIsPlaying?.() || false;
    this.playlistList
      .querySelectorAll(".playlist-action-btn.play")
      .forEach((btn) => {
        const playlistId = btn.dataset.id;
        const isActive = currentPlaylistId === playlistId;
        const icon = btn.querySelector(".material-symbols-rounded");

        if (isActive && isMusicPlaying) {
          btn.classList.add("active");
          if (icon) icon.textContent = "pause";
        } else {
          btn.classList.remove("active");
          if (icon) icon.textContent = "play_arrow";
        }
      });
  }

  initElements() {
    this.playlistOverlay = document.getElementById("playlistOverlay");
    this.playlistBackdrop = document.getElementById("playlistOverlayBackdrop");
    this.playlistMenuBtn = document.getElementById("playlistMenuBtn");
    this.playlistCloseBtn = document.getElementById("playlistCloseBtn");
    this.createPlaylistBtn = document.getElementById("createPlaylistBtn");
    this.playlistList = document.getElementById("playlistList");

    this.createPlaylistModal = document.getElementById("createPlaylistModal");
    this.playlistNameInput = document.getElementById("playlistNameInput");
    this.confirmCreatePlaylist = document.getElementById(
      "confirmCreatePlaylist",
    );
    this.cancelCreatePlaylist = document.getElementById("cancelCreatePlaylist");
    this.createPlaylistBackdrop = document.getElementById(
      "createPlaylistBackdrop",
    );

    this.createPlaylistCoverInput = document.getElementById(
      "createPlaylistCoverInput",
    );
    this.createPlaylistCoverBtn = document.getElementById(
      "createPlaylistCoverBtn",
    );
    this.createPlaylistCoverPreview = document.getElementById(
      "createPlaylistCoverPreview",
    );
    this.createPlaylistCoverImg = document.getElementById(
      "createPlaylistCoverImg",
    );
    this.createPlaylistCoverPlaceholder = document.getElementById(
      "createPlaylistCoverPlaceholder",
    );

    this.playlistDetailPanel = document.getElementById("playlistDetailPanel");
    this.playlistDetailBackBtn = document.getElementById(
      "playlistDetailBackBtn",
    );
    this.playlistDetailTitle = document.getElementById("playlistDetailTitle");
    this.playlistDetailCount = document.getElementById("playlistDetailCount");
    this.playlistDetailTracks = document.getElementById("playlistDetailTracks");
    this.playlistDetailPlayBtn = document.getElementById(
      "playlistDetailPlayBtn",
    );
    this.deletePlaylistBtn = document.getElementById("deletePlaylistBtn");

    this.addToPlaylistModal = document.getElementById("addToPlaylistModal");
    this.addToPlaylistList = document.getElementById("addToPlaylistList");
    this.cancelAddToPlaylist = document.getElementById("cancelAddToPlaylist");
    this.addToPlaylistBackdrop = document.getElementById(
      "addToPlaylistBackdrop",
    );

    this.contextMenu = document.getElementById("playlistContextMenu");
    this.contextEditBtn = document.getElementById("contextEditPlaylist");
    this.contextShareBtn = document.getElementById("contextSharePlaylist");
    this.contextExportBtn = document.getElementById("contextExportPlaylist");
    this.contextDeleteBtn = document.getElementById("contextDeletePlaylist");

    this.editPlaylistModal = document.getElementById("editPlaylistModal");
    this.editPlaylistBackdrop = document.getElementById("editPlaylistBackdrop");
    this.editPlaylistNameInput = document.getElementById(
      "editPlaylistNameInput",
    );
    this.editPlaylistIdInput = document.getElementById("editPlaylistId");
    this.editPlaylistCoverInput = document.getElementById(
      "editPlaylistCoverInput",
    );
    this.editPlaylistCoverPreview = document.getElementById(
      "editPlaylistCoverPreview",
    );
    this.editPlaylistCoverImg = document.getElementById("editPlaylistCoverImg");
    this.editPlaylistCoverPlaceholder = document.getElementById(
      "editPlaylistCoverPlaceholder",
    );
    this.confirmEditPlaylist = document.getElementById("confirmEditPlaylist");
    this.cancelEditPlaylist = document.getElementById("cancelEditPlaylist");
    this.importPlaylistBtn = document.getElementById("importPlaylistBtn");
    this.playlistFabBtn = document.getElementById("playlistFabBtn");
    this.playlistFabContainer = document.getElementById("playlistFabContainer");
    this.playlistFabActions = document.getElementById("playlistFabActions");
    this.playlistFabIcon = document.getElementById("playlistFabIcon");

    this.importLibraryBtn = document.getElementById("importLibraryBtn");
    this.exportLibraryBtn = document.getElementById("exportLibraryBtn");
    this.jukehostStandaloneBtn = document.getElementById(
      "jukehostStandaloneBtn",
    );

    this.pendingTrack = null;
    this.contextMenuTargetId = null;
    this.tempCoverImage = null;
  }

  initEventListeners() {
    this.playlistCloseBtn?.addEventListener("click", () =>
      this.closePlaylistMenu(),
    );
    this.playlistBackdrop?.addEventListener("click", () =>
      this.closePlaylistMenu(),
    );

    this.createPlaylistBtn?.addEventListener("click", () => {
      this.closeFabMenu();
      this.openCreateModal();
    });
    this.importPlaylistBtn?.addEventListener("click", () => {
      this.closeFabMenu();
      if (window.exportImportManager) {
        window.exportImportManager.openImportPlaylistModal();
      }
    });

    this.jukehostStandaloneBtn?.addEventListener("click", () => {
      if (window.jukehostIntegration) {
        window.jukehostIntegration.redirectToJukehost();
      }
    });

    this.playlistFabBtn?.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleFabMenu();
      },
      { passive: false },
    );

    document.addEventListener("click", (e) => {
      if (!this.playlistFabContainer?.classList.contains("expanded")) return;
      if (!this.playlistFabContainer?.contains(e.target)) {
        this.closeFabMenu();
      }
    });
    this.confirmCreatePlaylist?.addEventListener("click", () =>
      this.createPlaylist(),
    );

    this.createPlaylistCoverBtn?.addEventListener("click", () => {
      this.createPlaylistCoverInput?.click();
    });

    this.createPlaylistCoverPreview?.addEventListener("click", () => {
      this.createPlaylistCoverInput?.click();
    });

    this.createPlaylistCoverInput?.addEventListener("change", (e) => {
      this.handleCreateCoverImage(e);
    });
    this.cancelCreatePlaylist?.addEventListener("click", () =>
      this.closeCreateModal(),
    );
    this.createPlaylistBackdrop?.addEventListener("click", () =>
      this.closeCreateModal(),
    );

    this.playlistNameInput?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.createPlaylist();
    });

    this.playlistDetailBackBtn?.addEventListener("click", () =>
      this.closeDetailPanel(),
    );
    this.playlistDetailPlayBtn?.addEventListener(
      "click",
      async () => await this.playCurrentPlaylist(),
    );
    this.deletePlaylistBtn?.addEventListener("click", () =>
      this.deleteCurrentPlaylist(),
    );

    this.cancelAddToPlaylist?.addEventListener("click", () =>
      this.closeAddToPlaylistModal(),
    );
    this.addToPlaylistBackdrop?.addEventListener("click", () =>
      this.closeAddToPlaylistModal(),
    );

    this.contextEditBtn?.addEventListener("click", () => {
      if (this.contextMenuTargetId) {
        this.openEditModal(this.contextMenuTargetId);
        this.hideContextMenu();
      }
    });

    this.contextShareBtn?.addEventListener("click", async () => {
      if (this.contextMenuTargetId) {
        await this.sharePlaylist(this.contextMenuTargetId);
        this.hideContextMenu();
      }
    });

    this.contextExportBtn?.addEventListener("click", async () => {
      if (this.contextMenuTargetId) {
        await this.exportPlaylist(this.contextMenuTargetId);
        this.hideContextMenu();
      }
    });

    this.contextDeleteBtn?.addEventListener("click", () => {
      if (this.contextMenuTargetId) {
        this.deletePlaylist(this.contextMenuTargetId);
        this.hideContextMenu();
      }
    });

    this.contextDownloadBtn = document.getElementById("contextDownloadOffline");
    this.contextDownloadBtn?.addEventListener("click", async () => {
      if (this.contextMenuTargetId) {
        const action = this.contextDownloadBtn.dataset.action;
        if (action === "remove") {
          await this.removeOfflinePlaylist(this.contextMenuTargetId);
        } else {
          await this.downloadOfflinePlaylist(this.contextMenuTargetId);
        }
        this.hideContextMenu();
      }
    });

    this.importLibraryBtn?.addEventListener("click", () => {
      if (window.exportImportManager) {
        window.exportImportManager.openImportModal();
      }
    });

    this.exportLibraryBtn?.addEventListener("click", () => {
      if (window.exportImportManager) {
        window.exportImportManager.exportLibrary();
      }
    });

    document.addEventListener("click", (e) => {
      if (this.contextMenu && !this.contextMenu.contains(e.target)) {
        this.hideContextMenu();
      }
    });

    this.editPlaylistCoverPreview?.addEventListener("click", () => {
      this.editPlaylistCoverInput?.click();
    });

    this.editPlaylistCoverInput?.addEventListener("change", (e) => {
      this.handleCoverImageSelect(e);
    });

    this.confirmEditPlaylist?.addEventListener("click", () => {
      this.savePlaylistEdit();
    });

    this.cancelEditPlaylist?.addEventListener("click", () => {
      this.closeEditModal();
    });

    this.editPlaylistBackdrop?.addEventListener("click", () => {
      this.closeEditModal();
    });

    this.editPlaylistNameInput?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.savePlaylistEdit();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (this.editPlaylistModal?.classList.contains("open")) {
          this.closeEditModal();
        } else if (this.addToPlaylistModal?.classList.contains("open")) {
          this.closeAddToPlaylistModal();
        } else if (this.createPlaylistModal?.classList.contains("open")) {
          this.closeCreateModal();
        } else if (this.playlistDetailPanel?.classList.contains("open")) {
          this.closeDetailPanel();
        } else if (this.playlistOverlay?.classList.contains("open")) {
          this.closePlaylistMenu();
        }
        this.hideContextMenu();
      }
    });

    document.addEventListener("click", (e) => {
      const isInsideOverlay = this.playlistOverlay?.contains(e.target);
      const isInsideDetail = this.playlistDetailPanel?.contains(e.target);
      const isMenuBtn = this.playlistMenuBtn?.contains(e.target);

      const fixedBtn = document.getElementById("fixedPlaylistMenuBtn");
      const isFixedMenuBtn = fixedBtn?.contains(e.target);

      if (isInsideOverlay || isInsideDetail || isMenuBtn || isFixedMenuBtn) {
        return;
      }

      if (this.playlistOverlay?.classList.contains("open")) {
        this.closePlaylistMenu();
      }

      if (this.playlistDetailPanel?.classList.contains("open")) {
        this.playlistDetailPanel.classList.remove("open");
        this.currentPlaylistId = null;
        document.body.style.overflow = "";
      }
    });
  }

  async loadPlaylists() {
    try {
      this.playlists = (await window.melechDB?.getPlaylists()) || [];
    } catch {
      this.playlists = [];
    }
    return this.playlists;
  }

  async savePlaylists() {
    await window.melechDB?.savePlaylists(this.playlists);
  }

  openPlaylistMenu() {
    this.playlistOverlay?.classList.add("open");
    this.playlistMenuBtn?.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
    this.renderPlaylistList();
  }

  closePlaylistMenu() {
    this.playlistOverlay?.classList.remove("open");
    this.playlistMenuBtn?.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
    this.closeFabMenu();
  }

  toggleFabMenu() {
    if (this._fabToggling) return;
    this._fabToggling = true;

    const isExpanded =
      this.playlistFabContainer?.classList.contains("expanded");
    if (isExpanded) {
      this.closeFabMenu();
    } else {
      this.openFabMenu();
    }

    setTimeout(() => {
      this._fabToggling = false;
    }, 350);
  }

  openFabMenu() {
    this.playlistFabContainer?.classList.add("expanded");
    this.playlistFabContainer?.style.setProperty("width", "280px");
    if (this.playlistFabActions) {
      this.playlistFabActions.style.setProperty("max-width", "220px");
      this.playlistFabActions.style.setProperty("opacity", "1");
    }
  }

  closeFabMenu() {
    this.playlistFabContainer?.classList.remove("expanded");
    this.playlistFabContainer?.style.setProperty("width", "56px");
    if (this.playlistFabActions) {
      this.playlistFabActions.style.setProperty("max-width", "0");
      this.playlistFabActions.style.setProperty("opacity", "0");
    }
  }

  openCreateModal() {
    this.createPlaylistModal?.classList.add("open");
    this.playlistNameInput?.focus();
  }

  closeCreateModal() {
    this.createPlaylistModal?.classList.remove("open");
    if (this.playlistNameInput) this.playlistNameInput.value = "";
    this.newPlaylistCoverImage = null;
    if (this.createPlaylistCoverInput) {
      this.createPlaylistCoverInput.value = "";
    }
    if (this.createPlaylistCoverImg) {
      this.createPlaylistCoverImg.src = "./resources/MelechCover.png";
    }
  }

  async handleCreateCoverImage(event) {
    const file = event.target.files[0];
    if (!file) return;
    const resizedImage = await this.resizeImage(file, 325);
    if (resizedImage) {
      this.newPlaylistCoverImage = resizedImage;
      if (this.createPlaylistCoverImg) {
        this.createPlaylistCoverImg.src = resizedImage;
      }
    }
  }

  resizeImage(file, maxDimension) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxDimension) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            }
          } else {
            if (height > maxDimension) {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async showContextMenu(x, y, playlistId) {
    if (!this.contextMenu) return;

    this.contextMenuTargetId = playlistId;

    const playlist = this.playlists.find((p) => p.id === playlistId);
    let allOffline = false;
    let hasDownloadable = false;
    if (playlist && playlist.trackIds && playlist.trackIds.length > 0) {
      const tracks =
        (await window.melechDB?.resolveTrackIds(playlist.trackIds)) || [];
      const downloadableUrls = tracks
        .filter(
          (t) =>
            t.audio &&
            !t.audio.startsWith("blob:") &&
            !t.audio.startsWith("data:") &&
            !t.audioBlob,
        )
        .map((t) => t.audio);

      if (downloadableUrls.length > 0) {
        hasDownloadable = true;
        allOffline =
          await window.melechDB?.areAllTracksOfflineByUrls(downloadableUrls);
      } else {
        allOffline = true;
      }
    }

    const downloadBtn = document.getElementById("contextDownloadOffline");
    if (downloadBtn) {
      const icon = downloadBtn.querySelector(".material-symbols-rounded");
      const textSpan = downloadBtn.querySelector("span[data-i18n]");

      if (allOffline && hasDownloadable) {
        icon.textContent = "delete";
        const fallbackText = "Remove Offline";
        textSpan.textContent = window.t
          ? window.t("playlist.removeOffline") || fallbackText
          : fallbackText;
        downloadBtn.dataset.action = "remove";
        textSpan.dataset.i18n = "playlist.removeOffline";
        downloadBtn.style.display = "flex";
      } else if (hasDownloadable) {
        icon.textContent = "android_wifi_3_bar_off";
        const fallbackText = "Download Offline";
        textSpan.textContent = window.t
          ? window.t("playlist.downloadOffline") || fallbackText
          : fallbackText;
        downloadBtn.dataset.action = "download";
        textSpan.dataset.i18n = "playlist.downloadOffline";
        downloadBtn.style.display = "flex";
      } else {
        downloadBtn.style.display = "none";
      }
    }

    const menuWidth = 180;
    const menuHeight = 150;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    let posX = x;
    let posY = y;

    if (posX + menuWidth > windowWidth) {
      posX = windowWidth - menuWidth - 10;
    }
    if (posY + menuHeight > windowHeight) {
      posY = windowHeight - menuHeight - 10;
    }

    this.contextMenu.style.left = `${posX}px`;
    this.contextMenu.style.top = `${posY}px`;
    this.contextMenu.style.display = "block";

    requestAnimationFrame(() => {
      this.contextMenu.classList.remove(
        "hidden",
        "opacity-0",
        "pointer-events-none",
      );
      this.contextMenu.classList.add("opacity-100", "pointer-events-auto");
    });
  }

  hideContextMenu() {
    if (!this.contextMenu) return;
    this.contextMenu.classList.add(
      "hidden",
      "opacity-0",
      "pointer-events-none",
    );
    this.contextMenu.classList.remove("opacity-100", "pointer-events-auto");
    setTimeout(() => {
      this.contextMenu.style.display = "none";
      this.contextMenuTargetId = null;
    }, 200);
  }

  openEditModal(playlistId) {
    const playlist = this.playlists.find((p) => p.id === playlistId);
    if (!playlist || !this.editPlaylistModal) return;

    this.editPlaylistIdInput.value = playlistId;
    this.editPlaylistNameInput.value = playlist.name;

    this.tempCoverImage = null;
    if (playlist.coverImage) {
      this.editPlaylistCoverImg.src = playlist.coverImage;
      this.editPlaylistCoverImg.classList.remove("hidden");
      this.editPlaylistCoverPlaceholder.classList.add("hidden");
    } else {
      this.editPlaylistCoverImg.classList.add("hidden");
      this.editPlaylistCoverPlaceholder.classList.remove("hidden");
    }

    this.editPlaylistModal.classList.remove("opacity-0", "pointer-events-none");
    this.editPlaylistModal.classList.add("opacity-100", "pointer-events-auto");

    const innerDiv = this.editPlaylistModal.querySelector(".transform");
    if (innerDiv) {
      innerDiv.classList.remove("scale-95");
      innerDiv.classList.add("scale-100");
    }

    this.editPlaylistNameInput?.focus();
  }

  closeEditModal() {
    if (!this.editPlaylistModal) return;

    this.editPlaylistModal.classList.remove(
      "opacity-100",
      "pointer-events-auto",
    );
    this.editPlaylistModal.classList.add("opacity-0", "pointer-events-none");

    const innerDiv = this.editPlaylistModal.querySelector(".transform");
    if (innerDiv) {
      innerDiv.classList.remove("scale-100");
      innerDiv.classList.add("scale-95");
    }

    this.editPlaylistNameInput.value = "";
    this.editPlaylistIdInput.value = "";
    this.tempCoverImage = null;
    if (this.editPlaylistCoverInput) this.editPlaylistCoverInput.value = "";
  }

  async handleCoverImageSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const resizedImage = await this.resizeImage(file, 325);
    if (resizedImage) {
      this.tempCoverImage = resizedImage;
      this.editPlaylistCoverImg.src = this.tempCoverImage;
      this.editPlaylistCoverImg.classList.remove("hidden");
      this.editPlaylistCoverPlaceholder.classList.add("hidden");
    }
  }

  async savePlaylistEdit() {
    const playlistId = this.editPlaylistIdInput?.value;
    const newName = this.editPlaylistNameInput?.value.trim();

    if (!playlistId || !newName) return;

    const playlist = this.playlists.find((p) => p.id === playlistId);
    if (!playlist) return;

    playlist.name = newName;
    if (this.tempCoverImage) {
      playlist.coverImage = this.tempCoverImage;
    }

    await this.savePlaylists();
    this.closeEditModal();
    this.renderPlaylistList();

    window.notifications?.success("playlist.editSuccess");

    if (this.currentPlaylistId === playlistId) {
      this.openDetailPanel(playlistId);
    }
  }

  async downloadOfflinePlaylist(playlistId) {
    const playlist = this.playlists.find((p) => p.id === playlistId);
    if (!playlist) return;

    if (!playlist.trackIds) {
      playlist.trackIds = playlist.tracks?.map((t) => t.id) || [];
    }
    const tracks =
      (await window.melechDB?.resolveTrackIds(playlist.trackIds)) || [];

    const downloadableUrls = tracks
      .filter(
        (t) =>
          t.audio &&
          !t.audio.startsWith("blob:") &&
          !t.audio.startsWith("data:") &&
          !t.audioBlob,
      )
      .map((t) => t.audio);

    if (downloadableUrls.length === 0) {
      window.notifications?.success("playlist.allAlreadyOffline");
      return;
    }

    let downloadedCount = 0;
    const total = downloadableUrls.length;

    window.notifications?.success("playlist.downloadStarted");
    if (window.exportImportManager) {
      const msg = window.t
        ? window.t("playlist.downloadingOffline", { current: 0, total })
        : `Downloading... (0/${total})`;
      if (window.exportImportManager._showBackupOverlay) {
        window.exportImportManager._showBackupOverlay(msg);
      } else if (window.exportImportManager._showProgress) {
        window.exportImportManager._showProgress(msg);
      }
    }

    for (const url of downloadableUrls) {
      const existing = await window.melechDB.getOfflineTrack(url);
      if (!existing) {
        try {
          const response = await fetch(url);
          if (response.ok) {
            const blob = await response.blob();
            if (blob.size > 0) {
              await window.melechDB.saveOfflineTrack(url, blob);
            }
          }
        } catch (e) { console.error(e); }
      }
      downloadedCount++;
      if (window.exportImportManager) {
        const updateMsg = window.t
          ? window.t("playlist.downloadingOffline", {
              current: downloadedCount,
              total,
            })
          : `Downloading... (${downloadedCount}/${total})`;
        window.exportImportManager._updateProgressText?.(updateMsg);
      }
    }

    if (window.exportImportManager) {
      if (window.exportImportManager._hideBackupOverlay) {
        window.exportImportManager._hideBackupOverlay();
      } else if (window.exportImportManager._hideProgress) {
        window.exportImportManager._hideProgress();
      }
    }
    window.notifications?.success("playlist.downloadSuccess");
  }

  async removeOfflinePlaylist(playlistId) {
    const playlist = this.playlists.find((p) => p.id === playlistId);
    if (!playlist) return;

    if (!playlist.trackIds) {
      playlist.trackIds = playlist.tracks?.map((t) => t.id) || [];
    }
    const tracks =
      (await window.melechDB?.resolveTrackIds(playlist.trackIds)) || [];

    const urls = tracks
      .filter(
        (t) =>
          t.audio &&
          !t.audio.startsWith("blob:") &&
          !t.audio.startsWith("data:") &&
          !t.audioBlob,
      )
      .map((t) => t.audio);

    for (const url of urls) {
      await window.melechDB.removeOfflineTrack(url);
    }

    window.notifications?.success("playlist.removeOfflineSuccess");
  }

  async exportPlaylist(playlistId) {
    this.hideContextMenu();

    const playlist = this.playlists.find((p) => p.id === playlistId);
    if (!playlist) return;

    if (!playlist.trackIds) {
      playlist.trackIds = playlist.tracks?.map((t) => t.id) || [];
    }

    const tracks =
      (await window.melechDB?.resolveTrackIds(playlist.trackIds)) || [];

    const totalTracks = tracks.length;
    let processedCount = 0;

    if (totalTracks > 0 && window.exportImportManager) {
      window.exportImportManager._showProgress?.(
        `Preparing playlist... (0/${totalTracks})`,
      );
    }

    const processedTracks = await Promise.all(
      tracks.map(async (t) => {
        let audio = "";
        if (t.audioBlob instanceof Blob) {
          audio =
            (await window.exportImportManager?.blobToDataURIFromBlob(
              t.audioBlob,
            )) || "";
        } else if (t.audioDataUrl) {
          audio = t.audioDataUrl;
        } else if (t.audio && !t.audio.startsWith("blob:")) {
          audio = t.audio;
        }
        processedCount++;
        if (
          (processedCount % 3 === 0 || processedCount === totalTracks) &&
          window.exportImportManager
        ) {
          window.exportImportManager._updateProgressText?.(
            `Converting audio... (${processedCount}/${totalTracks})`,
          );
        }
        return {
          title: t.title,
          artist: t.artist,
          audio: audio,
          image: t.image,
        };
      }),
    );

    window.exportImportManager?._hideProgress?.();

    const exportData = {
      name: playlist.name,
      createdAt: playlist.createdAt,
      tracks: processedTracks,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/mplaylist",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${playlist.name.replace(/[^a-z0-9]/gi, "_")}.mplaylist`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async sharePlaylist(playlistId) {
    const playlist = this.playlists.find((p) => p.id === playlistId);
    if (!playlist) return;

    if (!playlist.trackIds) {
      playlist.trackIds = playlist.tracks?.map((t) => t.id) || [];
    }

    const tracks =
      (await window.melechDB?.resolveTrackIds(playlist.trackIds)) || [];

    const shareData = {
      id: playlist.id,
      name: playlist.name,
      songs: tracks.map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        image: t.image,
        audio: t.audio,
        audioDataUrl: t.audioDataUrl,
        source: t.source || "library",
      })),
      createdAt: playlist.createdAt,
      coverImage: playlist.coverImage,
    };

    if (window.playlistShare) {
      window.playlistShare.openShareModal(shareData);
    }
  }

  async createPlaylist() {
    const name = this.playlistNameInput?.value.trim();
    if (!name) return;

    await this._createPlaylistObject(
      name,
      null,
      false,
      this.newPlaylistCoverImage,
    );
    this.closeCreateModal();
    this.renderPlaylistList();
  }

  async _createPlaylistObject(
    name,
    id = null,
    isFavorites = false,
    coverImage = null,
  ) {
    const playlist = {
      id: id || "pl_" + Date.now().toString(36),
      name: name,
      trackIds: [],
      tracks: [],
      createdAt: Date.now(),
      isFavorites: isFavorites,
      coverImage: coverImage,
    };

    this.playlists.push(playlist);
    await this.savePlaylists();
    return playlist;
  }

  async toggleFavorite(trackOrId) {
    const trackId = typeof trackOrId === "string" ? trackOrId : trackOrId.id;
    const isCurrentlyFavorite = this.isTrackFavorite(trackId);
    const willBeFavorite = !isCurrentlyFavorite;

    if (
      typeof trackOrId === "object" &&
      trackOrId &&
      trackOrId.id &&
      window.melechDB
    ) {
      if (trackOrId.source === "radio") {
        if (willBeFavorite) {
          await window.melechDB.saveUserSong({
            id: trackOrId.id,
            title: trackOrId.title,
            artist: trackOrId.artist,
            image: trackOrId.image,
            audio: trackOrId.audio,
            source: "radio",
            addedAt: Date.now(),
            isFavorite: true,
          });

          if (window.userLibrary) {
            window.userLibrary.addSongToGrid({
              id: trackOrId.id,
              title: trackOrId.title,
              artist: trackOrId.artist,
              image: trackOrId.image,
              audio: trackOrId.audio,
              source: "radio",
              addedAt: Date.now(),
              isFavorite: true,
            });
          }
        } else {
          await window.melechDB.deleteUserSong(trackId);
          await this.removeTrackFromAllPlaylists(trackId);

          if (window.userLibrary) {
            window.userLibrary.removeSongFromGrid(trackId);
          }
        }

        window.dispatchEvent(
          new CustomEvent("favoritesUpdated", {
            detail: { trackId, isFavorite: willBeFavorite },
          }),
        );
        return willBeFavorite;
      }

      await window.melechDB.saveUserSong({
        id: trackOrId.id,
        title: trackOrId.title,
        artist: trackOrId.artist,
        image: trackOrId.image,
        audio: trackOrId.audio,
        audioBlob: trackOrId.audioBlob || null,
        source: trackOrId.source || "explore",
        addedAt: trackOrId.addedAt || Date.now(),
        isFavorite: willBeFavorite,
      });

      if (window.userLibrary) {
        const existingSong = window.userLibrary.userSongs.find(
          (s) => s.id === trackId,
        );
        if (existingSong) {
          existingSong.isFavorite = willBeFavorite;
        } else if (willBeFavorite) {
          window.userLibrary.addSongToGrid({
            id: trackOrId.id,
            title: trackOrId.title,
            artist: trackOrId.artist,
            image: trackOrId.image,
            audio: trackOrId.audio,
            source: trackOrId.source || "explore",
            isFavorite: true,
            addedAt: Date.now(),
          });
        }
      }
    }

    let favs = this.playlists.find(
      (p) => p.isFavorites || p.id === "pl_favorites",
    );

    if (!favs) {
      favs = await this._createPlaylistObject(
        "Favorites",
        "pl_favorites",
        true,
      );
      this.playlists = [
        favs,
        ...this.playlists.filter((p) => p.id !== "pl_favorites"),
      ];
    }

    if (!favs.trackIds) favs.trackIds = [];
    if (favs.tracks?.length > 0 && favs.trackIds.length === 0) {
      favs.trackIds = favs.tracks.map((t) => t.id);
      favs.tracks = [];
    }

    const index = favs.trackIds.indexOf(trackId);
    const isAdding = index === -1;

    if (isAdding) {
      favs.trackIds.push(trackId);
    } else {
      favs.trackIds.splice(index, 1);
    }

    await this.savePlaylists();

    if (window.currentPlaylist?.id === favs.id) {
      const resolvedTracks =
        (await window.melechDB?.resolveTrackIds(favs.trackIds)) || [];
      window.currentPlaylist.tracks = resolvedTracks;
      window.currentPlaylist.trackIds = [...favs.trackIds];

      if (this.isShuffle && this.shuffledTrackOrder) {
        if (isAdding) {
          this.shuffledTrackOrder =
            this.createShuffledTrackOrder(resolvedTracks);
        } else {
          const shuffledIndex = this.shuffledTrackOrder.findIndex(
            (t) => t.id === trackId,
          );
          if (shuffledIndex !== -1) {
            this.shuffledTrackOrder.splice(shuffledIndex, 1);
          }
        }
      }
    }

    this.renderPlaylistList();
    if (this.currentPlaylistId === favs.id) {
      this.renderDetailTracks();
    }

    if (window.updateNowPlayingUI && window.getCurrentTrack) {
      const trk = window.getCurrentTrack();
      if (trk) window.updateNowPlayingUI(trk);
    }

    window.dispatchEvent(
      new CustomEvent("favoritesUpdated", {
        detail: { trackId: trackId, isFavorite: isAdding },
      }),
    );

    return isAdding;
  }

  getFavoritesPlaylist() {
    return this.playlists.find((p) => p.isFavorites || p.id === "pl_favorites");
  }

  isTrackFavorite(trackId) {
    const favs = this.getFavoritesPlaylist();
    if (favs) {
      const ids = favs.trackIds || favs.tracks?.map((t) => t.id) || [];
      if (ids.includes(trackId)) return true;
    }

    if (trackId.startsWith("radio-") && window.userLibrary) {
      const userSong = window.userLibrary.userSongs.find(
        (s) => s.id === trackId,
      );
      if (userSong && userSong.isFavorite) return true;
    }

    return false;
  }

  async deletePlaylist(id) {
    const playlistId = id || this.currentPlaylistId;
    if (!playlistId) return;

    const playlist = this.playlists.find((p) => p.id === playlistId);
    if (!playlist) return;

    const confirmed = await window.melechConfirm(
      "playlist.confirmDelete",
      "common.confirm",
      {
        i18nParams: { name: playlist.name },
      },
    );
    if (!confirmed) return;

    this.playlists = this.playlists.filter((p) => p.id !== playlistId);
    await this.savePlaylists();

    if (this.currentPlaylistId === playlistId) {
      this.closeDetailPanel();
    }
    this.renderPlaylistList();
  }

  deleteCurrentPlaylist() {
    if (this.currentPlaylistId) {
      this.deletePlaylist(this.currentPlaylistId);
    }
  }

  async openDetailPanel(playlistId) {
    const playlist = this.playlists.find((p) => p.id === playlistId);
    if (!playlist) return;

    this.currentPlaylistId = playlistId;
    if (this.playlistDetailTitle)
      this.playlistDetailTitle.textContent = playlist.name;

    await this.renderDetailTracks();

    this.closePlaylistMenu();
    this.playlistDetailPanel?.classList.add("open");
  }

  closeDetailPanel() {
    this.playlistDetailPanel?.classList.remove("open");
    this.currentPlaylistId = null;
    this.openPlaylistMenu();
  }

  renderPlaylistList() {
    if (!this.playlistList) return;

    if (!this.playlists || this.playlists.length === 0) {
      this.playlistList.innerHTML = `
                <div class="empty-playlists">
                    <span class="material-symbols-rounded">queue_music</span>
                    <p data-i18n="playlist.emptyPlaylistText">Hmm... It's empty here!</p>
                </div>
            `;
      return;
    }

    const activePlaylistId = window.currentPlaylist?.id;
    const isMusicPlaying = window.getIsPlaying?.() || false;

    this.playlistList.innerHTML = this.playlists
      .map((playlist) => {
        const isActive = activePlaylistId === playlist.id;
        const isPlaying = isActive && isMusicPlaying;
        const playBtnIcon = isActive && isMusicPlaying ? "pause" : "play_arrow";
        const playBtnTitle = isActive && isMusicPlaying ? "Pause" : "Play";

        const coverHtml = playlist.coverImage
          ? `<img src="${playlist.coverImage}" alt="${this.escapeHtml(playlist.name)}">`
          : `<div class="cover-placeholder"><span class="material-symbols-rounded">${playlist.isFavorites ? "favorite" : "music_note"}</span></div>`;

        return `
            <div class="playlist-item ${isActive ? "now-playing" : ""}" data-id="${playlist.id}">
                <div class="playlist-item-cover ${isPlaying ? "active" : ""}">
                    ${coverHtml}
                </div>
                <div class="playlist-item-info">
                    <div class="playlist-item-title">${this.escapeHtml(playlist.name)}</div>
                    <div class="playlist-item-meta">
                      <span class="playlist-item-count">${playlist.trackIds?.length || playlist.tracks?.length || 0} songs</span>
                    </div>
                </div>
                <div class="playlist-item-actions">
                    <button class="playlist-action-btn play ${isActive && isMusicPlaying ? "active" : ""}" data-id="${playlist.id}" title="${playBtnTitle}">
                        <span class="material-symbols-rounded">${playBtnIcon}</span>
                    </button>
                </div>
            </div>
          `;
      })
      .join("");

    this.playlistList.querySelectorAll(".playlist-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        if (!e.target.closest(".playlist-action-btn")) {
          this.openDetailPanel(item.dataset.id);
        }
      });

      item.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showContextMenu(e.clientX, e.clientY, item.dataset.id);
      });

      let longPressTimer;
      const startLongPress = (e) => {
        if (e.target.closest(".playlist-action-btn")) return;
        longPressTimer = setTimeout(() => {
          const touch = e.touches ? e.touches[0] : null;
          const x = touch ? touch.clientX : e.clientX;
          const y = touch ? touch.clientY : e.clientY;
          this.showContextMenu(x, y, item.dataset.id);
        }, 600);
      };

      const cancelLongPress = () => {
        clearTimeout(longPressTimer);
      };

      item.addEventListener("touchstart", startLongPress, { passive: true });
      item.addEventListener("touchend", cancelLongPress);
      item.addEventListener("touchmove", cancelLongPress, { passive: true });
    });

    this.playlistList
      .querySelectorAll(".playlist-action-btn.play")
      .forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const playlistId = btn.dataset.id;
          const isActive = window.currentPlaylist?.id === playlistId;
          const isMusicPlaying = window.getIsPlaying?.() || false;

          if (isActive) {
            window.dispatchEvent(new CustomEvent("togglePlayPause"));
          } else {
            this.playPlaylist(playlistId);
          }
        });
      });
  }

  async renderDetailTracks() {
    if (!this.playlistDetailTracks || !this.currentPlaylistId) return;

    const playlist = this.playlists.find(
      (p) => p.id === this.currentPlaylistId,
    );
    if (!playlist) return;

    if (!playlist.trackIds) {
      playlist.trackIds = playlist.tracks?.map((t) => t.id) || [];
    }

    const resolvedTracks =
      (await window.melechDB?.resolveTrackIds(playlist.trackIds)) || [];

    if (this.playlistDetailCount) {
      const songText = window.t ? window.t("playlist.song") : "song";
      this.playlistDetailCount.textContent = `${resolvedTracks.length} ${songText}`;
    }

    if (resolvedTracks.length === 0) {
      const emptyTitle = window.t
        ? window.t("playlist.emptySongsTitle")
        : "No Songs Yet";
      this.playlistDetailTracks.innerHTML = `
                <div class="empty-playlists">
                    <span class="material-symbols-rounded">music_off</span>
                    <p>${emptyTitle}</p>
                </div>
            `;
      return;
    }

    const isPlayingCurrent =
      window.currentPlaylist &&
      window.currentPlaylist.id === this.currentPlaylistId;
    const tracksToRender =
      this.isShuffle && this.shuffledTrackOrder && isPlayingCurrent
        ? this.shuffledTrackOrder
        : resolvedTracks;

    let trackIdToIndexMap = null;
    const isShuffled =
      this.isShuffle && this.shuffledTrackOrder && isPlayingCurrent;
    if (isShuffled) {
      trackIdToIndexMap = new Map(
        playlist.trackIds.map((id, idx) => [id, idx]),
      );
    }

    this.playlistDetailTracks.innerHTML = tracksToRender
      .map((track, displayIndex) => {
        const originalIndex = isShuffled
          ? (trackIdToIndexMap?.get(track.id) ?? displayIndex)
          : displayIndex;
        const showItemShuffled =
          this.isShuffle && this.shuffledTrackOrder && isPlayingCurrent;
        const shuffleBadge = showItemShuffled
          ? `<span class="shuffle-number">${displayIndex + 1}</span>`
          : "";

        return `
            <div class="playlist-track-item ${showItemShuffled ? "shuffled" : ""}" data-index="${originalIndex}" data-display-index="${displayIndex}" draggable="true">
                <div class="playlist-track-drag-handle">
                    <span class="material-symbols-rounded">drag_indicator</span>
                </div>
                <div class="playlist-track-image">
                    <img src="${track.image || "./resources/MelechCover.png"}" alt="${this.escapeHtml(track.title)}" loading="lazy">
                    ${shuffleBadge}
                </div>
                <div class="playlist-track-info">
                    <div class="playlist-track-title">${this.escapeHtml(track.title)}</div>
                    <div class="playlist-track-artist">${this.escapeHtml(track.artist)}</div>
                </div>
                <button class="playlist-track-remove" data-index="${originalIndex}" title="Remove">
                    <span class="material-symbols-rounded">close</span>
                </button>
                <button class="playlist-track-play" data-index="${originalIndex}" data-display-index="${displayIndex}" title="Play">
                    <span class="material-symbols-rounded">play_arrow</span>
                </button>
            </div>
        `;
      })
      .join("");

    this.initDragAndDrop();

    this.playlistDetailTracks.onclick = async (e) => {
      const playBtn = e.target.closest(".playlist-track-play");
      const removeBtn = e.target.closest(".playlist-track-remove");

      if (playBtn) {
        const index = parseInt(playBtn.dataset.index);
        const displayIndex = parseInt(playBtn.dataset.displayIndex);
        await this.playTrackFromPlaylist(
          index,
          displayIndex,
          this.currentPlaylistId,
        );
      } else if (removeBtn) {
        const index = parseInt(removeBtn.dataset.index);
        await this.removeTrackFromPlaylist(index);
      }
    };

    this.highlightCurrentTrack();
  }

  highlightCurrentTrack() {
    if (!window.currentPlaylist || !this.currentPlaylistId) return;
    if (window.currentPlaylist.id !== this.currentPlaylistId) return;

    const currentTrackId = window.currentPlaylist.currentTrackId;
    if (!currentTrackId) return;

    const items = this.playlistDetailTracks?.querySelectorAll(
      ".playlist-track-item",
    );
    if (!items) return;

    const playlist = this.playlists.find(
      (p) => p.id === this.currentPlaylistId,
    );
    const trackIds =
      playlist?.trackIds || playlist?.tracks?.map((t) => t.id) || [];

    items.forEach((item) => {
      item.classList.remove("now-playing");
      const index = parseInt(item.dataset.index);
      if (trackIds[index] === currentTrackId) {
        item.classList.add("now-playing");
      }
    });
  }

  initDragAndDrop() {
    const items = this.playlistDetailTracks?.querySelectorAll(
      ".playlist-track-item",
    );
    if (!items) return;

    items.forEach((item) => {
      item.addEventListener("dragstart", (e) => {
        this.draggedItem = item;
        item.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });

      item.addEventListener("dragend", () => {
        item.classList.remove("dragging");
        this.draggedItem = null;
        items.forEach((i) => i.classList.remove("drag-over"));
      });

      item.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (item === this.draggedItem) return;
        item.classList.add("drag-over");
      });

      item.addEventListener("dragleave", () => {
        item.classList.remove("drag-over");
      });

      item.addEventListener("drop", (e) => {
        e.preventDefault();
        item.classList.remove("drag-over");
        if (!this.draggedItem || item === this.draggedItem) return;

        const fromIndex = parseInt(this.draggedItem.dataset.index);
        const toIndex = parseInt(item.dataset.index);

        this.reorderTracks(fromIndex, toIndex);
      });
    });
  }

  async reorderTracks(fromIndex, toIndex) {
    const playlist = this.playlists.find(
      (p) => p.id === this.currentPlaylistId,
    );
    if (!playlist) return;

    if (!playlist.trackIds) {
      playlist.trackIds = playlist.tracks?.map((t) => t.id) || [];
    }

    const [movedTrackId] = playlist.trackIds.splice(fromIndex, 1);
    playlist.trackIds.splice(toIndex, 0, movedTrackId);

    if (playlist.tracks && playlist.tracks.length > 0) {
      const [movedTrack] = playlist.tracks.splice(fromIndex, 1);
      playlist.tracks.splice(toIndex, 0, movedTrack);
    }

    await this.savePlaylists();
    this.renderDetailTracks();
  }

  async removeTrackFromPlaylist(index) {
    const playlist = this.playlists.find(
      (p) => p.id === this.currentPlaylistId,
    );
    if (!playlist) return;

    if (!playlist.trackIds) {
      playlist.trackIds = playlist.tracks?.map((t) => t.id) || [];
    }

    const removedTrackId = playlist.trackIds[index];
    playlist.trackIds.splice(index, 1);

    if (playlist.tracks) {
      playlist.tracks.splice(index, 1);
    }

    await this.savePlaylists();

    if (this.isShuffle && this.shuffledTrackOrder) {
      const shuffledIndex = this.shuffledTrackOrder.findIndex(
        (t) => t.id === removedTrackId,
      );
      if (shuffledIndex !== -1) {
        this.shuffledTrackOrder.splice(shuffledIndex, 1);
      }
    }

    if (window.currentPlaylist?.id === this.currentPlaylistId) {
      const resolvedTracks =
        (await window.melechDB?.resolveTrackIds(playlist.trackIds)) || [];
      window.currentPlaylist.tracks = resolvedTracks;
      window.currentPlaylist.trackIds = [...playlist.trackIds];

      const currentTrack =
        window.currentTrack || window.melechPlayer?.currentTrack;
      if (currentTrack && removedTrackId === currentTrack.id) {
        if (playlist.trackIds.length > 0) {
          const nextIndex = index < playlist.trackIds.length ? index : 0;
          const nextTrack = resolvedTracks[nextIndex];
          if (nextTrack) {
            window.dispatchEvent(
              new CustomEvent("playTrack", {
                detail: { ...nextTrack, fromPlaylist: true },
              }),
            );
          }
        } else {
          window.dispatchEvent(new CustomEvent("stopPlayback"));
          window.currentPlaylist = null;
          this.currentPlaylistId = null;
        }
      }
    }

    this.renderDetailTracks();
    this.renderPlaylistList();

    if (window.updateNowPlayingUI && window.getCurrentTrack) {
      const trk = window.getCurrentTrack();
      if (trk) window.updateNowPlayingUI(trk);
    }

    const favs = this.getFavoritesPlaylist();
    if (this.currentPlaylistId === favs?.id && removedTrackId) {
      await window.melechDB?.setSongFavorite(removedTrackId, false);
      window.dispatchEvent(
        new CustomEvent("favoritesUpdated", {
          detail: { trackId: removedTrackId, isFavorite: false },
        }),
      );
    }
  }

  async addTrackToPlaylist(playlistId, track) {
    const playlist = this.playlists.find((p) => p.id === playlistId);
    if (!playlist) return;

    if (track && track.id && window.melechDB) {
      await window.melechDB.saveUserSong({
        id: track.id,
        title: track.title,
        artist: track.artist,
        image: track.image,
        audio: track.audio,
        audioBlob: track.audioBlob || null,
        source: track.source || "explore",
        addedAt: track.addedAt || Date.now(),
      });
      if (
        window.userLibrary &&
        !window.userLibrary.userSongs.find((s) => s.id === track.id)
      ) {
        window.userLibrary.userSongs.push({
          id: track.id,
          title: track.title,
          artist: track.artist,
          image: track.image,
          audio: track.audio,
          source: track.source || "explore",
          addedAt: track.addedAt,
          hasAudioBlob: !!track.audioBlob,
          isFavorite: !!track.isFavorite,
        });
        window.userLibrary.renderUserSongs();
      }
    }

    if (!playlist.trackIds) {
      playlist.trackIds = playlist.tracks?.map((t) => t.id) || [];
    }

    const exists = playlist.trackIds.includes(track.id);
    if (exists) {
      window.notifications?.info("song.alreadyInPlaylist", {
        title: "playlist.addToPlaylist",
      });
      return;
    }

    playlist.trackIds.push(track.id);
    playlist.tracks = [];
    await this.savePlaylists();

    if (window.currentPlaylist?.id === playlistId) {
      const resolvedTracks =
        (await window.melechDB?.resolveTrackIds(playlist.trackIds)) || [];
      window.currentPlaylist.tracks = resolvedTracks;
      window.currentPlaylist.trackIds = [...playlist.trackIds];
    }

    if (this.isShuffle && this.currentPlaylistId === playlistId) {
      const resolvedTracks =
        (await window.melechDB?.resolveTrackIds(playlist.trackIds)) || [];
      this.shuffledTrackOrder = this.createShuffledTrackOrder(resolvedTracks);
    }

    if (this.currentPlaylistId === playlistId) {
      this.renderDetailTracks();
    }
    this.renderPlaylistList();
  }

  async removeTrackFromAllPlaylists(trackId) {
    let modified = false;

    for (const playlist of this.playlists) {
      if (!playlist.trackIds) {
        playlist.trackIds = playlist.tracks?.map((t) => t.id) || [];
      }

      const index = playlist.trackIds.indexOf(trackId);
      if (index !== -1) {
        playlist.trackIds.splice(index, 1);
        playlist.tracks = [];
        modified = true;

        if (window.currentPlaylist?.id === playlist.id) {
          const resolvedTracks =
            (await window.melechDB?.resolveTrackIds(playlist.trackIds)) || [];
          window.currentPlaylist.tracks = resolvedTracks;
          window.currentPlaylist.trackIds = [...playlist.trackIds];
        }
      }
    }

    if (modified) {
      await this.savePlaylists();
      this.renderPlaylistList();

      if (this.currentPlaylistId) {
        this.renderDetailTracks();
      }

      if (this.isShuffle && this.shuffledTrackOrder) {
        this.shuffledTrackOrder = this.shuffledTrackOrder.filter(
          (t) => t.id !== trackId,
        );
      }
    }
  }

  openAddToPlaylistModal(track) {
    if (!track) return;

    if (track.source === "radio") {
      return;
    }

    if (this.playlists.length === 0) {
      window.notifications?.warning("playlist.createFirst", {
        title: "playlist.newPlaylist",
      });
      return;
    }

    this.pendingTrack = track;

    if (this.addToPlaylistList) {
      this.addToPlaylistList.innerHTML = this.playlists
        .map(
          (playlist) => `
                <div class="add-to-playlist-item" data-id="${playlist.id}">
                    <span class="material-symbols-rounded">playlist_play</span>
                    <div class="flex-1">
                        <div class="font-medium text-white">${this.escapeHtml(playlist.name)}</div>
                        <div class="text-xs text-white/50">${playlist.trackIds?.length || playlist.tracks?.length || 0} songs</div>
                    </div>
                </div>
            `,
        )
        .join("");

      this.addToPlaylistList
        .querySelectorAll(".add-to-playlist-item")
        .forEach((item) => {
          item.addEventListener("click", () => {
            this.addTrackToPlaylist(item.dataset.id, this.pendingTrack);
            this.closeAddToPlaylistModal();
          });
        });
    }

    this.addToPlaylistModal?.classList.add("open");
  }

  closeAddToPlaylistModal() {
    this.addToPlaylistModal?.classList.remove("open");
    this.pendingTrack = null;
  }

  async playPlaylist(playlistId) {
    const playlist = this.playlists.find((p) => p.id === playlistId);

    if (!playlist.trackIds) {
      playlist.trackIds = playlist.tracks?.map((t) => t.id) || [];
    }

    if (!playlist || playlist.trackIds.length === 0) {
      return;
    }

    const resolvedTracks =
      (await window.melechDB?.resolveTrackIds(playlist.trackIds)) || [];

    if (resolvedTracks.length === 0) {
      window.notifications?.error("errors.songsNotFound", {
        title: "errors.generic",
      });
      return;
    }

    this.originalTrackOrder = [...resolvedTracks];
    window.currentPlaylist = {
      ...playlist,
      tracks: resolvedTracks,
      trackIds: [...playlist.trackIds],
      currentIndex: 0,
      shuffledIndices: [],
      currentTrackId: null,
    };

    if (this.isShuffle) {
      this.shuffledTrackOrder = this.createShuffledTrackOrder(resolvedTracks);
      const firstTrack = this.shuffledTrackOrder[0];
      const originalIndex = playlist.trackIds.findIndex(
        (id) => id === firstTrack.id,
      );
      window.currentPlaylist.currentTrackId = firstTrack.id;
      window.currentPlaylist.shufflePointer = 0;
      await this.playTrackFromPlaylist(originalIndex, 0, playlistId);
    } else {
      this.shuffledTrackOrder = null;
      window.currentPlaylist.currentTrackId = resolvedTracks[0].id;
      window.currentPlaylist.shufflePointer = null;
      await this.playTrackFromPlaylist(0, null, playlistId);
    }

    if (this.currentPlaylistId === playlistId) {
      await this.renderDetailTracks();
    }

    this.renderPlaylistList();
  }

  createShuffledTrackOrder(tracks) {
    const shuffled = [...tracks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  async playCurrentPlaylist() {
    if (this.currentPlaylistId) {
      await this.playPlaylist(this.currentPlaylistId);
    }
  }

  async playTrackFromPlaylist(index, displayIndex = null, playlistId = null) {
    const targetId =
      playlistId || window.currentPlaylist?.id || this.currentPlaylistId;
    const playlist = this.playlists.find((p) => p.id === targetId);
    if (!playlist) return;
    if (!playlist.trackIds) {
      playlist.trackIds = playlist.tracks?.map((t) => t.id) || [];
    }
    if (!playlist.trackIds[index]) return;

    const trackId = playlist.trackIds[index];
    const track = await window.melechDB?.getUserSongById(trackId);
    if (!track) {
      window.notifications?.error("errors.songNotFound", {
        title: "errors.generic",
      });
      return;
    }

    if (!window.currentPlaylist || window.currentPlaylist.id !== playlist.id) {
      const resolvedTracks =
        (await window.melechDB?.resolveTrackIds(playlist.trackIds)) || [];
      window.currentPlaylist = {
        ...playlist,
        tracks: resolvedTracks,
        trackIds: [...playlist.trackIds],
        shuffledIndices: [],
      };
    } else if (!window.currentPlaylist.tracks?.length) {
      window.currentPlaylist.tracks =
        (await window.melechDB?.resolveTrackIds(playlist.trackIds)) || [];
    }

    window.currentPlaylist.currentIndex = index;
    window.currentPlaylist.currentTrackId = trackId;
    if (this.isShuffle && this.shuffledTrackOrder) {
      if (displayIndex !== null) {
        window.currentPlaylist.shufflePointer = displayIndex;
      } else {
        const sIndex = this.shuffledTrackOrder.findIndex(
          (t) => t.id === trackId,
        );
        window.currentPlaylist.shufflePointer = sIndex !== -1 ? sIndex : 0;
      }
    } else {
      window.currentPlaylist.shufflePointer = null;
    }

    const trackToPlay = {
      id: track.id,
      title: track.title,
      artist: track.artist,
      image: track.image,
      audio: track.audio,
      audioBlob: track.audioBlob,
      source: track.source || "library",
      fromPlaylist: true,
    };
    window.dispatchEvent(new CustomEvent("playTrack", { detail: trackToPlay }));

    this.highlightCurrentTrack();
  }

  async playNextInPlaylist() {
    if (!window.currentPlaylist) return false;

    const playlist = this.playlists.find(
      (p) => p.id === window.currentPlaylist.id,
    );
    if (!playlist) return false;

    if (!playlist.trackIds) {
      playlist.trackIds = playlist.tracks?.map((t) => t.id) || [];
    }

    if (this.isShuffle && this.shuffledTrackOrder?.length > 0) {
      const currentPointer =
        window.currentPlaylist.shufflePointer ??
        this.shuffledTrackOrder.findIndex(
          (t) => t.id === window.currentPlaylist.currentTrackId,
        );

      if (
        currentPointer !== -1 &&
        currentPointer < this.shuffledTrackOrder.length - 1
      ) {
        const nextTrack = this.shuffledTrackOrder[currentPointer + 1];
        const originalIndex = playlist.trackIds.findIndex(
          (id) => id === nextTrack.id,
        );
        await this.playTrackFromPlaylist(
          originalIndex,
          currentPointer + 1,
          window.currentPlaylist.id,
        );
        return true;
      } else if (window.getLoopMode?.() === 1) {
        const firstTrack = this.shuffledTrackOrder[0];
        const originalIndex = playlist.trackIds.findIndex(
          (id) => id === firstTrack.id,
        );
        await this.playTrackFromPlaylist(
          originalIndex,
          0,
          window.currentPlaylist.id,
        );
        return true;
      }
    } else {
      const nextIndex = window.currentPlaylist.currentIndex + 1;
      if (nextIndex < playlist.trackIds.length) {
        await this.playTrackFromPlaylist(
          nextIndex,
          null,
          window.currentPlaylist.id,
        );
        return true;
      } else if (window.getLoopMode?.() === 1) {
        await this.playTrackFromPlaylist(0, null, window.currentPlaylist.id);
        return true;
      }
    }

    return false;
  }

  async playPreviousInPlaylist() {
    if (!window.currentPlaylist) return false;

    const playlist = this.playlists.find(
      (p) => p.id === window.currentPlaylist.id,
    );
    if (!playlist) return false;

    if (!playlist.trackIds) {
      playlist.trackIds = playlist.tracks?.map((t) => t.id) || [];
    }

    if (this.isShuffle && this.shuffledTrackOrder?.length > 0) {
      const currentPointer =
        window.currentPlaylist.shufflePointer ??
        this.shuffledTrackOrder.findIndex(
          (t) => t.id === window.currentPlaylist.currentTrackId,
        );

      if (currentPointer > 0) {
        const prevTrack = this.shuffledTrackOrder[currentPointer - 1];
        const originalIndex = playlist.trackIds.findIndex(
          (id) => id === prevTrack.id,
        );
        await this.playTrackFromPlaylist(
          originalIndex,
          currentPointer - 1,
          window.currentPlaylist.id,
        );
        return true;
      } else if (window.getLoopMode?.() === 1) {
        const lastIndex = this.shuffledTrackOrder.length - 1;
        const lastTrack = this.shuffledTrackOrder[lastIndex];
        const originalIndex = playlist.trackIds.findIndex(
          (id) => id === lastTrack.id,
        );
        await this.playTrackFromPlaylist(
          originalIndex,
          lastIndex,
          window.currentPlaylist.id,
        );
        return true;
      }
    } else {
      const { currentIndex } = window.currentPlaylist;
      const prevIndex = currentIndex - 1;
      if (prevIndex >= 0) {
        await this.playTrackFromPlaylist(
          prevIndex,
          null,
          window.currentPlaylist.id,
        );
        return true;
      } else if (window.getLoopMode?.() === 1) {
        const lastIdx = playlist.trackIds.length - 1;
        await this.playTrackFromPlaylist(
          lastIdx,
          null,
          window.currentPlaylist.id,
        );
        return true;
      }
    }

    return false;
  }

  async setShuffle(state) {
    this.isShuffle = state;

    if (window.currentPlaylist) {
      const playlist = this.playlists.find(
        (p) => p.id === window.currentPlaylist.id,
      );

      if (state && playlist) {
        if (!playlist.trackIds) {
          playlist.trackIds = playlist.tracks?.map((t) => t.id) || [];
        }

        const resolvedTracks =
          (await window.melechDB?.resolveTrackIds(playlist.trackIds)) || [];
        this.originalTrackOrder = [...resolvedTracks];
        this.shuffledTrackOrder = this.createShuffledTrackOrder(resolvedTracks);

        const currentTrackId = window.currentPlaylist.currentTrackId;
        if (currentTrackId) {
          const newIndex = this.shuffledTrackOrder.findIndex(
            (t) => t.id === currentTrackId,
          );
          window.currentPlaylist.shufflePointer =
            newIndex !== -1 ? newIndex : 0;
        }

        if (this.currentPlaylistId === playlist.id) {
          await this.renderDetailTracks();
        }
      } else {
        this.shuffledTrackOrder = null;
        this.originalTrackOrder = null;
        if (window.currentPlaylist) {
          window.currentPlaylist.shufflePointer = null;
        }
        if (this.currentPlaylistId === window.currentPlaylist?.id) {
          await this.renderDetailTracks();
        }
      }

      if (window.updateNowPlayingUI && window.getCurrentTrack) {
        const trk = window.getCurrentTrack();
        if (trk) window.updateNowPlayingUI(trk);
      }
    }
  }

  generateShuffledIndices() {
    if (!window.currentPlaylist) return;

    const trackCount =
      window.currentPlaylist.trackIds?.length ||
      window.currentPlaylist.tracks?.length ||
      0;
    if (trackCount === 0) return;

    const indices = Array.from({ length: trackCount }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    window.currentPlaylist.shuffledIndices = indices;
    window.currentPlaylist.shufflePointer = 0;

    if (window.updateNowPlayingUI && window.getCurrentTrack) {
      const trk = window.getCurrentTrack();
      if (trk) window.updateNowPlayingUI(trk);
    }

    return indices;
  }

  canGoNext() {
    const trackCount =
      window.currentPlaylist?.trackIds?.length ||
      window.currentPlaylist?.tracks?.length ||
      0;
    if (!window.currentPlaylist || trackCount <= 1) return false;

    const loopMode = window.getLoopMode ? window.getLoopMode() : 0;
    if (loopMode === 1) return true;

    if (this.isShuffle && this.shuffledTrackOrder?.length > 0) {
      const currentPointer =
        window.currentPlaylist.shufflePointer ??
        this.shuffledTrackOrder.findIndex(
          (t) => t.id === window.currentPlaylist.currentTrackId,
        );
      return (
        currentPointer !== -1 &&
        currentPointer < this.shuffledTrackOrder.length - 1
      );
    } else {
      return window.currentPlaylist.currentIndex < trackCount - 1;
    }
  }

  canGoPrev() {
    const trackCount =
      window.currentPlaylist?.trackIds?.length ||
      window.currentPlaylist?.tracks?.length ||
      0;
    if (!window.currentPlaylist || trackCount <= 1) return false;

    const loopMode = window.getLoopMode ? window.getLoopMode() : 0;
    if (loopMode === 1) return true;

    if (this.isShuffle && this.shuffledTrackOrder?.length > 0) {
      const currentPointer =
        window.currentPlaylist.shufflePointer ??
        this.shuffledTrackOrder.findIndex(
          (t) => t.id === window.currentPlaylist.currentTrackId,
        );
      return currentPointer > 0;
    } else {
      return window.currentPlaylist.currentIndex > 0;
    }
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}

let playlistManager;

document.addEventListener("DOMContentLoaded", () => {
  playlistManager = new PlaylistManager();
  window.playlistManager = playlistManager;
});

window.addTrackToPlaylist = (track) => {
  if (playlistManager) {
    playlistManager.openAddToPlaylistModal(track);
  }
};
