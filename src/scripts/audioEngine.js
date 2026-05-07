class OptiAudioEngine {
  constructor() {
    this.ctx = null;
    this.isGapless = true;
    this.crossfadeDuration = 3;
    this.preloadLeadTime = 30;
    this.nextTrackUrl = null;
    this.onStateChange = null;
    this.onKeepAliveActivate = null;
    this.onKeepAliveDeactivate = null;
    this.activeBlobs = new Set();
    this.channels = {
      A: this._createChannel("A"),
      B: this._createChannel("B"),
      L: this._createChannel("L"),
    };
    this.activeChannel = "A";
    this.isPreloadingNext = false;
    this.isCrossfading = false;
  }

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this._setupChannelRouting(this.channels.A);
    this._setupChannelRouting(this.channels.B);
    this._setupChannelRouting(this.channels.L);

    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "playing";
    }
  }

  _createChannel(id) {
    const audioEl = new Audio();
    audioEl.crossOrigin = "anonymous";
    audioEl.preload = id === "L" ? "none" : "auto";

    audioEl.ontimeupdate = () => this._handleTimeUpdate(id);
    audioEl.onended = () => this._handleTrackEnd(id);
    audioEl.onerror = (e) => this._handleAudioError(id, e);

    return {
      id: id,
      element: audioEl,
      sourceNode: null,
      gainNode: null,
      currentUrl: null,
    };
  }

  _setupChannelRouting(channel) {
    channel.sourceNode = this.ctx.createMediaElementSource(channel.element);
    channel.gainNode = this.ctx.createGain();
    channel.sourceNode.connect(channel.gainNode);
    channel.gainNode.connect(this.ctx.destination);
  }

  async playLive(url) {
    if (!this.ctx) this.init();
    if (this.ctx.state === "suspended") await this.ctx.resume();

    if (this.activeChannel !== "L") this.stop();

    this.activeChannel = "L";
    const channel = this.channels.L;

    this._cleanupMemory(channel);
    channel.currentUrl = url;

    this._activateKeepAlive();
    if (this.onStateChange)
      this.onStateChange({ type: "loading", status: true, url, isLive: true });

    channel.element.src = url;
    channel.gainNode.gain.setValueAtTime(1, this.ctx.currentTime);

    return new Promise((resolve) => {
      const onCanPlay = async () => {
        channel.element.removeEventListener("canplay", onCanPlay);
        channel.element.removeEventListener("error", onError);
        if (this.onStateChange)
          this.onStateChange({
            type: "loading",
            status: false,
            url,
            isLive: true,
          });

        try {
          await channel.element.play();
        } catch (e) {
          this._deactivateKeepAlive();
          resolve(false);
        }
      };

      const onPlaying = () => {
        channel.element.removeEventListener("playing", onPlaying);
        this._deactivateKeepAlive();
        resolve(true);
      };

      const onError = () => {
        channel.element.removeEventListener("canplay", onCanPlay);
        channel.element.removeEventListener("playing", onPlaying);
        channel.element.removeEventListener("error", onError);
        this._deactivateKeepAlive();
        if (this.onStateChange) {
          this.onStateChange({
            type: "loading",
            status: false,
            url,
            isLive: true,
          });
          this.onStateChange({
            type: "error",
            channelId: "L",
            isLiveError: true,
            error: channel.element.error,
          });
        }
        resolve(false);
      };

      channel.element.addEventListener("canplay", onCanPlay);
      channel.element.addEventListener("error", onError);
      channel.element.addEventListener("playing", onPlaying);
      channel.element.load();
    });
  }

  async play(url) {
    if (!this.ctx) this.init();
    if (this.ctx.state === "suspended") await this.ctx.resume();

    if (this.activeChannel === "L") {
      this.stop();
      this.activeChannel = "A";
    }

    const channel = this.channels[this.activeChannel];
    const loadSuccess = await this._smartLoad(channel, url);

    if (!loadSuccess) return false;

    channel.gainNode.gain.setValueAtTime(1, this.ctx.currentTime);
    await channel.element.play();
    return true;
  }

  stop() {
    const channel = this.channels[this.activeChannel];
    channel.element.pause();
    this._cleanupMemory(channel);

    if ("mediaSession" in navigator)
      navigator.mediaSession.playbackState = "paused";
  }

  pause() {
    const channel = this.channels[this.activeChannel];
    channel.element.pause();

    if ("mediaSession" in navigator)
      navigator.mediaSession.playbackState = "paused";
  }

  setNextTrack(url) {
    this.nextTrackUrl = url;
    this.isPreloadingNext = false;
  }

  setGapless(status) {
    this.isGapless = status;
  }

  setStateCallback(callback) {
    this.onStateChange = callback;
  }

  setCrossfadeDuration(seconds) {
    const parsedSeconds = parseFloat(seconds);
    if (parsedSeconds >= 2 && parsedSeconds <= 12)
      this.crossfadeDuration = parsedSeconds;
  }

  setPreloadLeadTime(seconds) {
    const parsedSeconds = parseFloat(seconds);
    if (parsedSeconds >= 5 && parsedSeconds <= 60)
      this.preloadLeadTime = parsedSeconds;
  }

  setKeepAliveCallbacks({ activate, deactivate } = {}) {
    this.onKeepAliveActivate = typeof activate === "function" ? activate : null;
    this.onKeepAliveDeactivate =
      typeof deactivate === "function" ? deactivate : null;
  }

  _handleTimeUpdate(channelId) {
    if (channelId !== this.activeChannel || channelId === "L") return;

    const channel = this.channels[this.activeChannel];
    const audio = channel.element;

    if (!audio.duration || !isFinite(audio.duration)) return;

    const timeLeft = audio.duration - audio.currentTime;

    if (
      this.isGapless &&
      timeLeft <= this.preloadLeadTime &&
      !this.isPreloadingNext &&
      this.nextTrackUrl
    ) {
      this.isPreloadingNext = true;
      this._preloadNextTrack();
    }

    if (
      this.isGapless &&
      timeLeft <= this.crossfadeDuration &&
      !this.isCrossfading &&
      this.nextTrackUrl
    ) {
      this.isCrossfading = true;
      this._executeCrossfade();
    }
  }

  async _preloadNextTrack() {
    this._activateKeepAlive();
    const nextChannelId = this.activeChannel === "A" ? "B" : "A";
    const nextChannel = this.channels[nextChannelId];
    await this._smartLoad(nextChannel, this.nextTrackUrl);
  }

  _executeCrossfade() {
    this._activateKeepAlive();
    const currentChannel = this.channels[this.activeChannel];
    const nextChannelId = this.activeChannel === "A" ? "B" : "A";
    const nextChannel = this.channels[nextChannelId];

    nextChannel.gainNode.gain.setValueAtTime(0, this.ctx.currentTime);
    nextChannel.element.play();
    nextChannel.gainNode.gain.linearRampToValueAtTime(
      1,
      this.ctx.currentTime + this.crossfadeDuration,
    );

    currentChannel.gainNode.gain.setValueAtTime(1, this.ctx.currentTime);
    currentChannel.gainNode.gain.linearRampToValueAtTime(
      0,
      this.ctx.currentTime + this.crossfadeDuration,
    );

    const previousChannel = currentChannel;
    setTimeout(
      () => {
        this._cleanupMemory(previousChannel);
      },
      this.crossfadeDuration * 1000 + 100,
    );

    this.activeChannel = nextChannelId;
    this.nextTrackUrl = null;
    this.isCrossfading = false;
    this.isPreloadingNext = false;
    this._deactivateKeepAlive();
  }

  _handleTrackEnd(channelId) {
    if (channelId === "L") {
      this._cleanupMemory(this.channels.L);
      if (this.onStateChange)
        this.onStateChange({ type: "live_ended", channelId });
      return;
    }

    const channel = this.channels[channelId];
    if (
      !this.isGapless &&
      channelId === this.activeChannel &&
      this.nextTrackUrl
    ) {
      this.play(this.nextTrackUrl);
      this.nextTrackUrl = null;
    }
    this._cleanupMemory(channel);
  }

  async _smartLoad(channel, url) {
    if (
      channel.currentUrl === url &&
      channel.element.src &&
      !channel.element.error
    )
      return true;

    this._cleanupMemory(channel);
    channel.currentUrl = url;

    this._activateKeepAlive();
    if (this.onStateChange)
      this.onStateChange({ type: "loading", status: true, url });

    let blobUrl = null;

    try {
      if (url && !url.startsWith("blob:") && !url.startsWith("data:")) {
        let blob = null;
        if (
          window.melechDB &&
          typeof window.melechDB.getOfflineTrack === "function"
        ) {
          const offlineData = await window.melechDB.getOfflineTrack(url);
          if (offlineData && offlineData.blob) blob = offlineData.blob;
        }

        if (!blob) {
          const response = await fetch(url, { cache: "no-store" });
          if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
          blob = await response.blob();
          if (blob.size === 0) throw new Error("Empty blob received");
        }

        blobUrl = URL.createObjectURL(blob);
        this.activeBlobs.add(blobUrl);
        channel.element.src = blobUrl;
      } else {
        channel.element.src = url;
      }
    } catch (err) {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        this.activeBlobs.delete(blobUrl);
        blobUrl = null;
      }
      channel.element.src = url;
    }

    return new Promise((resolve) => {
      let retryWithOriginal = false;

      const onCanPlay = () => {
        channel.element.removeEventListener("canplay", onCanPlay);
        channel.element.removeEventListener("error", onError);
        if (this.onStateChange)
          this.onStateChange({ type: "loading", status: false, url });
      };

      const onPlaying = () => {
        channel.element.removeEventListener("playing", onPlaying);
        this._deactivateKeepAlive();
        resolve(true);
      };

      const onError = (e) => {
        const error = channel.element.error;

        if (
          !retryWithOriginal &&
          error &&
          error.code === 4 &&
          blobUrl &&
          channel.element.src === blobUrl
        ) {
          retryWithOriginal = true;
          URL.revokeObjectURL(blobUrl);
          this.activeBlobs.delete(blobUrl);
          blobUrl = null;
          channel.element.src = url;
          channel.element.load();
          return;
        }

        if (blobUrl) {
          URL.revokeObjectURL(blobUrl);
          this.activeBlobs.delete(blobUrl);
          blobUrl = null;
        }

        channel.element.removeEventListener("canplay", onCanPlay);
        channel.element.removeEventListener("playing", onPlaying);
        channel.element.removeEventListener("error", onError);
        this._deactivateKeepAlive();

        if (this.onStateChange) {
          this.onStateChange({ type: "loading", status: false, url });
          this.onStateChange({
            type: "error",
            channelId: channel.id,
            error: error,
          });
        }
        resolve(false);
      };

      channel.element.addEventListener("canplay", onCanPlay);
      channel.element.addEventListener("error", onError);
      channel.element.addEventListener("playing", onPlaying);
      channel.element.load();
    });
  }

  async _handleAudioError(channelId, event) {
    const channel = this.channels[channelId];
    const error = channel.element.error;
    if (error) {
      console.error(
        `audioEngine: Channel ${channelId} error code ${error.code}:`,
        error.message,
      );
      if (channelId === "L" && this.onStateChange) {
        this.onStateChange({
          type: "error",
          channelId,
          isLiveError: true,
          error,
        });
      }
    }
  }

  _cleanupMemory(channel) {
    const currentSrc = channel.element.src;

    if (currentSrc && currentSrc.startsWith("blob:")) {
      if (this.activeBlobs.has(currentSrc)) {
        URL.revokeObjectURL(currentSrc);
        this.activeBlobs.delete(currentSrc);
      }
    }

    channel.element.pause();
    const wasPlaying = !channel.element.paused && channel.element.currentTime > 0;
    if (!wasPlaying) {
      channel.element.removeAttribute("src");
    }
    channel.element.load();
    if (!wasPlaying) {
      channel.currentUrl = null;
    }
  }

  cleanupAllBlobs() {
    this.activeBlobs.forEach((blobUrl) => URL.revokeObjectURL(blobUrl));
    this.activeBlobs.clear();
    this._cleanupMemory(this.channels.A);
    this._cleanupMemory(this.channels.B);
    this._cleanupMemory(this.channels.L);
  }

  _activateKeepAlive() {
    if (this.onKeepAliveActivate) this.onKeepAliveActivate();
  }

  _deactivateKeepAlive() {
    if (this.onKeepAliveDeactivate) this.onKeepAliveDeactivate();
  }
}

if (typeof window !== "undefined") {
  window.OptiAudioEngine = OptiAudioEngine;
}
