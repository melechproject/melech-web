class PlaylistShare {
  constructor() {
    this.api = window.melechAPI || new MelechAPIClient("supabase");
    this.maxSize = 15 * 1024 * 1024;
    this.currentShareType = "playlist";
    this.shareModal = null;
    this.importModal = null;
    this.init();
  }

  async init() {
    this.createShareUI();
    this.setupEventListeners();
    await this.checkUrlForContent();
  }

  createShareUI() {
    if (!document.getElementById("sharePlaylistModal")) {
      const shareModalHTML = `
                <div id="sharePlaylistModal" class="fixed inset-0 z-[85] opacity-0 pointer-events-none transition-opacity duration-300">
                    <div class="absolute inset-0 bg-black/80" id="sharePlaylistBackdrop"></div>
                    <div class="absolute inset-0 flex items-center justify-center p-4">
                        <div class="bg-[#1a0a0f] rounded-2xl p-6 w-full max-w-md transform scale-95 transition-transform duration-300 shadow-2xl border border-white/10">
                            <div class="flex items-center justify-between mb-3">
                                <h3 class="text-xl font-semibold text-white" data-i18n="share.shareTitle">Share Playlist</h3>
                                <button id="closeShareModal" class="p-2 hover:bg-white/10 rounded-full transition-all">
                                    <span translate="no" class="material-symbols-rounded text-white/60">close</span>
                                </button>
                            </div>
                            
                            <div id="shareContent">
                                <div id="sharePlaylistInfo" class="mb-4 p-3 bg-white/5 rounded-xl">
                                    <div class="flex items-center gap-3" id="shareItemIcon">
                                        <span translate="no" class="material-symbols-rounded text-[var(--primary-color)]">playlist_play</span>
                                        <div>
                                            <p class="text-white font-medium" id="sharePlaylistName">User Playlist</p>
                                            <p class="text-white/50 text-sm" id="sharePlaylistStats">0 songs</p>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="flex gap-2 mb-4">
                                    <button id="confirmShareBtn" class="flex-1 py-3 px-4 bg-[var(--primary-color)] hover:bg-[var(--secondary-color)] text-white rounded-xl transition-all">
                                        <span translate="no" class="material-symbols-rounded inline mr-2">share</span>
                                        <span data-i18n="playlist.share">Share</span>
                                    </button>
                                </div>

                                <p class="text-white/50 text-xs text-center" data-i18n="share.limitInfo"></p>
                            </div>
                            
                            <div id="shareResult" class="hidden">
                                <div class="p-4 bg-green-500/10 border border-green-500/30 rounded-xl mb-4">
                                    <div class="flex items-center gap-2 mb-2">
                                        <span translate="no" class="material-symbols-rounded text-green-400">check_circle</span>
                                        <span class="text-green-400 font-medium" data-i18n="share.shareSuccess">Share Successful!</span>
                                    </div>
                                    <p class="text-white/70 text-sm" data-i18n="share.shareSuccessMessage">Your share will be active for 30 minutes.</p>
                                </div>
                                
                                <div class="flex gap-2 mb-4">
                                    <input type="text" id="shareUrlInput" readonly
                                        class="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus:border-[var(--primary-color)] transition-colors">
                                    <button id="copyShareUrlBtn" class="px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all">
                                        <span translate="no" class="material-symbols-rounded">content_copy</span>
                                    </button>
                                </div>
                                
                                <p class="text-white/50 text-xs text-center" data-i18n="share.limitInfo"></p>
                            </div>
                            
                            <div id="shareError" class="hidden p-4 bg-red-500/10 border border-red-500/30 rounded-xl mt-4">
                                <div class="flex items-center gap-2">
                                    <span translate="no" class="material-symbols-rounded text-red-400">error</span>
                                    <span class="text-red-400 font-medium" id="shareErrorText" data-i18n="share.shareFailed">Share Failed</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

      const div = document.createElement("div");
      div.innerHTML = shareModalHTML;
      document.body.appendChild(div.firstElementChild);
    }

    if (!document.getElementById("importPlaylistModal")) {
      const importModalHTML = `
                <div id="importPlaylistModal" class="fixed inset-0 z-[85] opacity-0 pointer-events-none transition-opacity duration-300">
                    <div class="absolute inset-0 bg-black/80" id="importPlaylistBackdrop"></div>
                    <div class="absolute inset-0 flex items-center justify-center p-4">
                        <div class="bg-[#1a0a0f] rounded-2xl p-6 w-full max-w-md transform scale-95 transition-transform duration-300 shadow-2xl border border-white/10">
                            <div class="flex items-center justify-between mb-3">
                                <h3 id="importModalTitle" class="text-xl font-semibold text-white" data-i18n="share.sharingText">Sharing</h3>
                                <button id="closeImportModal" class="p-2 hover:bg-white/10 rounded-full transition-all">
                                    <span translate="no" class="material-symbols-rounded text-white/60">close</span>
                                </button>
                            </div>
                            
                            <div id="importLoading" class="text-center py-8">
                                <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary-color)] mx-auto mb-4"></div>
                                <p class="text-white/70" data-i18n="share.importLoading">Preparing...</p>
                            </div>
                            
                            <div id="importContent" class="hidden">
                                <div id="importPlaylistInfo" class="p-3 bg-white/5 rounded-xl mb-4">
                                    <div class="flex items-center gap-3">
                                        <div class="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-white/10">
                                            <img id="importPlaylistCover" src="" alt="Cover" class="w-full h-full object-cover hidden">
                                            <span id="importPlaylistCoverIcon" class="material-symbols-rounded text-[var(--primary-color)] w-full h-full flex items-center justify-center">playlist_play</span>
                                        </div>
                                        <div>
                                            <p class="text-white font-medium" id="importPlaylistName">Shared Playlist</p>
                                            <p class="text-white/50 text-sm" id="importPlaylistStats">0 songs</p>
                                        </div>
                                    </div>
                                </div>

                                <div id="importSongInfo" class="p-3 bg-white/5 rounded-xl mb-4 hidden">
                                    <div class="flex items-center gap-3">
                                        <span translate="no" class="material-symbols-rounded text-[var(--primary-color)]">music_note</span>
                                        <div>
                                            <p class="text-white font-medium" id="importSongTitle">Untitled Song</p>
                                            <p class="text-white/50 text-sm" id="importSongArtist">Unknown Artist</p>
                                        </div>
                                    </div>
                                </div>

                                <p class="text-white/70 text-sm mb-4 text-center" id="importDescription">
                                    Do you want to add this playlist to your library?
                                </p>
                                
                                <div class="flex gap-2">
                                    <button id="cancelImportBtn" class="flex-1 py-3 px-4 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all" data-i18n="playlist.cancel">
                                        Cancel
                                    </button>
                                    <button id="confirmImportBtn" class="flex-1 py-3 px-4 bg-[var(--primary-color)] hover:bg-[var(--secondary-color)] text-white rounded-xl transition-all">
                                        <span translate="no" class="material-symbols-rounded inline mr-2">library_add</span>
                                        <span data-i18n="playlist.addToLibrary">Add</span>
                                    </button>
                                </div>
                            </div>
                            
                            <div id="importError" class="hidden p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                                <div class="flex items-center gap-2">
                                    <span translate="no" class="material-symbols-rounded text-red-400">error</span>
                                    <span class="text-red-400 font-medium" id="importErrorText">Import Failed</span>
                                </div>
                                <p class="text-white/70 text-sm mt-2" id="importErrorDetail"></p>
                            </div>
                        </div>
                    </div>
                </div>
            `;

      const div = document.createElement("div");
      div.innerHTML = importModalHTML;
      document.body.appendChild(div.firstElementChild);
    }

    this.shareModal = document.getElementById("sharePlaylistModal");
    this.importModal = document.getElementById("importPlaylistModal");
  }

  setupEventListeners() {
    document
      .getElementById("closeShareModal")
      ?.addEventListener("click", () => this.closeShareModal());
    document
      .getElementById("sharePlaylistBackdrop")
      ?.addEventListener("click", () => this.closeShareModal());
    document
      .getElementById("confirmShareBtn")
      ?.addEventListener("click", () => this.shareCurrentPlaylist());
    document
      .getElementById("copyShareUrlBtn")
      ?.addEventListener("click", () => this.copyShareUrl());
    document
      .getElementById("closeImportModal")
      ?.addEventListener("click", () => this.closeImportModal());
    document
      .getElementById("importPlaylistBackdrop")
      ?.addEventListener("click", () => this.closeImportModal());
    document
      .getElementById("cancelImportBtn")
      ?.addEventListener("click", () => this.closeImportModal());
    document
      .getElementById("confirmImportBtn")
      ?.addEventListener("click", () => this.importSharedPlaylist());
  }

  async getUserPlaylistsForShare() {
    try {
      const playlists = (await window.melechDB.getAllPlaylists()) || [];

      return playlists.map((p) => ({
        id: p.id,
        name: p.name,
        songs: p.songs || [],
        createdAt: p.createdAt,
      }));
    } catch (err) {
      console.error("Failed to get playlists:", err);
      return [];
    }
  }

  async preparePlaylistForShare(playlist) {
    const processedSongs = await Promise.all(
      (playlist.songs || []).map(async (song) => {
        if (song.audioBlob instanceof Blob) {
          try {
            const audioData = await this.blobToBase64(song.audioBlob);
            return { audio: audioData };
          } catch (err) {
            console.warn("Blob to base64 conversion failed:", err);
            return null;
          }
        }

        if (song.audio?.startsWith("blob:")) {
          try {
            const audioBlob = await this.loadAudioBlobFromDB(song.id);
            if (audioBlob) {
              const audioData = await this.blobToBase64(audioBlob);
              return { audio: audioData };
            }
          } catch (err) {
            console.warn("Failed to load audio from IndexedDB:", err);
          }
          console.warn(
            "Skipping Blob URL song (audio file not loaded):",
            song.title,
          );
          return null;
        }

        return {
          title: song.title,
          artist: song.artist,
          image:
            song.image && !song.image.startsWith("data:") ? song.image : null,
          audio: song.audio,
        };
      }),
    );

    const validSongs = processedSongs.filter((s) => s !== null);

    let coverImage = null;
    if (playlist.coverImage) {
      try {
        coverImage = await this.resizeImageTo325(playlist.coverImage);
      } catch (err) {
        console.warn("Failed to process playlist cover image:", err);
        coverImage = this.getDefaultCoverImage();
      }
    } else {
      coverImage = this.getDefaultCoverImage();
    }

    return {
      id: playlist.id,
      name: playlist.name,
      createdAt: playlist.createdAt,
      songs: validSongs,
      coverImage: coverImage,
    };
  }

  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
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
        ctx.fillStyle = "#1a0a0f";
        ctx.fillRect(0, 0, 325, 325);
        const scale = Math.max(325 / img.width, 325 / img.height);
        const x = (325 - img.width * scale) / 2;
        const y = (325 - img.height * scale) / 2;
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
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
          ctx.fillStyle = "#1a0a0f";
          ctx.fillRect(0, 0, 325, 325);
          const scale = Math.max(325 / img.width, 325 / img.height);
          const x = (325 - img.width * scale) / 2;
          const y = (325 - img.height * scale) / 2;
          ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
      }
    });
  }

  getDefaultCoverImage() {
    return "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMjUiIGhlaWdodD0iMzI1IiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9IiNmZmZmZmYiIG9wYWNpdHk9IjAuNCI+PHBhdGggZD0iTTEyIDN2MTAuNTVjLS41OS0uMzQtMS4yNy0uNTUtMi0uNTUtMi4yMSAwLTQgMS43OS00IDRzMS43OSA0IDQgNCA0LTEuNzkgNC00VjdoNHYtN2gtNnptLTIgMTZjLTEuMSAwLTItLjktMi0yczAuOS0yIDItMiAyIC45IDIgMi0uOSAyLTIgMnoiLz48L3N2Zz4=";
  }

  async loadAudioBlobFromDB(songId) {
    if (!window.melechDB) return null;

    try {
      if (window.melechDB.getUserSongById) {
        const song = await window.melechDB.getUserSongById(songId);
        return song?.audioBlob || null;
      }
      const songs = (await window.melechDB.getUserSongs?.()) || [];
      const song = songs.find((s) => s.id === songId);
      return song?.audioBlob || null;
    } catch (err) {
      console.warn("Failed to load song from IndexedDB:", err);
      return null;
    }
  }

  async sharePlaylist(playlist) {
    const prepared = await this.preparePlaylistForShare(playlist);

    if (this.api.getMode() === "supabase") {
      const mplaylistFile = this.api.createMPlaylistFile(prepared);
      if (mplaylistFile.size > this.maxSize) {
        throw new Error(
          `Playlist too large (${(mplaylistFile.size / 1024 / 1024).toFixed(1)}MB > 15MB).`,
        );
      }
      return await this.api.uploadPlaylist(null, mplaylistFile);
    } else {
      const size = new Blob([JSON.stringify(prepared)]).size;
      if (size > this.maxSize) {
        throw new Error(
          `Playlist too large (${(size / 1024 / 1024).toFixed(1)}MB > 15MB)`,
        );
      }
      return await this.api.uploadPlaylist(prepared);
    }
  }

  async fetchSharedPlaylist(uuid) {
    const data = await this.api.getPlaylist(uuid);

    if (this.api.getMode() === "supabase") {
      const playlist = await this.api.parseMPlaylistFile(data);
      return { data: playlist };
    } else {
      return data;
    }
  }

  openShareModal(playlist, type = "playlist") {
    this.currentPlaylist = playlist;
    this.currentShareType = type;

    const titleEl = document.getElementById("sharePlaylistName");
    const statsEl = document.getElementById("sharePlaylistStats");
    const modalTitle = this.shareModal.querySelector("h3");

    const iconEl = document.querySelector("#shareItemIcon span");
    const descEl = document.querySelector("#shareContent > p");

    if (type === "song") {
      const song = playlist.songs?.[0] || playlist;
      modalTitle.textContent = window.t
        ? window.t("song.shareSong")
        : "Share Song";
      titleEl.textContent =
        song.title ||
        (window.t ? window.t("song.unknownSong") : "Unknown Song");
      statsEl.textContent =
        song.artist ||
        (window.t
          ? window.t("song.unknownArtist")
          : window.t
            ? window.t("song.unknownArtist")
            : "Unknown Artist");
      if (iconEl) iconEl.textContent = "music_note";
      if (descEl)
        descEl.textContent = window.t
          ? window.t("share.shareSongDescription")
          : "Your shared song link will be valid for 30 minutes.";
    } else {
      modalTitle.textContent = window.t
        ? window.t("playlist.sharePlaylist")
        : "Share Playlist";
      titleEl.textContent =
        playlist.name ||
        (window.t ? window.t("playlist.unnamedPlaylist") : "Unnamed Playlist");
      statsEl.textContent = `${playlist.songs?.length || 0} ${window.t ? window.t("playlist.song") : "song"}`;
      if (iconEl) iconEl.textContent = "playlist_play";
      if (descEl)
        descEl.textContent = window.t
          ? window.t("share.sharePlaylistDescription")
          : "Your shared playlist link will be valid for 30 minutes.";
    }

    document.getElementById("shareContent").classList.remove("hidden");
    document.getElementById("shareResult").classList.add("hidden");
    document.getElementById("shareError").classList.add("hidden");

    this.shareModal.classList.remove("opacity-0", "pointer-events-none");
    const modalContent = this.shareModal.querySelector(".transform");
    modalContent.classList.remove("scale-95");
    modalContent.classList.add("scale-100");
  }

  closeShareModal() {
    this.shareModal.classList.add("opacity-0", "pointer-events-none");
    const modalContent = this.shareModal.querySelector(".transform");
    modalContent.classList.add("scale-95");
    modalContent.classList.remove("scale-100");
    this.currentPlaylist = null;
  }

  async shareCurrentPlaylist() {
    if (!this.currentPlaylist) return;

    const btn = document.getElementById("confirmShareBtn");
    const loadingText = i18n.t("share.importLoading");
    const originalText = btn.innerHTML;
    btn.innerHTML = `<span data-i18n="share.importLoading" class="material-symbols-rounded inline mr-2 animate-spin">refresh</span><span>${loadingText}</span>`;
    btn.disabled = true;

    try {
      let result;

      if (this.currentShareType === "song") {
        result = await this.shareSong(this.currentPlaylist);
      } else {
        result = await this.sharePlaylist(this.currentPlaylist);
      }

      document.getElementById("shareContent").classList.add("hidden");
      document.getElementById("shareResult").classList.remove("hidden");

      const resultText = document.querySelector("#shareResult .text-white");
      if (resultText) {
        resultText.textContent =
          this.currentShareType === "song"
            ? window.t
              ? window.t("share.shareSongResult")
              : "Your song has been shared with this link:"
            : window.t
              ? window.t("share.sharePlaylistResult")
              : "Your playlist has been shared with this link:";
      }

      const urlInput = document.getElementById("shareUrlInput");
      const uuid = result.uuid;
      const shareUrl = this.api.createShareUrl(
        this.currentShareType === "song" ? "song" : "playlist",
        uuid,
      );
      urlInput.value = shareUrl;
    } catch (err) {
      console.error("Share failed:", err);
      document.getElementById("shareErrorText").textContent = err.message;
      document.getElementById("shareError").classList.remove("hidden");
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  }

  async shareSong(songData) {
    const prepared = await this.prepareSongForShare(songData);
    const singleSongPlaylist = {
      id: `song-${Date.now()}`,
      createdAt: Date.now(),
      songs: [prepared],
    };

    const mplaylistBlob = this.api.createMPlaylistFile(singleSongPlaylist);
    if (mplaylistBlob.size > this.maxSize) {
      throw new Error(
        `File too large (${(mplaylistBlob.size / 1024 / 1024).toFixed(1)}MB > 15MB limit).`,
      );
    }

    const mplaylistFile = new File(
      [mplaylistBlob],
      `song-${Date.now()}.mplaylist`,
      { type: "application/octet-stream" },
    );

    if (this.api.getMode() === "supabase") {
      return await this.api.uploadSong(null, null, mplaylistFile);
    } else {
      return await this.api.uploadSong(prepared);
    }
  }

  base64ToBlob(base64, mimeType = "audio/mpeg") {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }

  dataURItoBlob(dataUri) {
    try {
      const matches = dataUri.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        return null;
      }
      const mimeType = matches[1];
      const base64 = matches[2];
      return this.base64ToBlob(base64, mimeType);
    } catch (err) {
      return null;
    }
  }

  async extractMetadataFromDataURI(dataUri) {
    return new Promise((resolve) => {
      const result = { title: null, artist: null, image: null };

      if (typeof jsmediatags === "undefined") {
        resolve(result);
        return;
      }

      const base64Match = dataUri.match(/base64,(.+)$/);
      if (!base64Match) {
        resolve(result);
        return;
      }

      try {
        const base64 = base64Match[1];
        const blob = this.base64ToBlob(base64);

        jsmediatags.read(blob, {
          onSuccess: (tag) => {
            const tags = tag.tags;
            if (tags.title) result.title = tags.title;
            if (tags.artist) result.artist = tags.artist;
            if (tags.picture) {
              const { data, type } = tags.picture;
              const byteArray = new Uint8Array(data);
              const base64 = btoa(String.fromCharCode.apply(null, byteArray));
              result.image = `data:${type};base64,${base64}`;
            }
            resolve(result);
          },
          onError: (error) => {
            resolve(result);
          },
        });
      } catch (err) {
        resolve(result);
      }
    });
  }

  async extractMetadataFromURL(audioUrl) {
    return new Promise(async (resolve) => {
      const result = { title: null, artist: null, image: null };

      if (typeof jsmediatags === "undefined") {
        resolve(result);
        return;
      }

      try {
        const response = await fetch(audioUrl);
        if (!response.ok) {
          resolve(result);
          return;
        }

        const blob = await response.blob();

        jsmediatags.read(blob, {
          onSuccess: (tag) => {
            const tags = tag.tags;
            if (tags.title) result.title = tags.title;
            if (tags.artist) result.artist = tags.artist;
            if (tags.picture) {
              const { data, type } = tags.picture;
              const byteArray = new Uint8Array(data);
              const base64 = btoa(String.fromCharCode.apply(null, byteArray));
              result.image = `data:${type};base64,${base64}`;
            }
            resolve(result);
          },
          onError: (error) => {
            resolve(result);
          },
        });
      } catch (err) {
        resolve(result);
      }
    });
  }

  async extractMetadata(audioSource) {
    if (audioSource?.startsWith("data:")) {
      return await this.extractMetadataFromDataURI(audioSource);
    } else if (
      audioSource?.startsWith("http:") ||
      audioSource?.startsWith("https:")
    ) {
      return await this.extractMetadataFromURL(audioSource);
    }
    return { title: null, artist: null, image: null };
  }

  async prepareSongForShare(songData) {
    const song = songData.songs?.[0] || songData;

    if (song.audioBlob instanceof Blob) {
      try {
        const audioData = await this.blobToBase64(song.audioBlob);
        return {
          title:
            song.title ||
            (window.t ? window.t("song.untitledSong") : "Untitled Song"),
          artist:
            song.artist ||
            (window.t ? window.t("song.unknownArtist") : "Unknown Artist"),
          audio: audioData,
        };
      } catch (err) {
        console.warn("Blob to base64 conversion failed:", err);
        throw new Error("Failed to convert song to base64");
      }
    }

    if (song.audio?.startsWith("blob:")) {
      try {
        const audioBlob = await this.loadAudioBlobFromDB(song.id);
        if (audioBlob) {
          const audioData = await this.blobToBase64(audioBlob);
          return {
            title:
              song.title ||
              (window.t ? window.t("song.untitledSong") : "Untitled Song"),
            artist:
              song.artist ||
              (window.t ? window.t("song.unknownArtist") : "Unknown Artist"),
            audio: audioData,
          };
        }
      } catch (err) {
        console.warn("Failed to load audio from IndexedDB:", err);
      }
      throw new Error("Audio file for song not found");
    }

    return {
      title: song.title,
      artist: song.artist,
      audio: song.audio,
    };
  }

  copyShareUrl() {
    const urlInput = document.getElementById("shareUrlInput");
    urlInput.select();
    document.execCommand("copy");

    const btn = document.getElementById("copyShareUrlBtn");
    const originalIcon = btn.innerHTML;
    btn.innerHTML =
      '<span translate="no" class="material-symbols-rounded text-green-400">check</span>';

    setTimeout(() => {
      btn.innerHTML = originalIcon;
    }, 2000);
  }

  async checkUrlForContent() {
    const urlParams = new URLSearchParams(window.location.search);

    const playlistUuid = urlParams.get("playlist");
    const songUuid = urlParams.get("song");

    if (songUuid) {
      await this.loadSharedSong(songUuid);
    } else if (playlistUuid) {
      await this.loadSharedPlaylist(playlistUuid);
    }
  }

  async loadSharedContent(uuid) {
    this.importModal.classList.remove("opacity-0", "pointer-events-none");
    const modalContent = this.importModal.querySelector(".transform");
    modalContent.classList.remove("scale-95");
    modalContent.classList.add("scale-100");

    document.getElementById("importLoading").classList.remove("hidden");
    document.getElementById("importContent").classList.add("hidden");
    document.getElementById("importError").classList.add("hidden");

    try {
      let data;
      let type = "playlist";

      try {
        data = await this.fetchSharedPlaylist(uuid);
      } catch (playlistErr) {
        try {
          data = await this.fetchSharedSong(uuid);
          type = "song";
        } catch (songErr) {
          throw new Error("Shared content not found");
        }
      }

      this.pendingImport = data;

      if (type === "playlist") {
        this.pendingImportType = "playlist";

        const modalTitle = document.getElementById("importModalTitle");
        if (modalTitle) {
          modalTitle.setAttribute("data-i18n", "share.sharedPlaylistTitle");
          modalTitle.textContent = window.t
            ? window.t("share.sharedPlaylistTitle")
            : "Paylaşılan Liste";
        }

        document
          .getElementById("importPlaylistInfo")
          .classList.remove("hidden");
        document.getElementById("importSongInfo").classList.add("hidden");
        document.getElementById("importPlaylistName").textContent =
          data.data?.name ||
          (window.t
            ? window.t("playlist.unnamedPlaylist")
            : "Unnamed Playlist");
        document.getElementById("importPlaylistStats").textContent =
          `${data.data?.songs?.length || 0} ${window.t ? window.t("playlist.song") : "song"}`;
        document.getElementById("importDescription").textContent = window.t
          ? window.t("share.importDescription")
          : "Do you want to add this playlist to your library?";

        const coverImg = document.getElementById("importPlaylistCover");
        const coverIcon = document.getElementById("importPlaylistCoverIcon");
        if (data.data?.coverImage) {
          coverImg.src = data.data.coverImage;
          coverImg.classList.remove("hidden");
          if (coverIcon) coverIcon.classList.add("hidden");
        } else {
          coverImg.classList.add("hidden");
          if (coverIcon) coverIcon.classList.remove("hidden");
        }

        const confirmBtn = document.getElementById("confirmImportBtn");
        const addToLibraryText = window.t
          ? window.t("playlist.addToLibrary")
          : "Add to Library";
        if (confirmBtn) {
          confirmBtn.innerHTML = `<span translate="no" class="material-symbols-rounded inline mr-2">playlist_add</span>${addToLibraryText}`;
        }
      } else {
        this.pendingImportType = "song";

        const modalTitle = document.getElementById("importModalTitle");
        if (modalTitle) {
          modalTitle.setAttribute("data-i18n", "share.sharedSongTitle");
          modalTitle.textContent = window.t
            ? window.t("share.sharedSongTitle")
            : "Paylaşılan Şarkı";
        }

        document.getElementById("importPlaylistInfo").classList.add("hidden");
        document.getElementById("importSongInfo").classList.remove("hidden");
        const songData = data.data || data;
        document.getElementById("importSongTitle").textContent =
          songData.title ||
          (window.t ? window.t("song.unknownSong") : "Unknown Song");
        document.getElementById("importSongArtist").textContent =
          songData.artist ||
          (window.t
            ? window.t("song.unknownArtist")
            : window.t
              ? window.t("song.unknownArtist")
              : "Unknown Artist");
        document.getElementById("importDescription").textContent = window.t
          ? window.t("share.importSongDescription")
          : "This song has been shared with you. Add it to your library?";

        const confirmBtn = document.getElementById("confirmImportBtn");
        const addToLibraryText = window.t
          ? window.t("playlist.addToLibrary")
          : "Add to Library";
        if (confirmBtn) {
          confirmBtn.innerHTML = `<span translate="no" class="material-symbols-rounded inline mr-2">library_add</span>${addToLibraryText}`;
        }
      }

      document.getElementById("importLoading").classList.add("hidden");
      document.getElementById("importContent").classList.remove("hidden");
    } catch (err) {
      console.error("Failed to load shared content:", err);
      document.getElementById("importLoading").classList.add("hidden");
      document.getElementById("importError").classList.remove("hidden");
      document.getElementById("importErrorText").textContent = window.t
        ? window.t("playlist.importFailed")
        : "Import failed";
      document.getElementById("importErrorDetail").textContent = err.message;
    }
  }

  async loadSharedPlaylist(uuid) {
    this.importModal.classList.remove("opacity-0", "pointer-events-none");
    const modalContent = this.importModal.querySelector(".transform");
    modalContent.classList.remove("scale-95");
    modalContent.classList.add("scale-100");

    document.getElementById("importLoading").classList.remove("hidden");
    document.getElementById("importContent").classList.add("hidden");
    document.getElementById("importError").classList.add("hidden");

    try {
      const playlist = await this.fetchSharedPlaylist(uuid);
      this.pendingImport = playlist;
      this.pendingImportType = "playlist";

      const modalTitle = document.getElementById("importModalTitle");
      if (modalTitle) {
        modalTitle.setAttribute("data-i18n", "share.sharedPlaylistTitle");
        modalTitle.textContent = window.t
          ? window.t("share.sharedPlaylistTitle")
          : "Paylaşılan Liste";
      }

      document.getElementById("importPlaylistInfo").classList.remove("hidden");
      document.getElementById("importSongInfo").classList.add("hidden");

      document.getElementById("importPlaylistName").textContent =
        playlist.data?.name ||
        (window.t ? window.t("playlist.unnamedPlaylist") : "Unnamed Playlist");
      document.getElementById("importPlaylistStats").textContent =
        `${playlist.data?.songs?.length || 0} ${window.t ? window.t("playlist.song") : "song"}`;
      document.getElementById("importDescription").textContent = window.t
        ? window.t("share.importDescription")
        : "Do you want to add this playlist to your library?";

      const coverImg = document.getElementById("importPlaylistCover");
      const coverIcon = document.getElementById("importPlaylistCoverIcon");
      if (playlist.data?.coverImage) {
        coverImg.src = playlist.data.coverImage;
        coverImg.classList.remove("hidden");
        if (coverIcon) coverIcon.classList.add("hidden");
      } else {
        coverImg.classList.add("hidden");
        if (coverIcon) coverIcon.classList.remove("hidden");
      }

      const confirmBtn = document.getElementById("confirmImportBtn");
      const addToLibraryText = window.t
        ? window.t("playlist.addToLibrary")
        : "Add to Library";
      if (confirmBtn) {
        confirmBtn.innerHTML = `<span translate="no" class="material-symbols-rounded inline mr-2">playlist_add</span>${addToLibraryText}`;
      }

      document.getElementById("importLoading").classList.add("hidden");
      document.getElementById("importContent").classList.remove("hidden");
    } catch (err) {
      console.error("Failed to load shared playlist:", err);
      document.getElementById("importLoading").classList.add("hidden");
      document.getElementById("importError").classList.remove("hidden");
      document.getElementById("importErrorText").textContent = window.t
        ? window.t("playlist.importFailed")
        : "Import failed";
      document.getElementById("importErrorDetail").textContent = err.message;
    }
  }

  closeImportModal() {
    this.importModal.classList.add("opacity-0", "pointer-events-none");
    const modalContent = this.importModal.querySelector(".transform");
    modalContent.classList.add("scale-95");
    modalContent.classList.remove("scale-100");
    this.pendingImport = null;

    if (window.history.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.delete("get");
      url.searchParams.delete("playlist");
      url.searchParams.delete("song");
      window.history.replaceState({}, "", url.toString());
    }
  }

  async fetchSharedSong(uuid) {
    const data = await this.api.getSong(uuid);

    if (this.api.getMode() === "supabase") {
      if (data instanceof Blob) {
        try {
          const playlist = await this.api.parseMPlaylistFile(data);
          const song = playlist.songs?.[0];
          if (song) {
            return { data: song, source: "supabase" };
          }
        } catch (err) {
          console.error(err);
        }
        return { data: { audioBlob: data }, source: "supabase" };
      } else {
        return { data: data };
      }
    } else {
      return data;
    }
  }

  async extractMetadataFromBlob(blob) {
    return new Promise((resolve) => {
      const result = { title: null, artist: null, image: null };

      if (typeof jsmediatags === "undefined") {
        resolve(result);
        return;
      }

      try {
        jsmediatags.read(blob, {
          onSuccess: (tag) => {
            const tags = tag.tags;
            if (tags.title) result.title = tags.title;
            if (tags.artist) result.artist = tags.artist;
            if (tags.picture) {
              const { data, type } = tags.picture;
              const byteArray = new Uint8Array(data);
              const base64 = btoa(String.fromCharCode.apply(null, byteArray));
              result.image = `data:${type};base64,${base64}`;
            }
            resolve(result);
          },
          onError: (error) => {
            console.log("Metadata extraction from blob failed:", error);
            resolve(result);
          },
        });
      } catch (err) {
        console.warn("Blob metadata extraction failed:", err);
        resolve(result);
      }
    });
  }

  async loadSharedSong(uuid) {
    this.importModal.classList.remove("opacity-0", "pointer-events-none");
    const modalContent = this.importModal.querySelector(".transform");
    modalContent.classList.remove("scale-95");
    modalContent.classList.add("scale-100");

    document.getElementById("importLoading").classList.remove("hidden");
    document.getElementById("importContent").classList.add("hidden");
    document.getElementById("importError").classList.add("hidden");

    try {
      const song = await this.fetchSharedSong(uuid);
      this.pendingImport = song;
      this.pendingImportType = "song";
      const rawData = song.data || song;
      const songData = rawData.songs?.[0] || rawData;
      console.log(
        "[loadSharedSong] Displaying song:",
        songData.title,
        "-",
        songData.artist,
      );

      const modalTitle = document.getElementById("importModalTitle");
      if (modalTitle) {
        modalTitle.setAttribute("data-i18n", "share.sharedSongTitle");
        modalTitle.textContent = window.t
          ? window.t("share.sharedSongTitle")
          : "Paylaşılan Şarkı";
      }

      document.getElementById("importPlaylistInfo").classList.add("hidden");
      document.getElementById("importSongInfo").classList.remove("hidden");
      document.getElementById("importSongTitle").textContent =
        songData.title ||
        (window.t ? window.t("song.unknownSong") : "Unknown Song");
      document.getElementById("importSongArtist").textContent =
        songData.artist ||
        (window.t
          ? window.t("song.unknownArtist")
          : window.t
            ? window.t("song.unknownArtist")
            : "Unknown Artist");
      document.getElementById("importDescription").textContent = window.t
        ? window.t("share.importSongDescription")
        : "This song has been shared with you. Add it to your library?";

      const confirmBtn = document.getElementById("confirmImportBtn");
      const addToLibraryText = window.t
        ? window.t("playlist.addToLibrary")
        : "Add to Library";
      if (confirmBtn) {
        confirmBtn.innerHTML = `<span translate="no" class="material-symbols-rounded inline mr-2">library_add</span>${addToLibraryText}`;
      }

      document.getElementById("importLoading").classList.add("hidden");
      document.getElementById("importContent").classList.remove("hidden");
    } catch (err) {
      console.error("Failed to load shared song:", err);
      document.getElementById("importLoading").classList.add("hidden");
      document.getElementById("importError").classList.remove("hidden");
      document.getElementById("importErrorText").textContent = window.t
        ? window.t("playlist.importFailed")
        : "Import failed";
      document.getElementById("importErrorDetail").textContent = err.message;
    }
  }

  async importSharedPlaylist() {
    if (!this.pendingImport) return;

    const btn = document.getElementById("confirmImportBtn");
    const originalText = btn.innerHTML;
    btn.innerHTML =
      '<span translate="no" class="material-symbols-rounded inline mr-2 animate-spin">refresh</span>';
    btn.disabled = true;

    try {
      if (this.pendingImportType === "song" || this.pendingImport.data?.title) {
        await this.importSharedSong();
      } else {
        await this.importSharedPlaylistOnly();
      }
    } catch (err) {
      console.error("Import failed:", err);
      document.getElementById("importContent").classList.add("hidden");
      document.getElementById("importError").classList.remove("hidden");
      document.getElementById("importErrorText").textContent = window.t
        ? window.t("share.addFailed")
        : "Ekleme başarısız";
      document.getElementById("importErrorDetail").textContent = err.message;
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  }

  async importSharedPlaylistOnly() {
    const playlistData = this.pendingImport.data;
    const addedSongs = [];
    const skippedSongs = [];
    const totalSongs = playlistData.songs?.length || 0;

    document.getElementById("importContent").classList.add("hidden");
    document.getElementById("importLoading").classList.remove("hidden");
    const loadingText = document.querySelector("#importLoading p");

    for (let i = 0; i < (playlistData.songs || []).length; i++) {
      const song = playlistData.songs[i];
      if (loadingText) {
        loadingText.textContent = `${i + 1}/${totalSongs} şarkı işleniyor...`;
      }
      let songMetadata = {
        title: song.title,
        artist: song.artist,
        image: song.image,
      };
      let audioBlob = null;

      if (song.audio?.startsWith("data:")) {
        audioBlob = this.dataURItoBlob(song.audio);
      }

      if (
        song.audio &&
        (song.audio.startsWith("data:") ||
          song.audio.startsWith("http:") ||
          song.audio.startsWith("https:"))
      ) {
        if (loadingText) {
          loadingText.textContent = `Extracting metadata... ${i + 1}/${totalSongs}`;
        }
        const extracted = await this.extractMetadata(song.audio);
        songMetadata = {
          title:
            song.title ||
            extracted.title ||
            (window.t ? window.t("song.untitledSong") : "Untitled Song"),
          artist:
            song.artist ||
            extracted.artist ||
            (window.t ? window.t("song.unknownArtist") : "Unknown Artist"),
          image: extracted.image || song.image,
        };
      }

      const hasValidMetadata =
        songMetadata.title &&
        songMetadata.title !==
          (window.t ? window.t("song.untitledSong") : "Untitled Song") &&
        songMetadata.artist &&
        songMetadata.artist !==
          (window.t ? window.t("song.unknownArtist") : "Unknown Artist");

      const existingSong =
        hasValidMetadata &&
        window.userLibrary?.userSongs?.find(
          (s) =>
            s.title &&
            s.artist &&
            s.title.toLowerCase() === songMetadata.title.toLowerCase() &&
            s.artist.toLowerCase() === songMetadata.artist.toLowerCase(),
        );

      if (existingSong) {
        skippedSongs.push(song);
        continue;
      }

      const newSong = {
        id: `shared-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: songMetadata.title,
        artist: songMetadata.artist,
        image: songMetadata.image,
        audio: song.audio,
        audioBlob: audioBlob,
        source: "shared",
        addedAt: Date.now(),
      };

      if (window.melechDB) {
        await window.melechDB.saveUserSong(newSong);
      }

      if (window.userLibrary) {
        window.userLibrary.userSongs.push({
          id: newSong.id,
          title: newSong.title,
          artist: newSong.artist,
          image: newSong.image,
          source: newSong.source,
          addedAt: newSong.addedAt,
          hasAudioBlob: !!audioBlob,
          audio: newSong.audio,
        });
      }

      addedSongs.push(newSong);
    }

    const updatedPlaylistSongs = playlistData.songs.map((song) => {
      const existingInLibrary = window.userLibrary?.userSongs?.find(
        (s) =>
          s.title?.toLowerCase() === song.title?.toLowerCase() &&
          s.artist?.toLowerCase() === song.artist?.toLowerCase(),
      );

      if (existingInLibrary) {
        return { ...song, id: existingInLibrary.id };
      }

      const newlyAdded = addedSongs.find(
        (s) =>
          s.title?.toLowerCase() === song.title?.toLowerCase() &&
          s.artist?.toLowerCase() === song.artist?.toLowerCase(),
      );

      if (newlyAdded) {
        return { ...song, id: newlyAdded.id };
      }

      return song;
    });

    const newPlaylist = {
      id: `shared-${Date.now()}`,
      name: `${playlistData.name}`,
      trackIds: updatedPlaylistSongs.map((song) => song.id),
      tracks: updatedPlaylistSongs.map((song) => ({
        ...song,
        isFavorite: false,
        addedAt: Date.now(),
      })),
      createdAt: Date.now(),
      source: "shared",
      coverImage: playlistData.coverImage || this.getDefaultCoverImage(),
    };

    if (window.melechDB) {
      await window.melechDB.savePlaylist(newPlaylist);
    }

    if (window.playlistManager) {
      window.playlistManager.playlists.push(newPlaylist);
      await window.playlistManager.savePlaylists();
      window.playlistManager.renderPlaylistList();
    }

    let notificationMsg = window.t
      ? window.t("playlist.importSuccess", { name: newPlaylist.name })
      : `Playlist "${newPlaylist.name}" added.`;

    if (window.notifications) {
      window.notifications.show(notificationMsg, "success");
    }

    if (window.userLibrary) {
      if (
        window.userLibrary.libraryContent &&
        !window.userLibrary.libraryContent.classList.contains("hidden")
      ) {
        window.userLibrary.renderUserSongs();
      }
      window.userLibrary.switchTab("library");
    }

    this.closeImportModal();
  }

  async importSharedSong() {
    let rawData = this.pendingImport.data || this.pendingImport;
    let songData = rawData.songs?.[0] || rawData;
    let audioBlob = null;

    document.getElementById("importContent").classList.add("hidden");
    document.getElementById("importLoading").classList.remove("hidden");
    const loadingText = document.querySelector("#importLoading p");
    if (loadingText) {
      loadingText.textContent = window.t
        ? window.t("share.extractingMetadata")
        : "Metadata extracting...";
    }

    if (songData.audio?.startsWith("data:")) {
      audioBlob = this.dataURItoBlob(songData.audio);
    }

    if (
      songData.audio &&
      (songData.audio.startsWith("data:") ||
        songData.audio.startsWith("http:") ||
        songData.audio.startsWith("https:"))
    ) {
      const extracted = await this.extractMetadata(songData.audio);
      songData = {
        ...songData,
        title:
          songData.title ||
          extracted.title ||
          (window.t ? window.t("song.untitledSong") : "Untitled Song"),
        artist:
          songData.artist ||
          extracted.artist ||
          (window.t ? window.t("song.unknownArtist") : "Unknown Artist"),
        image: extracted.image || songData.image,
      };
      if (loadingText && songData.image) {
        loadingText.textContent = window.t
          ? window.t("share.coverImageFound")
          : "Kapak resmi bulundu ✓";
      }
    }

    const hasValidSongData =
      songData.title &&
      songData.title !==
        (window.t ? window.t("song.untitledSong") : "Untitled Song") &&
      songData.artist &&
      songData.artist !==
        (window.t ? window.t("song.unknownArtist") : "Unknown Artist");

    const existingSong =
      hasValidSongData &&
      window.userLibrary?.userSongs?.find(
        (s) =>
          s.title &&
          s.artist &&
          s.title.toLowerCase() === songData.title.toLowerCase() &&
          s.artist.toLowerCase() === songData.artist.toLowerCase(),
      );

    if (existingSong) {
      if (window.notifications) {
        window.notifications.show(
          window.t
            ? window.t("song.alreadyExists")
            : "This song already exists in your library",
          "info",
        );
      }
      this.closeImportModal();
      return;
    }

    const newSong = {
      id: `shared-song-${Date.now()}`,
      title:
        songData.title ||
        (window.t ? window.t("song.untitledSong") : "Untitled Song"),
      artist:
        songData.artist ||
        (window.t ? window.t("song.unknownArtist") : "Unknown Artist"),
      image: songData.image,
      audio: songData.audio,
      audioBlob: audioBlob,
      source: "shared",
      addedAt: Date.now(),
    };

    if (window.melechDB) {
      try {
        await window.melechDB.saveUserSong(newSong);
      } catch (err) {
        throw new Error("Failed to save song: " + err.message);
      }
    }

    if (window.userLibrary) {
      window.userLibrary.userSongs.push({
        id: newSong.id,
        title: newSong.title,
        artist: newSong.artist,
        image: newSong.image,
        source: newSong.source,
        addedAt: newSong.addedAt,
        hasAudioBlob: !!audioBlob,
        audio: newSong.audio,
      });
      if (
        window.userLibrary.libraryContent &&
        !window.userLibrary.libraryContent.classList.contains("hidden")
      ) {
        window.userLibrary.renderUserSongs();
      }
    }

    if (window.notifications) {
      window.notifications.show(
        `"${newSong.title}" added to library`,
        "success",
      );
    }

    if (window.userLibrary) {
      window.userLibrary.switchTab("library");
    }

    this.closeImportModal();
    console.log("[importSharedSong] Import completed successfully");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.playlistShare = new PlaylistShare();
});
