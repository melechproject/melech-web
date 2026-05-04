class MelechAPIClient {
  constructor(mode = "supabase") {
    this.mode = mode;
    this.supabaseAPI = window.melechSupabaseAPI;
    this.officialAPI = window.melechOfficialAPI;
  }

  setMode(mode) {
    if (mode !== "supabase" && mode !== "official") {
      throw new Error(mode);
    }
    this.mode = mode;
  }

  getMode() {
    return this.mode;
  }

  getAPI() {
    return this.mode === "supabase" ? this.supabaseAPI : this.officialAPI;
  }

  async uploadSong(data, metadata = {}, file = null) {
    if (this.mode === "supabase") {
      const safeMetadata = metadata || {};

      if (file) {
        return await this.supabaseAPI.uploadSong(file, safeMetadata);
      }

      if (data instanceof File || data instanceof Blob) {
        return await this.supabaseAPI.uploadSong(data, safeMetadata);
      }

      if (typeof data === "string") {
        return await this.supabaseAPI.uploadSongUrl(data, safeMetadata);
      }
    } else {
      const songData = typeof data === "object" ? data : metadata;
      return await this.officialAPI.uploadSong(songData);
    }
  }

  async uploadPlaylist(playlistData, file = null) {
    if (this.mode === "supabase") {
      return await this.supabaseAPI.uploadPlaylist(playlistData, file);
    } else {
      return await this.officialAPI.uploadPlaylist(playlistData);
    }
  }

  async getSong(uuid) {
    if (this.mode === "supabase") {
      return await this.supabaseAPI.getSong(uuid);
    } else {
      return await this.officialAPI.getData("song", uuid);
    }
  }

  async getPlaylist(uuid) {
    if (this.mode === "supabase") {
      return await this.supabaseAPI.getPlaylist(uuid);
    } else {
      return await this.officialAPI.getData("playlist", uuid);
    }
  }

  createShareUrl(type, uuid) {
    const baseUrl = window.location.origin + window.location.pathname;
    if (type === "song") {
      return `${baseUrl}?song=${uuid}`;
    } else {
      return `${baseUrl}?playlist=${uuid}`;
    }
  }

  createMPlaylistFile(playlist) {
    return this.supabaseAPI.createMPlaylistFile(playlist);
  }

  async parseMPlaylistFile(blob) {
    return await this.supabaseAPI.parseMPlaylistFile(blob);
  }

  async startSession() {
    if (this.mode === "official") {
      return await this.officialAPI.startSession();
    }
    return;
  }

  getStatus() {
    return {
      mode: this.mode,
      supabase: {
        available: !!this.supabaseAPI,
        baseUrl: this.supabaseAPI?.baseUrl,
      },
      official: {
        available: !!this.officialAPI,
        baseUrl: this.officialAPI?.baseUrl,
        hasToken: this.officialAPI?.isTokenValid(),
      },
    };
  }
}

window.melechAPI = new MelechAPIClient("supabase");

window.MelechAPIClient = MelechAPIClient;
