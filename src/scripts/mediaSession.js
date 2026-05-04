(function () {
  "use strict";

  const DEFAULT_ARTWORK = "./resources/MelechCover.png";

  function canGoPrevious() {
    const track = window.getCurrentTrack
      ? window.getCurrentTrack()
      : window.currentTrack;
    if (track && (track.source === "radio" || track.isLive)) return false;

    const playlist = window.currentPlaylist;
    if (!playlist) return false;

    const trackIds = playlist.trackIds || [];
    if (trackIds.length <= 1) return false;

    const isShuffle = window.playlistManager?.isShuffle || false;
    if (isShuffle && window.playlistManager?.shuffledTrackOrder) {
      const shufflePointer = playlist.shufflePointer ?? 0;
      return shufflePointer > 0;
    }

    const currentIndex = playlist.currentIndex ?? -1;
    if (currentIndex <= 0) return false;
    return true;
  }

  function canGoNext() {
    const track = window.getCurrentTrack
      ? window.getCurrentTrack()
      : window.currentTrack;
    if (track && (track.source === "radio" || track.isLive)) return false;

    const playlist = window.currentPlaylist;
    if (!playlist) return false;

    const trackIds = playlist.trackIds || [];
    if (trackIds.length <= 1) return false;

    const isShuffle = window.playlistManager?.isShuffle || false;
    if (isShuffle && window.playlistManager?.shuffledTrackOrder) {
      const shuffledTrackOrder = window.playlistManager.shuffledTrackOrder;
      const shufflePointer = playlist.shufflePointer ?? 0;
      return shufflePointer < shuffledTrackOrder.length - 1;
    }

    const currentIndex = playlist.currentIndex ?? -1;
    if (currentIndex >= trackIds.length - 1) return false;

    return true;
  }

  function updateMediaSessionActionHandlers() {
    if (!("mediaSession" in navigator)) return;

    const hasPrev = canGoPrevious();
    const hasNext = canGoNext();

    if (hasPrev) {
      navigator.mediaSession.setActionHandler("previoustrack", async () => {
        if (window.playPreviousTrack) await window.playPreviousTrack();
      });
    } else {
      navigator.mediaSession.setActionHandler("previoustrack", null);
    }

    if (hasNext) {
      navigator.mediaSession.setActionHandler("nexttrack", async () => {
        if (window.playNextTrack) await window.playNextTrack();
      });
    } else {
      navigator.mediaSession.setActionHandler("nexttrack", null);
    }
  }

  async function setupMediaSession() {
    if (!("mediaSession" in navigator)) return;

    navigator.mediaSession.setActionHandler("play", async () => {
      if (window.togglePlay) await window.togglePlay();
    });

    navigator.mediaSession.setActionHandler("pause", async () => {
      if (window.togglePlay) await window.togglePlay();
    });

    updateMediaSessionActionHandlers();

    function cancelCrossfadeIfActive() {
      const isCrossfading =
        typeof window.isCrossfading === "function"
          ? window.isCrossfading()
          : false;
      if (isCrossfading && window.cancelGaplessCrossfade) {
        window.cancelGaplessCrossfade();
      }
    }

    function gaplessEmergencyResetIfNearEnd(newTime, audioDuration) {
      if (
        typeof window.isGaplessPlaybackEnabled === "function" &&
        window.isGaplessPlaybackEnabled()
      ) {
        const remaining = audioDuration - newTime;
        const fadeDuration =
          typeof window.getFadeDuration === "function"
            ? window.getFadeDuration()
            : 4;
        if (remaining < fadeDuration && remaining > 0.5) {
          console.log("[MediaSession] Emergency reset - seeking near end");
          if (typeof window.resetGaplessPreload === "function") {
            window.resetGaplessPreload();
          }
        }
      }
    }

    navigator.mediaSession.setActionHandler("seekbackward", (details) => {
      cancelCrossfadeIfActive();
      const audio = window.primaryAudio;
      if (!audio) return;
      const skipTime = details.seekOffset || 10;
      const newTime = Math.max(0, audio.currentTime - skipTime);
      gaplessEmergencyResetIfNearEnd(newTime, audio.duration || 0);
      audio.currentTime = newTime;
    });

    navigator.mediaSession.setActionHandler("seekforward", (details) => {
      cancelCrossfadeIfActive();
      const audio = window.primaryAudio;
      if (!audio) return;
      const skipTime = details.seekOffset || 10;
      const newTime = Math.min(
        audio.duration || Infinity,
        audio.currentTime + skipTime,
      );
      gaplessEmergencyResetIfNearEnd(newTime, audio.duration || 0);
      audio.currentTime = newTime;
    });

    navigator.mediaSession.setActionHandler("seekto", (details) => {
      cancelCrossfadeIfActive();
      const audio = window.primaryAudio;
      if (!audio || !details.seekTime) return;
      gaplessEmergencyResetIfNearEnd(details.seekTime, audio.duration || 0);
      audio.currentTime = details.seekTime;
    });

    navigator.mediaSession.setActionHandler("stop", () => {
      const audio = window.primaryAudio;
      if (!audio) return;
      audio.pause();
      audio.currentTime = 0;
      clearMediaSessionPosition();
      navigator.mediaSession.playbackState = "none";
      if (window.updatePlayPauseUI) {
        window.updatePlayPauseUI(false);
      }
    });
  }

  function getArtworkUrl(imageUrl) {
    if (!imageUrl) return DEFAULT_ARTWORK;

    if (imageUrl.startsWith("data:") || imageUrl.startsWith("/")) {
      return imageUrl;
    }

    return imageUrl;
  }

  async function updateMediaSessionMetadata() {
    if (!("mediaSession" in navigator) || !window.currentTrack) return;

    const track = window.currentTrack;
    const artworkUrl = getArtworkUrl(track.image);

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || "Unknown Title",
      artist: track.artist || "Unknown Artist",
      album: track.album || "Melech Player",
      artwork: [
        { src: artworkUrl, sizes: "192x192", type: "image/png" },
        { src: artworkUrl, sizes: "512x512", type: "image/png" },
      ],
    });

    updateMediaSessionActionHandlers();
    updateMediaSessionPlaybackState();
  }

  function updateMediaSessionPlaybackState() {
    if (!("mediaSession" in navigator)) return;

    const audio = window.primaryAudio;
    if (!audio) return;

    navigator.mediaSession.playbackState = audio.paused ? "paused" : "playing";

    if (
      "setPositionState" in navigator.mediaSession &&
      !isNaN(audio.duration)
    ) {
      navigator.mediaSession.setPositionState({
        duration: audio.duration,
        playbackRate: audio.playbackRate,
        position: audio.currentTime,
      });
    }
  }

  function clearMediaSessionPosition() {
    if (!("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.setPositionState(null);
    } catch (e) {
      console.error(e);
    }
  }

  window.addEventListener("playTrack", () => {
    setTimeout(() => {
      setupAudioListeners();
      updateMediaSessionMetadata();
    }, 100);
  });

  function setupAudioListeners() {
    const primary = window.primaryAudio;
    const secondary = window.secondaryAudio;

    const clean = (el) => {
      if (!el) return;
      el.removeEventListener("play", updateMediaSessionPlaybackState);
      el.removeEventListener("pause", updateMediaSessionPlaybackState);
      el.removeEventListener("seeked", updateMediaSessionPlaybackState);
      el.removeEventListener("ratechange", updateMediaSessionPlaybackState);
      el.removeEventListener("playing", updateMediaSessionPlaybackState);
    };

    clean(primary);
    clean(secondary);

    if (primary) {
      primary.addEventListener("play", updateMediaSessionPlaybackState);
      primary.addEventListener("pause", updateMediaSessionPlaybackState);
      primary.addEventListener("seeked", updateMediaSessionPlaybackState);
      primary.addEventListener("ratechange", updateMediaSessionPlaybackState);
      primary.addEventListener("playing", updateMediaSessionPlaybackState);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      setupAudioListeners();
      setupMediaSession();
    });
  } else {
    setupAudioListeners();
    setupMediaSession();
  }

  window.updateMediaSessionMetadata = updateMediaSessionMetadata;
  window.updateMediaSessionPlaybackState = updateMediaSessionPlaybackState;
  window.updateMediaSessionActionHandlers = updateMediaSessionActionHandlers;
  window.clearMediaSessionPosition = clearMediaSessionPosition;
  window.setupMediaSessionAudioListeners = setupAudioListeners;
})();
