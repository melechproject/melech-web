class MelechDB {
  constructor() {
    this.dbName = "MelechDB";
    this.dbVersion = 1;
    this.db = null;
  }

  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains("playlists")) {
          db.createObjectStore("playlists", { keyPath: "id" });
        }

        if (!db.objectStoreNames.contains("playback")) {
          db.createObjectStore("playback", { keyPath: "key" });
        }

        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }

        if (!db.objectStoreNames.contains("favorites")) {
          db.createObjectStore("favorites", { keyPath: "id" });
        }

        if (!db.objectStoreNames.contains("userLibrary")) {
          db.createObjectStore("userLibrary", { keyPath: "id" });
        }

        if (!db.objectStoreNames.contains("offlineTracks")) {
          db.createObjectStore("offlineTracks", { keyPath: "url" });
        }
      };
    });
  }

  async get(storeName, key) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async set(storeName, value) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.put(value);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async remove(storeName, key) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(storeName) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async clear(storeName) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getPlaylists() {
    try {
      const data = await this.get("playlists", "playlists_data");
      return data ? data.playlists : [];
    } catch {
      return [];
    }
  }

  async savePlaylists(playlists) {
    const existing = await this.get("playlists", "playlists_data");
    if (!existing) {
      await this.set("playlists", { id: "playlists_data", playlists });
      return;
    }

    if (playlists.length !== existing.playlists.length) {
      await this.set("playlists", { id: "playlists_data", playlists });
      return;
    }

    const existingById = new Map(existing.playlists.map((p) => [p.id, p]));
    const hasChanges = playlists.some((p) => {
      const ep = existingById.get(p.id);
      if (!ep) return true;
      if (p.id !== ep.id) return true;
      const pIds = p.trackIds || [];
      const epIds = ep.trackIds || [];
      if (pIds.length !== epIds.length) return true;
      return pIds.some((id, idx) => id !== epIds[idx]);
    });

    if (hasChanges) {
      await this.set("playlists", { id: "playlists_data", playlists });
    }
  }

  async getAllPlaylists() {
    try {
      const data = await this.get("playlists", "playlists_data");
      if (!data || !data.playlists) return [];
      const playlists = [];
      for (const playlist of data.playlists) {
        const fullPlaylist = await this.getFullPlaylistData(playlist);
        playlists.push(fullPlaylist);
      }
      return playlists;
    } catch (err) {
      console.error("Error getting all playlists:", err);
      return [];
    }
  }

  async getFullPlaylistData(playlist) {
    const songs = [];
    const trackIds = playlist.trackIds || [];

    for (const trackId of trackIds) {
      const song = await this.getUserSongById(trackId);
      if (song) {
        songs.push(song);
      }
    }

    return {
      id: playlist.id,
      name: playlist.name,
      songs: songs,
      createdAt: playlist.createdAt || Date.now(),
      updatedAt: playlist.updatedAt || Date.now(),
    };
  }

  async savePlaylist(playlist) {
    try {
      const existing = await this.get("playlists", "playlists_data");
      let playlists = existing ? existing.playlists : [];
      const existingIndex = playlists.findIndex((p) => p.id === playlist.id);
      const playlistToStore = {
        id: playlist.id,
        name: playlist.name,
        trackIds: playlist.songs.map((s) => s.id),
        createdAt: playlist.createdAt || Date.now(),
        updatedAt: Date.now(),
      };

      if (existingIndex >= 0) {
        playlists[existingIndex] = playlistToStore;
      } else {
        playlists.push(playlistToStore);
      }

      await this.set("playlists", { id: "playlists_data", playlists });

      for (const song of playlist.songs) {
        const existingSong = await this.getUserSongById(song.id);
        if (!existingSong) {
          await this.saveUserSong(song);
        }
      }

      return true;
    } catch (err) {
      console.error("Error saving playlist:", err);
      return false;
    }
  }

  async getPlaybackState() {
    try {
      const data = await this.get("playback", "last_played");
      if (!data) return null;

      if (Date.now() - data.timestamp > 7 * 24 * 60 * 60 * 1000) {
        await this.remove("playback", "last_played");
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }

  async savePlaybackState(track, currentTime, playlistInfo = null) {
    if (!track) return;

    const data = {
      key: "last_played",
      track: track,
      currentTime: currentTime,
      timestamp: Date.now(),
    };
    if (playlistInfo) {
      data.playlistId = playlistInfo.playlistId;
      data.playlistIndex = playlistInfo.playlistIndex;
      data.isShuffle = playlistInfo.isShuffle;
      data.shuffledIndices = playlistInfo.shuffledIndices;
      data.shufflePointer = playlistInfo.shufflePointer;
      data.shuffledTrackIds = playlistInfo.shuffledTrackIds;
    }

    const existing = await this.get("playback", "last_played");
    if (existing) {
      const sameTrack = existing.track?.id === track.id;
      const samePosition =
        Math.abs((existing.currentTime || 0) - currentTime) < 5;
      const samePlaylist =
        existing.playlistId === (playlistInfo?.playlistId || null);

      if (sameTrack && samePlaylist && samePosition) {
        return;
      }
    }

    await this.set("playback", data);
  }

  async getSetting(key, defaultValue = null) {
    try {
      const data = await this.get("settings", key);
      return data ? data.value : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  async setSetting(key, value) {
    const existing = await this.get("settings", key);
    if (!existing || JSON.stringify(existing.value) !== JSON.stringify(value)) {
      await this.set("settings", { key, value });
    }
  }

  async getFavorites() {
    try {
      const data = await this.get("favorites", "favorites_data");
      return data ? data.tracks : [];
    } catch {
      return [];
    }
  }

  async saveFavorites(tracks) {
    const existing = await this.get("favorites", "favorites_data");
    const existingIds =
      existing?.tracks
        ?.map((t) => t.id)
        .sort()
        .join(",") || "";
    const newIds = tracks
      .map((t) => t.id)
      .sort()
      .join(",");

    if (existingIds !== newIds || !existing) {
      await this.set("favorites", { id: "favorites_data", tracks });
    }
  }

  async getUserSongs() {
    try {
      return await this.getAll("userLibrary");
    } catch {
      return [];
    }
  }

  async saveUserSong(song) {
    const existing = await this.get("userLibrary", song.id);
    if (existing) {
      const hasChanged =
        existing.title !== song.title ||
        existing.artist !== song.artist ||
        existing.image !== song.image ||
        existing.audio !== song.audio ||
        existing.isFavorite !== song.isFavorite ||
        !!existing.audioBlob !== !!song.audioBlob;

      if (!hasChanged) return;
    }
    await this.set("userLibrary", song);
  }

  async removeUserSong(id) {
    await this.remove("userLibrary", id);
  }

  async getUserSongById(id) {
    if (!id) return null;
    try {
      const song = await this.get("userLibrary", id);
      if (song) {
        const favIds = await this.getFavoriteIds();
        return {
          ...song,
          isFavorite: favIds.includes(id),
        };
      }

      if (window.melechLibrary?.allTracks) {
        const libraryTrack = window.melechLibrary.allTracks.find(
          (t) => t.id === id,
        );
        if (libraryTrack) {
          const favIds = await this.getFavoriteIds();
          return {
            id: libraryTrack.id,
            title: libraryTrack.title,
            artist: libraryTrack.artist,
            image: libraryTrack.image,
            audio: libraryTrack.audio,
            audioBlob: libraryTrack.audioBlob || null,
            source: libraryTrack.source || "library",
            isFavorite: favIds.includes(id),
          };
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  async resolveTrackIds(trackIds) {
    if (!Array.isArray(trackIds) || trackIds.length === 0) return [];

    const [allUserSongs, favIds] = await Promise.all([
      this.getAll("userLibrary"),
      this.getFavoriteIds(),
    ]);

    const userSongsMap = new Map(allUserSongs.map((s) => [s.id, s]));
    const favSet = new Set(favIds);

    const libraryMap = new Map();
    if (window.melechLibrary?.allTracks) {
      for (const track of window.melechLibrary.allTracks) {
        libraryMap.set(track.id, track);
      }
    }

    const resolved = [];
    for (const id of trackIds) {
      const userSong = userSongsMap.get(id);
      if (userSong) {
        resolved.push({
          id: userSong.id,
          title: userSong.title,
          artist: userSong.artist,
          image: userSong.image,
          audio: userSong.audio,
          audioBlob: userSong.audioBlob,
          source: userSong.source || "library",
          isFavorite: favSet.has(id),
        });
      } else {
        const libTrack = libraryMap.get(id);
        if (libTrack) {
          resolved.push({
            id: libTrack.id,
            title: libTrack.title,
            artist: libTrack.artist,
            image: libTrack.image,
            audio: libTrack.audio,
            audioBlob: libTrack.audioBlob || null,
            source: libTrack.source || "library",
            isFavorite: favSet.has(id),
          });
        }
      }
    }

    return resolved;
  }

  async getFavoriteIds() {
    try {
      const allSongs = await this.getAll("userLibrary");
      return allSongs.filter((song) => song.isFavorite).map((song) => song.id);
    } catch {
      return [];
    }
  }

  async setSongFavorite(id, isFavorite) {
    const song = await this.getUserSongById(id);
    if (song && song.isFavorite !== isFavorite) {
      song.isFavorite = isFavorite;
      await this.saveUserSong(song);
    }
  }

  async deleteUserSong(id) {
    await this.remove("userLibrary", id);

    const playlists = await this.getPlaylists();
    let playlistsChanged = false;

    for (const playlist of playlists) {
      if (playlist.trackIds && playlist.trackIds.includes(id)) {
        playlist.trackIds = playlist.trackIds.filter(
          (trackId) => trackId !== id,
        );
        playlistsChanged = true;
      }
    }

    if (playlistsChanged) {
      await this.savePlaylists(playlists);
    }

    return true;
  }

  async saveOfflineTrack(url, blob) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["offlineTracks"], "readwrite");
      const store = transaction.objectStore("offlineTracks");
      const request = store.put({
        url: url,
        blob: blob,
        timestamp: Date.now(),
      });

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  async removeOfflineTrack(url) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["offlineTracks"], "readwrite");
      const store = transaction.objectStore("offlineTracks");
      const request = store.delete(url);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getOfflineTrack(url) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["offlineTracks"], "readonly");
      const store = transaction.objectStore("offlineTracks");
      const request = store.get(url);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async areAllTracksOfflineByUrls(urls) {
    if (!urls || urls.length === 0) return false;
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["offlineTracks"], "readonly");
      const store = transaction.objectStore("offlineTracks");
      let checkedCount = 0;
      let allOffline = true;

      urls.forEach((url) => {
        const req = store.get(url);
        req.onsuccess = (e) => {
          if (!e.target.result) allOffline = false;
          checkedCount++;
          if (checkedCount === urls.length) resolve(allOffline);
        };
        req.onerror = () => {
          allOffline = false;
          checkedCount++;
          if (checkedCount === urls.length) resolve(allOffline);
        };
      });
    });
  }
}

const melechDB = new MelechDB();
window.melechDB = melechDB;
