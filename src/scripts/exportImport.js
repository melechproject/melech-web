class ExportImportManager {
  constructor() {
    this.CHUNK_SIZE = 50;
    this.EXPORT_CHUNK_SIZE = 100;
  }

  async blobToDataURI(blobUrl) {
    try {
      const response = await fetch(blobUrl);
      const blob = await response.blob();
      return await this.blobToDataURIFromBlob(blob);
    } catch (error) {
      return "";
    }
  }

  async blobToDataURIFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("FileReader failed"));
      reader.readAsDataURL(blob);
    });
  }

  dataURIToBlob(dataURI) {
    try {
      const byteString = atob(dataURI.split(",")[1]);
      const mimeString = dataURI.split(",")[0].split(":")[1].split(";")[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      return new Blob([ab], { type: mimeString });
    } catch (error) {
      return null;
    }
  }

  async exportLibrary() {
    const playlists = await window.melechDB.getPlaylists();
    const userSongs = await window.melechDB.getUserSongs();
    const totalPlaylists = playlists.length;
    const totalSongs = userSongs.length;
    const favoritesPlaylist = playlists.find(
      (p) => p.isFavorites || p.id === "pl_favorites",
    );
    const totalFavorites = favoritesPlaylist?.tracks?.length || 0;
    const totalItems = totalPlaylists + totalSongs + 1;
    let processedItems = 0;
    const preparingMsg = window.t
      ? window.t("backup.preparing", { total: totalItems, current: 0 })
      : `Preparing library... (${totalItems}/0)`;
    this._showBackupOverlay(preparingMsg);

    try {
      const settings = await window.melechDB.getAll("settings");

      const metadata = {
        version: "1.0",
        exportDate: new Date().toISOString(),
        stats: {
          playlists: totalPlaylists,
          songs: totalSongs,
          favorites: playlists.find((p) => p.isFavorites)?.tracks?.length || 0,
        },
      };

      const stream = await this._createFileStream(
        `melech_library_${new Date().toISOString().split("T")[0]}.mdatabase`,
        "application/octet-stream",
      );
      const writer = stream.getWriter();
      const encoder = new TextEncoder();

      await writer.write(encoder.encode(JSON.stringify(metadata) + "\n"));
      await writer.write(encoder.encode("PLAYLISTS_START\n"));

      let totalTracksToProcess = 0;
      let processedTracksCount = 0;
      playlists.forEach(
        (p) => (totalTracksToProcess += (p.tracks || []).length),
      );

      for (let i = 0; i < playlists.length; i += this.EXPORT_CHUNK_SIZE) {
        const chunk = playlists.slice(i, i + this.EXPORT_CHUNK_SIZE);
        const processedChunk = await Promise.all(
          chunk.map(async (playlist) => {
            const processedTracks = await Promise.all(
              (playlist.tracks || []).map(async (track) => {
                let audio = "";
                if (track.audioBlob instanceof Blob) {
                  audio =
                    (await this.blobToDataURIFromBlob(track.audioBlob)) || "";
                } else if (track.audioDataUrl) {
                  audio = track.audioDataUrl;
                } else if (track.audio && !track.audio.startsWith("blob:")) {
                  audio = track.audio;
                }
                processedTracksCount++;
                if (
                  processedTracksCount % 5 === 0 ||
                  processedTracksCount === totalTracksToProcess
                ) {
                  const progressMsg = window.t
                    ? window.t("backup.convertingAudio", {
                        current: processedTracksCount,
                        total: totalTracksToProcess,
                      })
                    : `Converting audio files... (${processedTracksCount}/${totalTracksToProcess})`;
                  this._updateProgressText(progressMsg);
                }
                return { ...track, audio: audio };
              }),
            );
            return { ...playlist, tracks: processedTracks };
          }),
        );
        await writer.write(
          encoder.encode(JSON.stringify(processedChunk) + "\n"),
        );
        processedItems += chunk.length;
      }

      await writer.write(encoder.encode("PLAYLISTS_END\n"));
      await writer.write(encoder.encode("SONGS_START\n"));

      let totalSongsToProcess = userSongs.length;
      let processedSongsCount = 0;

      for (let i = 0; i < userSongs.length; i += this.EXPORT_CHUNK_SIZE) {
        const chunk = userSongs.slice(i, i + this.EXPORT_CHUNK_SIZE);
        const processedChunk = await Promise.all(
          chunk.map(async (song) => {
            let audio = "";
            if (song.audioBlob instanceof Blob) {
              audio = (await this.blobToDataURIFromBlob(song.audioBlob)) || "";
            } else if (song.audioDataUrl) {
              audio = song.audioDataUrl;
            } else if (song.audio && !song.audio.startsWith("blob:")) {
              audio = song.audio;
            }
            processedSongsCount++;
            if (
              processedSongsCount % 5 === 0 ||
              processedSongsCount === totalSongsToProcess
            ) {
              const progressMsg = window.t
                ? window.t("backup.convertingAudio", {
                    current: processedSongsCount,
                    total: totalSongsToProcess,
                  })
                : `Converting audio files... (${processedSongsCount}/${totalSongsToProcess})`;
              this._updateProgressText(progressMsg);
            }
            return { ...song, audio: audio };
          }),
        );
        await writer.write(
          encoder.encode(JSON.stringify(processedChunk) + "\n"),
        );
        processedItems += chunk.length;
      }

      await writer.write(encoder.encode("SONGS_END\n"));
      await writer.write(encoder.encode(JSON.stringify(settings) + "\n"));
      processedItems += 1;
      const settingsMsg = window.t
        ? window.t("backup.exportingSettings", {
            total: totalItems,
            current: totalItems,
          })
        : `Backing up settings... (${totalItems}/${totalItems})`;
      this._updateProgressText(settingsMsg);
      await writer.close();

      return {
        success: true,
        message: `Exported ${totalSongs} songs and ${totalPlaylists} playlists`,
      };
    } catch (error) {
      if (error.name === "AbortError") {
        return { success: false, cancelled: true };
      }
      return { success: false, error: error.message };
    } finally {
      this._hideBackupOverlay();
    }
  }

  async importLibrary(file) {
    try {
      const reader = new FileReader();

      return new Promise((resolve, reject) => {
        reader.onload = async (e) => {
          try {
            const lines = e.target.result
              .split("\n")
              .filter((line) => line.trim());
            let section = null;
            let importedPlaylists = [];
            let importedSongs = [];
            let metadata = null;

            for (const line of lines) {
              if (line === "PLAYLISTS_START") {
                section = "playlists";
                continue;
              }
              if (line === "PLAYLISTS_END") {
                section = null;
                continue;
              }
              if (line === "SONGS_START") {
                section = "songs";
                continue;
              }
              if (line === "SONGS_END") {
                section = null;
                continue;
              }

              const data = JSON.parse(line);

              if (!metadata && data.version) {
                metadata = data;
                continue;
              }

              if (section === "playlists" && Array.isArray(data)) {
                importedPlaylists.push(...data);
                continue;
              }
              if (section === "songs" && Array.isArray(data)) {
                importedSongs.push(...data);
                continue;
              }

              if (section === null && Array.isArray(data)) {
                if (data.length > 0 && data[0]?.tracks !== undefined) {
                  importedPlaylists.push(...data);
                } else if (
                  data.length > 0 &&
                  (data[0]?.audio !== undefined ||
                    data[0]?.audioDataUrl !== undefined ||
                    data[0]?.source !== undefined)
                ) {
                  importedSongs.push(...data);
                }
              }
            }

            const totalPlaylistsToImport = importedPlaylists.length;
            const totalSongsToImport = importedSongs.length;
            const totalToImport =
              totalPlaylistsToImport + totalSongsToImport + 1;

            let processedCount = 0;

            const loadingLibraryMsg = window.t
              ? window.t("backup.importingLibrary", {
                  total: totalToImport,
                  current: 0,
                })
              : `Loading library... (${totalToImport}/0)`;
            this._updateProgressText(loadingLibraryMsg);

            if (importedSongs.length === 0 && importedPlaylists.length === 0) {
              throw new Error("No valid data found in import file");
            }

            const existingPlaylists = await window.melechDB.getPlaylists();
            const existingSongs = await window.melechDB.getUserSongs();

            const playlistMap = new Map();
            existingPlaylists.forEach((p) => playlistMap.set(p.id, p));

            importedPlaylists.forEach((p) => {
              if (playlistMap.has(p.id)) {
                const existing = playlistMap.get(p.id);
                const existingTrackIds = new Set(
                  existing.tracks.map((t) => t.id),
                );
                const newTracks = p.tracks.filter(
                  (t) => !existingTrackIds.has(t.id),
                );
                existing.tracks.push(...newTracks);
              } else {
                playlistMap.set(p.id, p);
              }
              processedCount++;
              const loadingPlaylistsMsg = window.t
                ? window.t("backup.importingPlaylists", {
                    total: totalToImport,
                    current: processedCount,
                  })
                : `Loading playlists... (${totalToImport}/${processedCount})`;
              this._updateProgressText(loadingPlaylistsMsg);
            });
            const mergedPlaylists = Array.from(playlistMap.values());

            const songMap = new Map();
            existingSongs.forEach((s) => songMap.set(s.id, s));
            for (const s of importedSongs) {
              let audioUrl = s.audio || "";
              if (audioUrl && audioUrl.startsWith("data:audio")) {
                const blob = this.dataURIToBlob(audioUrl);
                if (blob) {
                  audioUrl = URL.createObjectURL(blob);
                }
              }
              const processedSong = { ...s, audio: audioUrl };
              if (!songMap.has(s.id)) {
                songMap.set(s.id, processedSong);
              }
              processedCount++;
              if (
                processedCount % 10 === 0 ||
                processedCount === totalToImport
              ) {
                const loadingSongsMsg = window.t
                  ? window.t("backup.importingSongs", {
                      total: totalToImport,
                      current: processedCount,
                    })
                  : `Loading songs... (${totalToImport}/${processedCount})`;
                this._updateProgressText(loadingSongsMsg);
              }
            }
            const mergedSongs = Array.from(songMap.values());

            await this._saveSongsInChunks(mergedSongs);
            await window.melechDB.savePlaylists(mergedPlaylists);
            processedCount++;

            const loadingSettingsMsg = window.t
              ? window.t("backup.importingSettings", {
                  total: totalToImport,
                  current: totalToImport,
                })
              : `Loading settings... (${totalToImport}/${totalToImport})`;
            this._updateProgressText(loadingSettingsMsg);

            window.dispatchEvent(
              new CustomEvent("libraryImported", {
                detail: {
                  songsAdded: importedSongs.length,
                  playlistsAdded: importedPlaylists.length,
                  totalSongs: mergedSongs.length,
                  totalPlaylists: mergedPlaylists.length,
                },
              }),
            );

            resolve({
              success: true,
              message: `Imported ${importedSongs.length} songs and ${importedPlaylists.length} playlists`,
              stats: {
                songsAdded: importedSongs.length,
                playlistsAdded: importedPlaylists.length,
              },
            });
          } catch (error) {
            reject({ success: false, error: error.message });
          }
        };

        reader.onerror = () =>
          reject({ success: false, error: "Failed to read file" });
        reader.readAsText(file);
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async exportPlaylist(playlistId) {
    try {
      const playlists = await window.melechDB.getPlaylists();
      const playlist = playlists.find((p) => p.id === playlistId);

      if (!playlist) {
        throw new Error(
          window.t ? window.t("errors.songsNotFound") : "Playlist not found",
        );
      }

      const totalTracks = (playlist.tracks || []).length;
      let processedCount = 0;

      if (totalTracks > 0) {
        const preparingMsg = window.t
          ? window.t("backup.preparingPlaylist", {
              current: 0,
              total: totalTracks,
            })
          : `Preparing playlist... (0/${totalTracks})`;
        this._showProgress(preparingMsg);
      }

      const processedTracks = await Promise.all(
        (playlist.tracks || []).map(async (track) => {
          let audio = "";
          if (track.audioBlob instanceof Blob) {
            audio = (await this.blobToDataURIFromBlob(track.audioBlob)) || "";
          } else if (track.audioDataUrl) {
            audio = track.audioDataUrl;
          } else if (track.audio && !track.audio.startsWith("blob:")) {
            audio = track.audio;
          }
          processedCount++;
          if (processedCount % 3 === 0 || processedCount === totalTracks) {
            const convertingMsg = window.t
              ? window.t("backup.convertingAudio", {
                  current: processedCount,
                  total: totalTracks,
                })
              : `Converting audio... (${processedCount}/${totalTracks})`;
            this._updateProgressText(convertingMsg);
          }
          return { ...track, audio: audio };
        }),
      );

      this._hideProgress();

      const exportData = {
        version: "1.0",
        exportDate: new Date().toISOString(),
        type: "playlist",
        playlist: {
          ...playlist,
          id: undefined,
          tracks: processedTracks,
        },
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/octet-stream",
      });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${playlist.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.mdatabase`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      return { success: true, message: `Exported playlist: ${playlist.name}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async _createFileStream(filename, mimeType = "application/octet-stream") {
    if ("showSaveFilePicker" in window) {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: "Melech Playlist (.mdatabase)",
            accept: { "application/octet-stream": [".mdatabase"] },
          },
        ],
      });
      return await handle.createWritable();
    }

    return {
      chunks: [],
      getWriter() {
        return {
          write: (chunk) => {
            this.chunks.push(chunk);
          },
          close: () => {
            const blob = new Blob(this.chunks, { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          },
        };
      },
    };
  }

  async importSongsToPlaylist(playlistId, file) {
    try {
      const reader = new FileReader();

      return new Promise((resolve, reject) => {
        reader.onload = async (e) => {
          try {
            let importedTracks = [];

            try {
              const data = JSON.parse(e.target.result);
              if (data.type === "playlist" && data.playlist?.tracks) {
                importedTracks = data.playlist.tracks;
              } else if (Array.isArray(data)) {
                importedTracks = data;
              }
            } catch {
              const lines = e.target.result.split("\n");
              if (
                lines[0]?.toLowerCase().includes("title") ||
                lines[0]?.toLowerCase().includes("name")
              ) {
                importedTracks = this._parseCSV(lines);
              }
            }

            if (importedTracks.length === 0) {
              throw new Error(
                window.t
                  ? window.t("errors.songsNotFound")
                  : "No tracks found in file",
              );
            }

            const totalTracks = importedTracks.length;
            let processedTracks = 0;
            const preparingMsg = window.t
              ? window.t("upload.preparingWithProgress", {
                  total: totalTracks,
                  current: 0,
                })
              : `Preparing songs... (${totalTracks}/0)`;
            this._updateProgressText(preparingMsg);
            const playlists = await window.melechDB.getPlaylists();
            const playlist = playlists.find((p) => p.id === playlistId);

            if (!playlist) {
              throw new Error(
                window.t
                  ? window.t("errors.songsNotFound")
                  : "Playlist not found",
              );
            }

            const existingIds = new Set(playlist.tracks.map((t) => t.id));
            const newTracks = importedTracks.filter(
              (t) => !existingIds.has(t.id),
            );

            for (const track of newTracks) {
              let audioUrl = track.audio || "";
              if (audioUrl && audioUrl.startsWith("data:audio")) {
                const blob = this.dataURIToBlob(audioUrl);
                if (blob) {
                  audioUrl = URL.createObjectURL(blob);
                }
              }
              playlist.tracks.push({ ...track, audio: audioUrl });
              processedTracks++;
              const addingMsg = window.t
                ? window.t("backup.addingSongs", {
                    total: totalTracks,
                    current: processedTracks,
                  })
                : `Adding songs... (${totalTracks}/${processedTracks})`;
              this._updateProgressText(addingMsg);
            }

            await window.melechDB.savePlaylists(playlists);
            const savingMsg = window.t
              ? window.t("backup.savingPlaylist", {
                  total: totalTracks,
                  current: totalTracks,
                })
              : `Saving playlist... (${totalTracks}/${totalTracks})`;
            this._updateProgressText(savingMsg);

            if (window.playlistManager?.currentPlaylistId === playlistId) {
              window.playlistManager.renderDetailTracks();
            }

            resolve({
              success: true,
              message: `Added ${newTracks.length} tracks to ${playlist.name}`,
              added: newTracks.length,
              duplicates: importedTracks.length - newTracks.length,
            });
          } catch (error) {
            reject({ success: false, error: error.message });
          }
        };

        reader.onerror = () =>
          reject({ success: false, error: "Failed to read file" });
        reader.readAsText(file);
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async _createFileStream(filename, mimeType = "application/octet-stream") {
    if ("showSaveFilePicker" in window) {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: "Melech Playlist (.mdatabase)",
            accept: { "application/octet-stream": [".mdatabase"] },
          },
        ],
      });
      return await handle.createWritable();
    }

    return {
      chunks: [],
      getWriter() {
        return {
          write: (chunk) => {
            this.chunks.push(chunk);
          },
          close: () => {
            const blob = new Blob(this.chunks, { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          },
        };
      },
    };
  }

  async _saveSongsInChunks(songs) {
    await window.melechDB.clear("userLibrary");

    for (let i = 0; i < songs.length; i += this.CHUNK_SIZE) {
      const chunk = songs.slice(i, i + this.CHUNK_SIZE);
      await Promise.all(
        chunk.map((song) => window.melechDB.set("userLibrary", song)),
      );
    }
  }

  _parseCSV(lines) {
    if (lines.length < 2) return [];

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const titleIdx = headers.findIndex(
      (h) => h.includes("title") || h.includes("name"),
    );
    const artistIdx = headers.findIndex(
      (h) => h.includes("artist") || h.includes("author"),
    );

    if (titleIdx === -1) return [];

    return lines
      .slice(1)
      .filter((line) => line.trim())
      .map((line) => {
        const parts = line.split(",");
        return {
          id: `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          title: parts[titleIdx]?.trim() || "Unknown",
          artist:
            artistIdx !== -1 ? parts[artistIdx]?.trim() : "Unknown Artist",
          image: "./resources/MelechCover.png",
          audio: "",
          source: "import",
          addedAt: new Date().toISOString(),
        };
      });
  }

  openImportModal() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".mdatabase";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      this._showProgress("Loading library... (0/0)");
      const result = await this.importLibrary(file);
      this._hideProgress();

      if (result.success) {
        window.notifications?.success("backup.importSuccess", {
          title: "playlist.import",
        });
      } else {
        window.notifications?.error("backup.importError", {
          title: "errors.generic",
        });
      }
    };
    input.click();
  }

  openImportPlaylistModal() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".mplaylist";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      this._showProgress("Importing playlist...");
      const result = await this.importPlaylistAsNew(file);
      this._hideProgress();

      if (result.success) {
        window.notifications?.success("playlist.importSuccess", {
          title: "playlist.import",
        });
        window.playlistManager?.renderPlaylistList();
      } else {
        window.notifications?.error("backup.importError", {
          title: "errors.generic",
        });
      }
    };
    input.click();
  }

  async importPlaylistAsNew(file) {
    try {
      const reader = new FileReader();

      return new Promise((resolve, reject) => {
        reader.onload = async (e) => {
          try {
            const data = JSON.parse(e.target.result);

            let importedPlaylist;
            if (data.type === "playlist" && data.playlist) {
              importedPlaylist = data.playlist;
            } else if (data.name && Array.isArray(data.tracks)) {
              importedPlaylist = data;
            } else {
              throw new Error("Invalid playlist file format");
            }

            const playlists = await window.melechDB.getPlaylists();
            const tracksWithIds = await Promise.all(
              (importedPlaylist.tracks || []).map(async (t) => {
                let audioUrl = t.audio || "";
                if (audioUrl && audioUrl.startsWith("data:audio")) {
                  const blob = this.dataURIToBlob(audioUrl);
                  if (blob) {
                    audioUrl = URL.createObjectURL(blob);
                  }
                }
                return {
                  ...t,
                  id:
                    t.id ||
                    `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  audio: audioUrl,
                };
              }),
            );

            const newPlaylist = {
              id: `pl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              name: importedPlaylist.name || "Imported Playlist",
              description: importedPlaylist.description || "",
              image: importedPlaylist.image || "./resources/MelechCover.png",
              tracks: tracksWithIds,
              trackIds: tracksWithIds.map((t) => t.id),
              createdAt: new Date().toISOString(),
              isUserCreated: true,
            };

            for (const track of tracksWithIds) {
              await window.melechDB.saveUserSong({
                id: track.id,
                title: track.title,
                artist: track.artist,
                image: track.image || "./resources/MelechCover.png",
                audio: track.audio || "",
                source: track.source || "import",
                addedAt: Date.now(),
              });
            }

            playlists.push(newPlaylist);
            await window.melechDB.savePlaylists(playlists);

            if (window.playlistManager) {
              window.playlistManager.playlists = playlists;
            }

            resolve({
              success: true,
              message: `Imported playlist: ${newPlaylist.name}`,
              playlist: newPlaylist,
            });
          } catch (error) {
            reject({ success: false, error: error.message });
          }
        };

        reader.onerror = () =>
          reject({ success: false, error: "Failed to read file" });
        reader.readAsText(file);
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  openPlaylistImportModal(playlistId) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".mdatabase";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      this._showProgress("Preparing songs... (0/0)");
      const result = await this.importSongsToPlaylist(playlistId, file);
      this._hideProgress();

      if (result.success) {
        window.notifications?.success("playlist.importSongsSuccess", {
          title: "playlist.importSongs",
        });
      } else {
        window.notifications?.error("backup.importError", {
          title: "errors.generic",
        });
      }
    };
    input.click();
  }

  _showProgress(
    message,
    overlayId = "importProgressOverlay",
    textId = "progressText",
  ) {
    let overlay = document.getElementById(overlayId);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = overlayId;
      overlay.className =
        "fixed inset-0 bg-black/80 z-[90] flex items-center justify-center";
      overlay.innerHTML = `
        <div class="bg-[#0D0204] rounded-2xl p-8 max-w-md w-full mx-4">
          <div class="flex items-center gap-4">
            <div class="animate-spin w-8 h-8 border-2 border-white/20 border-t-[var(--primary-color)] rounded-full"></div>
            <p class="text-white text-lg" id="${textId}">${message}</p>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    } else {
      const textEl = document.getElementById(textId);
      if (textEl) textEl.textContent = message;
      overlay.style.display = "flex";
    }
    this._currentOverlayId = overlayId;
    this._currentTextId = textId;
  }

  _updateProgressText(message) {
    if (this._currentTextId) {
      const textEl = document.getElementById(this._currentTextId);
      if (textEl) textEl.textContent = message;
    }
  }

  _hideProgress() {
    const overlay = document.getElementById("importProgressOverlay");
    if (overlay) {
      overlay.style.display = "none";
    }
    this._currentOverlayId = null;
    this._currentTextId = null;
  }

  _showBackupOverlay(message = "Preparing backup... (0/0)") {
    this._showProgress(message, "backupOverlay", "backupProgressText");
  }

  _hideBackupOverlay() {
    const overlay = document.getElementById("backupOverlay");
    if (overlay) {
      overlay.style.display = "none";
    }
    this._currentOverlayId = null;
    this._currentTextId = null;
  }
}

window.exportImportManager = new ExportImportManager();
