class MusicLibrary {
  constructor() {
    this.songGrid = document.getElementById("songGrid");
    this.refreshBtn = document.getElementById("refreshLibrary");
    this.songSearchInput = document.getElementById("songSearch");
    this.jamendoClientId = "d63aca13";

    this.allTracks = [];
    this.loadedCount = 0;
    this.batchSize = 20;
    this.isLoading = false;
    this.observer = null;
    this.abortController = null;
    this.contextMenu = null;
    this.longPressTimer = null;
    this.isLongPress = false;
    this.exploreLimit = 30;
    this.renderedTrackIds = new Set();

    this.init();
  }

  async init() {
    this.createContextMenu();
    this.setupEventDelegation();
    if (window.melechDB) {
      this.exploreLimit = await window.melechDB.getSetting(
        "exploreSongLimit",
        30,
      );
    }
    await this.loadLibrary();
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

  createContextMenu() {
    this.contextMenu = document.createElement("div");
    this.contextMenu.className = "context-menu";
    this.contextMenu.innerHTML = `
            <div class="context-menu-item" data-action="edit">
                <span class="material-symbols-rounded">edit</span>
                <span data-i18n="song.editSong">Edit Song</span>
            </div>
            <div class="context-menu-item delete" data-action="delete">
                <span class="material-symbols-rounded">delete</span>
                <span data-i18n="song.deleteSong">Delete Song</span>
            </div>
            <div class="context-menu-divider"></div>
            <div class="context-menu-item" data-action="download">
                <span class="material-symbols-rounded">download</span>
                <span data-i18n="contextMenu.download">Download</span>
            </div>
        `;
    document.body.appendChild(this.contextMenu);

    this.contextMenu.addEventListener("click", async (e) => {
      const item = e.target.closest(".context-menu-item");
      if (!item) return;

      const action = item.dataset.action;
      const trackId = this.contextMenu.dataset.trackId;
      const track = this.allTracks.find((t) => t.id === trackId);

      if (track) {
        switch (action) {
          case "edit":
            this.editTrack(track);
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
        if (this.contextMenu && !this.contextMenu.contains(e.target)) {
          this.hideContextMenu();
        }
      },
      true,
    );

    window.addEventListener("scroll", () => this.hideContextMenu(), true);
  }

  showContextMenu(x, y, trackId) {
    this.contextMenu.dataset.trackId = trackId;

    const track = this.allTracks.find((t) => t.id === trackId);
    if (!track) return;

    const downloadItem = this.contextMenu.querySelector(
      '[data-action="download"]',
    );
    const deleteItem = this.contextMenu.querySelector('[data-action="delete"]');
    const editItem = this.contextMenu.querySelector('[data-action="edit"]');
    const divider = this.contextMenu.querySelector(".context-menu-divider");

    const isJamendo = track.source === "Jamendo";
    const isExternalSource = isJamendo;

    if (downloadItem) downloadItem.style.display = "";
    if (deleteItem) deleteItem.style.display = isExternalSource ? "none" : "";
    if (editItem) editItem.style.display = isExternalSource ? "none" : "";

    const hasTopItems = !isExternalSource;
    if (divider) divider.style.display = hasTopItems ? "" : "none";

    const anyVisible =
      (downloadItem && downloadItem.style.display !== "none") ||
      (deleteItem && deleteItem.style.display !== "none") ||
      (editItem && editItem.style.display !== "none");

    if (!anyVisible) {
      this.hideContextMenu();
      return;
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
    if (window.userLibrary && window.userLibrary.editTrack) {
      window.userLibrary.editTrack(track);
    } else {
      console.warn("userLibrary.editTrack not available");
      window.notifications?.error("errors.generic");
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
      if (window.melechDB) {
        await window.melechDB.deleteUserSong(track.id);
      }

      if (window.userLibrary && window.userLibrary.userSongs) {
        window.userLibrary.userSongs = window.userLibrary.userSongs.filter(
          (s) => s.id !== track.id,
        );
      }

      const card = this.songGrid.querySelector(`[data-id="${track.id}"]`);
      if (card) card.remove();
      this.allTracks = this.allTracks.filter((t) => t.id !== track.id);

      window.notifications?.success("song.deleteSuccess");
    } catch (error) {
      console.error("Error deleting song:", error);
      window.notifications?.error("song.deleteError");
    }
  }

  async downloadTrack(track) {
    if (!track) {
      window.notifications?.error("song.downloadError");
      return;
    }

    const audioUrl = track.audioDataUrl || track.audio;
    if (!audioUrl) {
      window.notifications?.error("song.downloadError");
      return;
    }

    const fileName = `${track.title || "Unknown"} - ${track.artist || "Unknown"}.mp3`;

    const isJukehost = audioUrl.includes("audio.jukehost.co.uk");
    const isJamendo = track.source === "Jamendo";
    const shouldFetch = isJukehost || isJamendo;

    try {
      if (shouldFetch) {
        const response = await fetch(audioUrl);
        if (!response.ok) throw new Error("Failed to fetch");
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
      console.error("Download error:", error);
      window.notifications?.error("song.downloadError");
    }
  }

  async loadLibrary() {
    if (this.isLoading) return;

    if (this.abortController) {
      this.abortController.abort();
    }

    this.abortController = new AbortController();
    const { signal } = this.abortController;

    try {
      if (signal.aborted) return;
      this.renderSkeleton();
      this.loadedCount = 0;
      this.isLoading = true;
      this.allTracks = [];
      this.renderedTrackIds.clear();
      await this.startStreamingLoad();
    } catch (error) {
      if (error.name === "AbortError") return;
      console.error("Library load error:", error);
      this.isLoading = false;
      if (this.songGrid) {
        const errorMsg = window.t
          ? window.t("library.loadingError")
          : "An error occurred while loading. Please try again.";
        this.songGrid.innerHTML = `<p class="col-span-full text-center text-white/50 py-10">${errorMsg}</p>`;
      }
    }
  }

  async startStreamingLoad() {
    const excludeIds = new Set();
    if (window.melechDB) {
      try {
        const userSongs = await window.melechDB.getUserSongs();
        if (userSongs) userSongs.forEach((s) => excludeIds.add(s.id));
      } catch (e) {
        console.error("Failed to get user songs for exclusion:", e);
      }
    }

    const jamendoPromise = this.fetchJamendoWithTimeout(
      8000,
      this.exploreLimit,
      excludeIds,
    );
    const [jamendoTracks] = await Promise.allSettled([jamendoPromise]);
    const validJamendoTracks =
      jamendoTracks.status === "fulfilled" ? jamendoTracks.value : [];

    this.allTracks = [];
    if (validJamendoTracks.length > 0) {
      validJamendoTracks.forEach((t) => this.allTracks.push(t));
    }

    if (this.allTracks.length > 0) {
      this.shuffleArray(this.allTracks);
      this.renderNextBatch();
      this.setupLazyLoading();
    }

    this.isLoading = false;

    if (this.allTracks.length === 0) {
      const noTracksMsg = window.t
        ? window.t("library.noTracksLoaded")
        : "Could not load music. Please try again.";
      this.songGrid.innerHTML = `<p class="col-span-full text-center text-white/50 py-10">${noTracksMsg}</p>`;
    }
  }

  fetchWithTimeout(url, options, timeout) {
    return Promise.race([
      fetch(url, options),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Fetch timeout")), timeout),
      ),
    ]);
  }

  getJamendoApiUrl(limit) {
    return `https://api.jamendo.com/v3.0/tracks?client_id=${this.jamendoClientId}&format=json&limit=${limit}&order=popularity_week`;
  }

  getJamendoSearchApiUrl(searchInput, limit) {
    const query = encodeURIComponent(searchInput);
    return `https://api.jamendo.com/v3.0/tracks/?client_id=${this.jamendoClientId}&format=json&limit=${limit}&namesearch=${query}`;
  }

  async fetchJamendoSearchWithTimeout(
    query,
    timeout,
    limit,
    excludeIds = new Set(),
  ) {
    try {
      const response = await this.fetchWithTimeout(
        this.getJamendoSearchApiUrl(query, Math.max(limit, 20)),
        { signal: this.abortController?.signal },
        timeout,
      );
      const data = await response.json();
      const uniqueMap = new Map();

      if (data.results) {
        data.results.forEach((t) => {
          const id = `jam-${t.id}`;
          if (!uniqueMap.has(id) && !excludeIds.has(id)) {
            uniqueMap.set(id, {
              id,
              title: t.name,
              artist: t.artist_name,
              image: t.image || t.album_image,
              audio: t.audio,
              source: "Jamendo",
            });
          }
        });
      }

      return Array.from(uniqueMap.values()).slice(0, limit);
    } catch (err) {
      if (err.name === "AbortError") return [];
      console.error("Jamendo search error:", err);
      return [];
    }
  }

  async searchExplore(query) {
    const searchQuery = (query || "").trim();
    if (!searchQuery) {
      await this.loadLibrary();
      return;
    }

    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    this.renderSkeleton();
    this.loadedCount = 0;
    this.isLoading = true;
    this.allTracks = [];
    this.renderedTrackIds.clear();
    if (this.observer) this.observer.disconnect();

    const excludeIds = new Set();
    if (window.melechDB) {
      try {
        const userSongs = await window.melechDB.getUserSongs();
        if (userSongs) userSongs.forEach((s) => excludeIds.add(s.id));
      } catch (e) {
        console.error("Failed to get user songs for search exclusion:", e);
      }
    }

    const [jamendoResult] = await Promise.allSettled([
      this.fetchJamendoSearchWithTimeout(
        searchQuery,
        8000,
        this.exploreLimit,
        excludeIds,
      ),
    ]);

    const jamendoTracks =
      jamendoResult.status === "fulfilled" ? jamendoResult.value : [];

    this.allTracks = [...jamendoTracks];
    this.isLoading = false;

    if (this.allTracks.length === 0) {
      const noTracksMsg = window.t
        ? window.t("library.noTracksLoaded")
        : "No matching songs found.";
      this.songGrid.innerHTML = `<p class="col-span-full text-center text-white/50 py-10">${noTracksMsg}</p>`;
      return;
    }

    this.renderNextBatch();
    this.setupLazyLoading();
  }

  async fetchJamendoWithTimeout(timeout, count, excludeIds = new Set()) {
    try {
      const response = await this.fetchWithTimeout(
        this.getJamendoApiUrl(50),
        { signal: this.abortController?.signal },
        timeout,
      );
      const data = await response.json();

      const uniqueMap = new Map();
      if (data.results) {
        data.results.forEach((t) => {
          const id = `jam-${t.id}`;
          if (!uniqueMap.has(id) && !excludeIds.has(id)) {
            uniqueMap.set(id, {
              id,
              title: t.name,
              artist: t.artist_name,
              image: t.image || t.album_image,
              audio: t.audio,
              source: "Jamendo",
            });
          }
        });
      }

      let uniqueArray = Array.from(uniqueMap.values());
      this.shuffleArray(uniqueArray);
      return uniqueArray.slice(0, count);
    } catch (err) {
      if (err.name === "AbortError") return [];
      console.error("Jamendo fetch error:", err);
      return [];
    }
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  renderSkeleton() {
    this.songGrid.innerHTML = Array(10)
      .fill(0)
      .map(
        () => `
            <div class="animate-pulse bg-white/5 aspect-square rounded-2xl"></div>
        `,
      )
      .join("");
  }

  renderNextBatch() {
    const nextTracks = [];
    let checkedCount = 0;

    while (
      nextTracks.length < this.batchSize &&
      this.loadedCount + checkedCount < this.allTracks.length
    ) {
      const track = this.allTracks[this.loadedCount + checkedCount];
      checkedCount++;

      if (this.renderedTrackIds.has(track.id)) continue;
      if (this.songGrid.querySelector(`.song-card[data-id="${track.id}"]`))
        continue;

      nextTracks.push(track);
      this.renderedTrackIds.add(track.id);
    }

    if (nextTracks.length === 0) {
      this.isLoading = false;
      return;
    }

    const isFirstBatch = this.loadedCount === 0;
    const html = nextTracks.map((track) => this.getTrackHTML(track)).join("");

    if (isFirstBatch) {
      this.songGrid.innerHTML = html;
    } else {
      this.songGrid.insertAdjacentHTML("beforeend", html);
    }

    if (window.playlistManager) {
      nextTracks.forEach((track) => {
        const card = this.songGrid.querySelector(
          `.song-card[data-id="${track.id}"]`,
        );
        if (card) {
          const favBtn = card.querySelector(".favorite-track-btn");
          if (favBtn) {
            this.updateFavoriteIcon(favBtn, track.id);
          }
        }
      });
    }

    this.loadedCount += checkedCount;
    this.isLoading = false;
  }

  getTrackHTML(track) {
    const audioUrl = track.audioDataUrl || track.audio;
    const isFavorite =
      window.playlistManager?.isTrackFavorite(track.id) || false;
    const favIconClass = isFavorite ? "text-red-500" : "text-white/40";
    const favFill = isFavorite ? "'FILL' 1" : "'FILL' 0";
    const addToPlaylistTitle = window.t
      ? window.t("song.addToPlaylistTitle")
      : "Add to playlist";
    const addToFavoritesTitle = window.t
      ? window.t("song.addToFavoritesTitle")
      : "Add to favorites";
    return `
            <div class="song-card bg-white/5 p-3 md:p-4 rounded-2xl fade-in" data-id="${track.id}" data-audio="${audioUrl}">
                <div class="relative aspect-square mb-3 overflow-hidden rounded-xl bg-white/10">
                    <button class="add-to-playlist-btn" data-id="${track.id}" title="${addToPlaylistTitle}">
                        <span class="material-symbols-rounded !text-lg">playlist_add</span>
                    </button>
                    <button class="favorite-track-btn" data-id="${track.id}" title="${addToFavoritesTitle}">
                        <span class="material-symbols-rounded !text-lg ${favIconClass}" style="font-variation-settings: ${favFill}">favorite</span>
                    </button>
                    <img src="${track.image}" alt="${track.title}" class="w-full h-full object-cover" loading="lazy" decoding="async">
                    <div class="track-loading-overlay hidden" id="loading-${track.id}">
                        <div class="track-loading-spinner"></div>
                    </div>
                    <div class="play-button absolute inset-0 flex items-center justify-center bg-black/50">
                        <button class="play-track-btn w-12 h-12 bg-primary-color rounded-full flex items-center justify-center text-white shadow-lg" style="background-color: var(--primary-color);">
                            <span class="material-symbols-rounded !text-3xl">play_arrow</span>
                        </button>
                    </div>
                </div>
                <h3 class="text-white font-bold truncate text-sm md:text-base">${track.title}</h3>
                <p class="text-white/50 text-xs md:text-sm truncate">${track.artist}</p>
            </div>
        `;
  }

  setupEventDelegation() {
    if (this._delegationSetup) return;
    this._delegationSetup = true;

    this.songGrid.addEventListener("click", (e) => {
      const card = e.target.closest(".song-card");
      if (!card) return;

      const trackId = card.getAttribute("data-id");
      const track = this.allTracks.find((t) => t.id === trackId);
      if (!track) return;

      if (e.target.closest(".add-to-playlist-btn")) {
        e.stopPropagation();
        if (window.addTrackToPlaylist) window.addTrackToPlaylist(track);
        return;
      }

      if (e.target.closest(".favorite-track-btn")) {
        e.stopPropagation();
        this.handleFavoriteClick(track, card);
        return;
      }

      if (e.target.closest(".play-track-btn")) {
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent("playTrack", { detail: track }));
        return;
      }

      const playButtonOverlay = card.querySelector(".play-button");
      const isPlayButtonHidden =
        playButtonOverlay &&
        window.getComputedStyle(playButtonOverlay).display === "none";
      if (isPlayButtonHidden) {
        window.dispatchEvent(new CustomEvent("playTrack", { detail: track }));
      }
    });

    this.songGrid.addEventListener("contextmenu", (e) => {
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
      const isNowFavorite = await window.playlistManager.toggleFavorite(track);
      if (isNowFavorite !== newIsFav) {
        this.updateFavoriteIcon(favBtn, trackId, isNowFavorite);
      }
    } catch (error) {
      this.updateFavoriteIcon(favBtn, trackId, currentIsFav);
      console.error("Favorite toggle error:", error);
    }
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

  setupLazyLoading() {
    if (this.observer) {
      this.observer.disconnect();
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !this.isLoading) {
            this.isLoading = true;
            this.renderNextBatch();
            this.updateObserverTarget();
          }
        });
      },
      {
        root: null,
        rootMargin: "200px",
        threshold: 0,
      },
    );

    this.updateObserverTarget();
  }

  updateObserverTarget() {
    const cards = this.songGrid.querySelectorAll(".song-card");
    if (cards.length > 0 && this.loadedCount < this.allTracks.length) {
      const lastCard = cards[cards.length - 1];
      this.observer.observe(lastCard);
    }
  }

  clearDOM() {
    try {
      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
      }
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }

      if (this.songGrid) {
        this.songGrid.innerHTML = "";
      }
      this.loadedCount = 0;
      this.isLoading = false;
      this.allTracks = [];
      this.renderedTrackIds.clear();
    } catch (err) {
      console.error("Error in clearDOM:", err);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.melechLibrary = new MusicLibrary();
  window.addEventListener("favoritesUpdated", (e) => {
    const { trackId, isFavorite } = e.detail;
    document
      .querySelectorAll(`.song-card[data-id="${trackId}"] .favorite-track-btn`)
      .forEach((favBtn) => {
        const icon = favBtn.querySelector(".material-symbols-rounded");
        if (icon) {
          icon.style.fontVariationSettings = isFavorite
            ? "'FILL' 1"
            : "'FILL' 0";
          if (isFavorite) {
            icon.classList.add("text-red-500");
            icon.classList.remove("text-white/40");
          } else {
            icon.classList.remove("text-red-500");
            icon.classList.add("text-white/40");
          }
        }
      });
  });

  window.addEventListener("trackLoading", (e) => {
    const { trackId, isLoading } = e.detail;
    if (!trackId) {
      document
        .querySelectorAll(".song-card .track-loading-overlay")
        .forEach((overlay) => {
          overlay.classList.add("hidden");
        });
      return;
    }
    const loadingOverlay = document.getElementById(`loading-${trackId}`);
    if (loadingOverlay) {
      if (isLoading) {
        loadingOverlay.classList.remove("hidden");
      } else {
        loadingOverlay.classList.add("hidden");
      }
    }
  });

  const editSongModal = document.getElementById("editSongModal");
  const cancelEditSong = document.getElementById("cancelEditSong");
  const confirmEditSong = document.getElementById("confirmEditSong");
  const editSongBackdrop = document.getElementById("editSongBackdrop");

  function closeEditModal() {
    if (!editSongModal) return;
    editSongModal.classList.add("opacity-0", "pointer-events-none");
    editSongModal.classList.remove("opacity-100", "pointer-events-auto");
    const content = editSongModal.querySelector('div[class*="transform"]');
    if (content) {
      content.classList.add("scale-95");
      content.classList.remove("scale-100");
    }
  }

  if (cancelEditSong) {
    cancelEditSong.addEventListener("click", closeEditModal);
  }

  if (editSongBackdrop) {
    editSongBackdrop.addEventListener("click", closeEditModal);
  }

  if (confirmEditSong) {
    confirmEditSong.addEventListener("click", async () => {
      const titleInput = document.getElementById("editSongTitleInput");
      const artistInput = document.getElementById("editSongArtistInput");
      const idInput = document.getElementById("editSongId");

      if (!titleInput || !artistInput || !idInput) return;

      const trackId = idInput.value;
      const newTitle = titleInput.value.trim();
      const newArtist = artistInput.value.trim();

      if (!newTitle || !newArtist) {
        window.notifications?.error("song.emptyNameError", {
          title: "song.editSong",
        });
        return;
      }

      try {
        const song = await window.melechDB?.getUserSongById(trackId);
        if (song) {
          song.title = newTitle;
          song.artist = newArtist;
          await window.melechDB?.saveUserSong(song);

          const library = window.melechLibrary;
          if (library) {
            const track = library.allTracks.find((t) => t.id === trackId);
            if (track) {
              track.title = newTitle;
              track.artist = newArtist;
            }
            const card = document.querySelector(
              `.song-card[data-id="${trackId}"]`,
            );
            if (card) {
              const titleEl = card.querySelector(".song-title");
              const artistEl = card.querySelector(".song-artist");
              if (titleEl) titleEl.textContent = newTitle;
              if (artistEl) artistEl.textContent = newArtist;
            }
          }

          closeEditModal();
        }
      } catch (error) {
        console.error("Error updating song:", error);
        window.notifications?.error("errors.generic", {
          title: "errors.tryAgain",
        });
      }
    });
  }
});
