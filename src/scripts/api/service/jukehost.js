"use strict";

class JukehostIntegration {
  constructor() {
    this.overlay = null;
    this.isProcessing = false;
    this.apiBaseUrl = "https://jukehost.co.uk";
    this.apiPath = "/api/service/melech/get_category_tracks";
    this.apiEndpoint = `${this.apiBaseUrl}${this.apiPath}`;
    this.playlistNames = [];
    this.loadPlaylistNames();
  }

  async loadPlaylistNames() {
    try {
      const currentLang = localStorage.getItem("melech-language") || "tr";
      const basePath = window.location.pathname.replace(/\/[^/]*$/, '/');
      const response = await fetch(
        `${basePath}language/playlist-names/${currentLang}.json`,
      );

      if (response.ok) {
        const data = await response.json();
        this.playlistNames = data.names || [];
      } else {
        throw new Error("Language file not found");
      }
    } catch (err) {
      console.warn("Playlist names could not be loaded:", err);
      this.playlistNames = [
        "My Awesome List",
        "My {date} Playlist",
        "Travel Music",
        "Relax Time",
      ];
    }
  }

  generatePlaylistName() {
    if (this.playlistNames.length === 0) {
      return `My ${new Date().getFullYear()} List`;
    }
    const randomName =
      this.playlistNames[Math.floor(Math.random() * this.playlistNames.length)];
    const year = new Date().getFullYear();
    return randomName.replace("{date}", year);
  }

  generatePlaylistId(categoryId) {
    return `jukehost_${categoryId}`;
  }

  findExistingPlaylist(categoryId) {
    if (!window.playlistManager) return null;

    const playlistId = this.generatePlaylistId(categoryId);
    return (
      window.playlistManager.playlists.find((p) => p.id === playlistId) || null
    );
  }

  async createOrUpdatePlaylist(songs, categoryId, categoryName) {
    if (!window.playlistManager) {
      console.warn("Playlist manager not available");
      return null;
    }

    const playlistId = this.generatePlaylistId(categoryId);
    const existingPlaylist = this.findExistingPlaylist(categoryId);

    const trackIds = songs.map((s) => s.id);
    const newTrackIdsSet = new Set(trackIds);

    if (existingPlaylist) {
      const existingTrackIdsSet = new Set(existingPlaylist.trackIds || []);

      const addedTracks = songs.filter((s) => !existingTrackIdsSet.has(s.id));
      const removedCount = (existingPlaylist.trackIds || []).filter(
        (id) => !newTrackIdsSet.has(id),
      ).length;
      const keptCount = songs.filter((s) =>
        existingTrackIdsSet.has(s.id),
      ).length;

      existingPlaylist.name = categoryName;
      existingPlaylist.tracks = songs;
      existingPlaylist.trackIds = trackIds;
      existingPlaylist.coverImage =
        songs[0]?.image || existingPlaylist.coverImage;
      existingPlaylist.updatedAt = Date.now();
      existingPlaylist.categoryId = categoryId;

      await window.playlistManager.savePlaylists();

      return {
        playlist: existingPlaylist,
        isNew: false,
        added: addedTracks.length,
        removed: removedCount,
      };
    }

    const playlist = {
      id: playlistId,
      name: categoryName,
      tracks: songs,
      trackIds: trackIds,
      coverImage: songs[0]?.image || null,
      createdAt: Date.now(),
      isUserCreated: true,
      source: "jukehost",
      categoryId: categoryId,
    };

    window.playlistManager.playlists.push(playlist);
    await window.playlistManager.savePlaylists();

    if (window.notifications) {
      window.notifications.success(
        `"${categoryName}" çalma listesi oluşturuldu`,
      );
    }

    return { playlist, isNew: true, added: songs.length, removed: 0 };
  }

  async init() {
    const token = this.extractTokenFromUrl();
    if (token) {
      this.removeTokenFromUrl();
      this.showChoiceDialog(token);
    }
  }

  showChoiceDialog(token) {
    if (this.overlay) this.overlay.remove();

    const t = (key) => (window.t ? window.t(key) : key);

    const modal = document.createElement("div");
    modal.id = "jukehost-choice-modal";
    modal.className =
      "fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm transition-all duration-300";
    modal.style.opacity = "0";

    modal.innerHTML = `
            <div class="bg-[#1a0a0f] rounded-2xl p-6 max-w-sm max-h-[90vh] overflow-y-auto mx-4 text-center border border-white/10 transform transition-all duration-300 scale-95 shadow-2xl custom-scrollbar">
                <div class="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 overflow-hidden border border-white/5 p-1">
                    <img src="./resources/JH-PartnerLogo.png" alt="JukeHost" class="w-full h-full object-contain rounded-full">
                </div>
                <h3 class="text-xl font-bold text-white" data-i18n="jukehost.choiceTitle">${t("jukehost.choiceTitle")}</h3>
                <p class="text-white/60 text-sm mb-6" data-i18n="jukehost.choiceDescription">${t("jukehost.choiceDescription")}</p>
                <div class="flex flex-col gap-3">
                    <button id="useBtn" class="w-full py-3 bg-[var(--primary-color)] hover:bg-[var(--secondary-color)] text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2 group">
                        <span class="material-symbols-rounded group-hover:scale-110 transition-transform">play_circle</span>
                        <span data-i18n="jukehost.use">${t("jukehost.use")}</span>
                    </button>
                    <button id="qrBtn" class="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2 group">
                        <span class="material-symbols-rounded group-hover:scale-110 transition-transform">qr_code_2</span>
                        <span data-i18n="jukehost.generateQR">${t("jukehost.generateQR")}</span>
                    </button>

                    <button id="cancelChoiceBtn" class="w-full py-2 text-white/40 hover:text-white/60 text-sm transition-all" data-i18n="jukehost.cancel">
                        ${t("jukehost.cancel")}
                    </button>
                </div>
            </div>
        `;

    document.body.appendChild(modal);

    setTimeout(() => {
      modal.style.opacity = "1";
      modal.querySelector(".bg-\\[\\#1a0a0f\\]").classList.remove("scale-95");
      modal.querySelector(".bg-\\[\\#1a0a0f\\]").classList.add("scale-100");
    }, 10);

    const close = () => {
      modal.style.opacity = "0";
      modal.querySelector(".bg-\\[\\#1a0a0f\\]").classList.add("scale-95");
      setTimeout(() => modal.remove(), 300);
    };

    modal.querySelector("#useBtn").addEventListener("click", () => {
      close();
      this.importLibrary(token);
    });

    modal.querySelector("#qrBtn").addEventListener("click", () => {
      close();
      this.showQRCode(token);
    });

    modal.querySelector("#cancelChoiceBtn").addEventListener("click", close);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });
  }

  showQRCode(token) {
    const t = (key) => (window.t ? window.t(key) : key);
    const baseUrl = window.location.origin + window.location.pathname;
    const fullUrl = `${baseUrl}?jukehost=${token}`;
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(fullUrl)}`;

    const modal = document.createElement("div");
    modal.id = "jukehost-qr-modal";
    modal.className =
      "fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm transition-all duration-300";
    modal.style.opacity = "0";
    modal.innerHTML = `
            <div class="bg-[#1a0a0f] rounded-2xl p-6 md:p-8 max-w-sm max-h-[90vh] overflow-y-auto mx-4 text-center border border-white/10 transform transition-all duration-300 scale-95 shadow-2xl custom-scrollbar">
                <div class="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 overflow-hidden p-0.5">
                    <img src="./resources/JH-PartnerLogo.png" alt="JukeHost" class="w-full h-full object-contain rounded-full">
                </div>
                <h3 class="text-xl font-bold text-white" data-i18n="jukehost.qrTitle">${t("jukehost.qrTitle")}</h3>
                <p class="text-white/60 text-sm mb-6" data-i18n="jukehost.qrDescription">${t("jukehost.qrDescription")}</p>
                
                <div class="bg-white p-3 rounded-xl mb-6 mx-auto w-fit shadow-lg">
                    <img src="${qrApiUrl}" alt="QR Code" class="w-full max-w-[200px] aspect-square rounded-lg mx-auto">
                </div>
                
                <div class="bg-white/5 p-3 py-1 rounded-xl mb-3 flex items-center gap-2">
                    <p class="text-white/40 text-[10px] break-all text-left flex-1 line-clamp-1">${fullUrl}</p>
                    <button id="copyUrlBtn" class="p-2 hover:bg-white/10 rounded-lg text-white/60 transition-all" data-i18n-attr="title" data-i18n="jukehost.copyUrl" title="${t("jukehost.copyUrl")}">
                        <span class="material-symbols-rounded text-sm">content_copy</span>
                    </button>
                </div>

                <button id="closeQrBtn" class="w-full py-2 text-white/40 hover:text-white/60 text-sm transition-all" data-i18n="jukehost.done">
                    ${t("jukehost.done")}
                </button>
            </div>
        `;

    document.body.appendChild(modal);

    setTimeout(() => {
      modal.style.opacity = "1";
      modal.querySelector(".bg-\\[\\#1a0a0f\\]").classList.remove("scale-95");
      modal.querySelector(".bg-\\[\\#1a0a0f\\]").classList.add("scale-100");
    }, 10);

    const close = () => {
      modal.style.opacity = "0";
      modal.querySelector(".bg-\\[\\#1a0a0f\\]").classList.add("scale-95");
      setTimeout(() => modal.remove(), 300);
    };

    modal.querySelector("#closeQrBtn").addEventListener("click", close);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });

    modal.querySelector("#copyUrlBtn").addEventListener("click", () => {
      navigator.clipboard.writeText(fullUrl);
      const icon = modal.querySelector("#copyUrlBtn span");
      icon.textContent = "done";
      setTimeout(() => (icon.textContent = "content_copy"), 2000);
    });
  }

  extractTokenFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("jukehost") || null;
  }

  removeTokenFromUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete("jukehost");
    url.searchParams.delete("jukehost_token");
    url.searchParams.delete("token");
    window.history.replaceState({}, document.title, url.toString());
  }

  async fetchLibrary(token) {
    const response = await fetch(this.apiEndpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("INVALID_TOKEN");
      }

      if (response.status === 404) {
        throw new Error("LIBRARY_NOT_FOUND");
      }

      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const responseData = await response.json();

    if (!responseData.data || typeof responseData.data !== "object") {
      throw new Error("INVALID_FORMAT");
    }

    const categoryData = responseData.data;

    if (!categoryData.tracks || !Array.isArray(categoryData.tracks)) {
      throw new Error("INVALID_FORMAT");
    }

    return {
      categoryId: categoryData.category_id,
      categoryName: categoryData.category_name,
      tracks: categoryData.tracks,
    };
  }

  redirectToJukehost() {
    const issueUrl = `${this.apiBaseUrl}${this.apiPath}/issue`;
    window.location.href = issueUrl;
  }
  async processTrackWithMetadata(track) {
    const trackId = track.id;
    const audioUrl = track.link || `https://audio.jukehost.co.uk/${trackId}`;

    const metadata = await this.extractMetadata(audioUrl);

    let title = "Unknown Title";
    let artist = "Unknown Artist";
    let coverImage = null;
    let duration = track.duration || 0;

    if (metadata) {
      title = metadata.title || "Unknown Title";
      artist = metadata.artist || "Unknown Artist";
      coverImage = metadata.cover || null;
    }

    return {
      id: `jukehost-${trackId}`,
      title: title,
      artist: artist,
      image: coverImage,
      audio: audioUrl,
      audioBlob: null,
      source: "jukehost",
      addedAt: Date.now(),
      duration: duration,
    };
  }

  async extractMetadata(audioUrl) {
    return new Promise((resolve) => {
      if (!window.jsmediatags) {
        resolve(null);
        return;
      }

      const timeout = setTimeout(() => {
        resolve(null);
      }, 10000);

      window.jsmediatags.read(audioUrl, {
        onSuccess: (result) => {
          clearTimeout(timeout);
          const tags = result.tags || {};
          let cover = null;

          if (tags.picture) {
            const { data, format } = tags.picture;
            const byteArray = new Uint8Array(data);
            let binary = "";
            for (let i = 0; i < byteArray.byteLength; i++) {
              binary += String.fromCharCode(byteArray[i]);
            }
            cover = `data:${format};base64,${btoa(binary)}`;
          }

          resolve({
            title: tags.title || null,
            artist: tags.artist || null,
            album: tags.album || null,
            cover: cover,
          });
        },
        onError: (error) => {
          clearTimeout(timeout);
          console.warn("Metadata extraction failed:", error);
          resolve(null);
        },
      });
    });
  }

  async saveSongToLibrary(song) {
    if (!window.melechDB) {
      throw new Error("Database not available");
    }

    const existing = await window.melechDB.getUserSongById(song.id);

    if (existing) {
      await window.melechDB.saveUserSong({
        ...existing,
        ...song,
        addedAt: existing.addedAt,
      });
    } else {
      await window.melechDB.saveUserSong(song);
      if (window.userLibrary?.userSongs) {
        window.userLibrary.userSongs.push({
          id: song.id,
          title: song.title,
          artist: song.artist,
          image: song.image,
          source: song.source,
          addedAt: song.addedAt,
          hasAudioBlob: !!song.audioBlob,
          audio: song.audio,
        });
      }
    }
  }

  async importLibrary(token) {
    this.isProcessing = true;
    this.removeTokenFromUrl();
    this.showOverlay();
    this.updateOverlayStatus("connecting", "Connecting to Jukehost...");

    try {
      this.updateOverlayStatus("fetching", "Fetching song library...");
      const libraryData = await this.fetchLibrary(token);
      const tracks = libraryData.tracks;
      const categoryName = libraryData.categoryName;
      const categoryId = libraryData.categoryId;

      if (tracks.length === 0) {
        this.updateOverlayStatus("empty", "No songs found in library.");
        await this.delay(2000);
        this.hideOverlay();
        return;
      }

      this.updateOverlayStatus(
        "processing",
        `Processing ${tracks.length} songs from "${categoryName}"...`,
      );
      let successCount = 0;
      let errorCount = 0;
      const addedSongs = [];

      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        try {
          const song = await this.processTrackWithMetadata(track);
          if (song) {
            await this.saveSongToLibrary(song);
            addedSongs.push(song);
            successCount++;
          } else {
            errorCount++;
          }
        } catch (err) {
          console.error("Track processing failed:", track, err);
          errorCount++;
        }
        const progress = Math.round(((i + 1) / tracks.length) * 100);
        this.updateOverlayProgress(
          progress,
          `${i + 1}/${tracks.length} songs processed`,
        );
      }

      let playlistResult = null;
      if (addedSongs.length > 0) {
        this.updateOverlayStatus("processing", "Updating playlist...");
        playlistResult = await this.createOrUpdatePlaylist(
          addedSongs,
          categoryId,
          categoryName,
        );
      }

      if (
        window.userLibrary?.renderUserSongs &&
        window.userLibrary.libraryContent &&
        !window.userLibrary.libraryContent.classList.contains("hidden")
      ) {
        window.userLibrary.renderUserSongs();
      }

      if (window.playlistManager?.renderPlaylistList) {
        window.playlistManager.renderPlaylistList();
      }

      if (window.notifications) {
        window.notifications.success(
          `${successCount} songs transferred from Jukehost`,
        );
      }

      await this.delay(2000);
      this.hideOverlay();
    } catch (error) {
      console.error(error);
      let errorMessage = "Transfer failed.";
      let errorKey = "jukehost.importFailed";

      if (error.message === "INVALID_TOKEN") {
        errorMessage =
          "Token is invalid or expired. Please restart transfer from Jukehost.";
        errorKey = "jukehost.invalidToken";
      } else if (error.message === "LIBRARY_NOT_FOUND") {
        errorMessage = "Library not found.";
        errorKey = "jukehost.libraryNotFound";
      } else if (error.message === "INVALID_FORMAT") {
        errorMessage = "Invalid data format.";
        errorKey = "jukehost.invalidFormat";
      } else if (
        error.name === "TypeError" &&
        error.message.includes("fetch")
      ) {
        errorMessage =
          "Connection error. Please check your internet connection.";
        errorKey = "jukehost.networkError";
      }

      this.updateOverlayStatus("error", errorMessage);

      if (window.notifications) {
        window.notifications.error(errorMessage);
      }

      await this.delay(3000);
      this.hideOverlay();
    } finally {
      this.isProcessing = false;
    }
  }

  showOverlay() {
    if (this.overlay) {
      this.overlay.remove();
    }

    this.overlay = document.createElement("div");
    this.overlay.id = "jukehost-overlay";
    this.overlay.className =
      "fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--background-color)]/95 backdrop-blur-lg transition-all duration-500";
    this.overlay.innerHTML = `
            <div class="text-center max-w-md px-6">
                <div class="mb-6">
                    <div id="jukehost-spinner" class="w-16 h-16 border-4 border-[var(--primary-color)]/30 border-t-[var(--primary-color)] rounded-full animate-spin mx-auto"></div>
                    <div id="jukehost-icon" class="hidden text-6xl mb-2">
                        <span class="material-symbols-rounded" id="jukehost-status-icon">check_circle</span>
                    </div>
                </div>
                <h3 class="text-xl font-semibold text-white mb-2" id="jukehost-title">Jukehost Transfer</h3>
                <p class="text-white/70 mb-4" id="jukehost-message">Starting...</p>
                <div id="jukehost-progress-container" class="hidden w-full bg-white/10 rounded-full h-2 mb-2 overflow-hidden">
                    <div id="jukehost-progress-bar" class="bg-[var(--primary-color)] h-full rounded-full transition-all duration-300" style="width: 0%"></div>
                </div>
                <p id="jukehost-progress-text" class="text-sm text-white/50 hidden">0%</p>
            </div>
        `;

    document.body.appendChild(this.overlay);

    requestAnimationFrame(() => {
      this.overlay.classList.add("opacity-100");
    });
  }

  updateOverlayStatus(status, message) {
    if (!this.overlay) return;

    const title = this.overlay.querySelector("#jukehost-title");
    const messageEl = this.overlay.querySelector("#jukehost-message");
    const spinner = this.overlay.querySelector("#jukehost-spinner");
    const iconContainer = this.overlay.querySelector("#jukehost-icon");
    const icon = this.overlay.querySelector("#jukehost-status-icon");
    const progressContainer = this.overlay.querySelector(
      "#jukehost-progress-container",
    );
    messageEl.textContent = message;
    spinner.classList.add("hidden");
    iconContainer.classList.add("hidden");
    progressContainer.classList.add("hidden");

    switch (status) {
      case "connecting":
      case "fetching":
        spinner.classList.remove("hidden");
        title.textContent = "Connecting to Jukehost";
        break;
      case "processing":
        spinner.classList.remove("hidden");
        progressContainer.classList.remove("hidden");
        title.textContent = "Processing Songs";
        break;
      case "success":
        iconContainer.classList.remove("hidden");
        icon.textContent = "check_circle";
        icon.className = "material-symbols-rounded text-green-400";
        title.textContent = "Transfer Completed!";
        title.className = "text-xl font-semibold text-green-400 mb-2";
        break;
      case "partial":
        iconContainer.classList.remove("hidden");
        icon.textContent = "warning";
        icon.className = "material-symbols-rounded text-yellow-400";
        title.textContent = "Transfer Partially Completed";
        title.className = "text-xl font-semibold text-yellow-400 mb-2";
        break;
      case "error":
        iconContainer.classList.remove("hidden");
        icon.textContent = "error";
        icon.className = "material-symbols-rounded text-red-400";
        title.textContent = "Transfer Failed";
        title.className = "text-xl font-semibold text-red-400 mb-2";
        break;
      case "empty":
        iconContainer.classList.remove("hidden");
        icon.textContent = "folder_open";
        icon.className = "material-symbols-rounded text-white/50";
        title.textContent = "Library Empty";
        break;
    }
  }

  updateOverlayProgress(percent, text) {
    if (!this.overlay) return;

    const progressBar = this.overlay.querySelector("#jukehost-progress-bar");
    const progressText = this.overlay.querySelector("#jukehost-progress-text");
    progressBar.style.width = `${percent}%`;
    progressText.textContent = text || `${percent}%`;
    progressText.classList.remove("hidden");
  }

  hideOverlay() {
    if (!this.overlay) return;

    this.overlay.classList.remove("opacity-100");
    this.overlay.classList.add("opacity-0");

    setTimeout(() => {
      if (this.overlay) {
        this.overlay.remove();
        this.overlay = null;
      }
    }, 500);
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

window.jukehostIntegration = new JukehostIntegration();
