class MelechOfficialAPI {
  constructor() {
    this.baseUrl = "https://api.xmeroriginals.com/melech";
    this.fingerprint = this.generateFingerprint();
    this.token = null;
    this.tokenExpiry = null;
  }

  generateFingerprint() {
    const stored = localStorage.getItem("melech-fingerprint");
    if (stored) return stored;
    const fp =
      "fp-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
    localStorage.setItem("melech-fingerprint", fp);
    return fp;
  }

  isTokenValid() {
    if (!this.token || !this.tokenExpiry) return false;
    return Date.now() < this.tokenExpiry;
  }

  async startSession() {
    const storedToken = localStorage.getItem("melech-api-token");
    const storedExpiry = localStorage.getItem("melech-api-token-expiry");

    if (storedToken && storedExpiry && Date.now() < parseInt(storedExpiry)) {
      this.token = storedToken;
      this.tokenExpiry = parseInt(storedExpiry);
      return { token: this.token, expires_in: "cached" };
    }

    const response = await fetch(`${this.baseUrl}/api/start`, {
      method: "GET",
      headers: {
        "X-Melech-Fingerprint": this.fingerprint,
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error("You can get 1 token every 10 minutes");
      }
      throw new Error(`Token could not be obtained (${response.status})`);
    }

    const data = await response.json();

    if (data.success && data.token) {
      this.token = data.token;
      this.tokenExpiry = Date.now() + 14 * 60 * 1000;
      localStorage.setItem("melech-api-token", this.token);
      localStorage.setItem(
        "melech-api-token-expiry",
        this.tokenExpiry.toString(),
      );
    }

    return data;
  }

  getAuthHeaders() {
    return {
      Authorization: `Bearer ${this.token}`,
      "X-Melech-Fingerprint": this.fingerprint,
      "Content-Type": "application/json",
    };
  }

  async apiCall(url, options = {}) {
    if (!this.isTokenValid()) {
      await this.startSession();
    }

    return fetch(url, {
      ...options,
      headers: {
        ...this.getAuthHeaders(),
        ...options.headers,
      },
    });
  }

  async uploadSong(songData) {
    const response = await this.apiCall(`${this.baseUrl}/upload/song/`, {
      method: "POST",
      body: JSON.stringify(songData),
    });

    if (!response.ok) {
      if (response.status === 413) {
        throw new Error("File size too large.");
      }
      if (response.status === 429) {
        throw new Error("Please wait 5 minutes");
      }
      if (response.status === 401) {
        this.token = null;
        localStorage.removeItem("melech-api-token");
        localStorage.removeItem("melech-api-token-expiry");
        throw new Error("Token invalid, please try again");
      }
      throw new Error(`Upload failed (${response.status})`);
    }

    return await response.json();
  }

  async uploadPlaylist(playlistData) {
    const response = await this.apiCall(`${this.baseUrl}/upload/playlist/`, {
      method: "POST",
      body: JSON.stringify(playlistData),
    });

    if (!response.ok) {
      if (response.status === 413) {
        throw new Error("Data size too large.");
      }
      if (response.status === 429) {
        throw new Error("Please wait 5 minutes");
      }
      throw new Error(`Upload failed (${response.status})`);
    }

    return await response.json();
  }

  async getData(type, uuid) {
    const response = await this.apiCall(`${this.baseUrl}/get/${type}/${uuid}`, {
      method: "GET",
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("Data not found (30 min expiry may have passed)");
      }
      if (response.status === 429) {
        throw new Error("Please wait 5 minutes");
      }
      throw new Error(`Get failed (${response.status})`);
    }

    return await response.json();
  }

  createShareUrl(type, uuid) {
    return `${this.baseUrl}/get/${type}/${uuid}`;
  }
}

window.melechOfficialAPI = new MelechOfficialAPI();
