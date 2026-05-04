/*
 * Temporary Solution API
 * It will be removed in the future
 */

class MelechSupabaseAPI {
  constructor() {
    this.baseUrl =
      "https://fzvdaqxtsskyrofpjotc.supabase.co/functions/v1/dynamic-responder";
    this.powKey = "Melech-V5";
    this.fingerprint = this.generateFingerprint();
    this.lastUploadTime = 0;
    this.uploadCount = 0;
    this.uploadWindow = 5 * 60 * 1000;
    this.maxUploads = 7;
  }

  generateFingerprint() {
    const stored = localStorage.getItem("melech-fingerprint");
    if (stored) return stored;

    const fp =
      "fp-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
    localStorage.setItem("melech-fingerprint", fp);
    return fp;
  }

  getHeaders() {
    return {
      "x-melech-pow": this.powKey,
      "x-melech-fingerprint": this.fingerprint,
    };
  }

  checkRateLimit() {
    const now = Date.now();
    if (now - this.lastUploadTime > this.uploadWindow) {
      this.uploadCount = 0;
      this.lastUploadTime = now;
    }

    if (this.uploadCount >= this.maxUploads) {
      const waitTime = Math.ceil(
        (this.uploadWindow - (now - this.lastUploadTime)) / 60000,
      );
      throw new Error(`Rate limit: ${waitTime} dakika bekleyin`);
    }

    this.uploadCount++;
  }

  async uploadSong(file, metadata = {}) {
    this.checkRateLimit();

    const formData = new FormData();
    const filename = file.name || `song-${Date.now()}.mplaylist`;
    formData.append("file", file, filename);

    if (metadata.title) formData.append("title", metadata.title);
    if (metadata.artist) formData.append("artist", metadata.artist);
    if (metadata.cover) formData.append("cover", metadata.cover);

    const response = await fetch(`${this.baseUrl}/upload/song`, {
      method: "POST",
      headers: this.getHeaders(),
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Upload failed (${response.status}): ${error}`);
    }

    return await response.json();
  }

  async uploadSongUrl(url, metadata = {}) {
    this.checkRateLimit();

    const formData = new FormData();
    formData.append("url", url);

    if (metadata.title) formData.append("title", metadata.title);
    if (metadata.artist) formData.append("artist", metadata.artist);
    if (metadata.cover) formData.append("cover", metadata.cover);

    const response = await fetch(`${this.baseUrl}/upload/song`, {
      method: "POST",
      headers: this.getHeaders(),
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`URL upload failed (${response.status}): ${error}`);
    }

    return await response.json();
  }

  async getSong(uuid) {
    const response = await fetch(`${this.baseUrl}/get/song/${uuid}`, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Get song failed (${response.status})`);
    }

    const contentType = response.headers.get("content-type");

    if (contentType?.includes("audio/mpeg")) {
      return await response.blob();
    }

    return await response.json();
  }

  async uploadPlaylist(playlistData, file = null) {
    this.checkRateLimit();

    const formData = new FormData();

    if (file) {
      const filename = file.name || `playlist-${Date.now()}.mplaylist`;
      formData.append("file", file, filename);
    } else {
      const mplaylistContent = JSON.stringify(playlistData, null, 2);
      const blob = new Blob([mplaylistContent], {
        type: "application/octet-stream",
      });
      const filename = `playlist-${Date.now()}.mplaylist`;
      formData.append("file", blob, filename);
    }

    const response = await fetch(`${this.baseUrl}/upload/playlist`, {
      method: "POST",
      headers: this.getHeaders(),
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Playlist upload failed (${response.status}): ${error}`);
    }

    return await response.json();
  }

  async getPlaylist(uuid) {
    const response = await fetch(`${this.baseUrl}/get/playlist/${uuid}`, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Get playlist failed (${response.status})`);
    }

    return await response.blob();
  }

  createMPlaylistFile(playlist) {
    const data = {
      format: "mplaylist-v1",
      created: Date.now(),
      app: "Melech",
      ...playlist,
    };

    const json = JSON.stringify(data, null, 2);
    return new Blob([json], { type: "application/octet-stream" });
  }

  async parseMPlaylistFile(blob) {
    const text = await blob.text();
    return JSON.parse(text);
  }
}

window.melechSupabaseAPI = new MelechSupabaseAPI();
