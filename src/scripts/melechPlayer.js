document.addEventListener("DOMContentLoaded", () => {
  let gaplessMode = 'off';
  let isGaplessPlaybackEnabled = false;
  let fadeDuration = 4;
  let primaryAudio = null;
  let secondaryAudio = null;
  let nextTrackPreloaded = null;
  let isCrossfading = false;
  let gaplessCheckInterval = null;
  let audioContext = null;
  let analyserNode = null;
  let sourceNode = null;
  let trackSilenceData = new Map();
  let optiAudioEngine = null;

  const survivalKit = {
    audio: null,
    isActive: false,
    init() {
      this.audio = new Audio(
        "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAAAB",
      );
      this.audio.loop = true;
      this.audio.volume = 0.01;
      this.audio.playsInline = true;
      this.audio.crossOrigin = "anonymous";
    },
    activate() {
      if (this.isActive) return;
      this.audio.play().catch(() => {});
      this.isActive = true;
    },
    deactivate() {
      if (!this.isActive) return;
      this.audio.pause();
      this.isActive = false;
    },
  };
  survivalKit.init();

  async function savePlaybackState() {
    if (!currentTrack) return;
    if (!window.melechDB) return;

    const playlistInfo = window.currentPlaylist
      ? {
          playlistId: window.currentPlaylist.id,
          playlistIndex: window.currentPlaylist.currentIndex,
          isShuffle: window.playlistManager?.isShuffle || false,
          shuffledIndices: window.currentPlaylist.shuffledIndices || [],
          shufflePointer: window.currentPlaylist.shufflePointer || 0,
          shuffledTrackIds:
            window.playlistManager?.shuffledTrackOrder?.map((t) => t.id) || [],
        }
      : null;

    const isActuallyLive =
      currentTrack.isLive === true || currentTrack.source === "radio";

    const trackRef = {
      id: currentTrack.id,
      title: currentTrack.title,
      artist: currentTrack.artist,
      image: currentTrack.image,
      audio: !currentTrack.audioBlob ? currentTrack.audio : undefined,
      source: currentTrack.source || "url",
      isLive: isActuallyLive,
      _ref: true,
    };

    await window.melechDB.savePlaybackState(
      trackRef,
      audio.currentTime,
      playlistInfo,
    );
  }

  async function loadPlaybackState() {
    try {
      if (!window.melechDB) return null;
      return await window.melechDB.getPlaybackState();
    } catch {
      return null;
    }
  }

  const playPauseBtn = document.getElementById("playPauseBtn");
  const shuffleBtn = document.getElementById("shuffleBtn");
  const loopBtn = document.getElementById("loopBtn");
  const loopIcon = document.getElementById("loopIcon");
  const volumeBtn = document.getElementById("volumeBtn");
  const playerSliders = document.querySelectorAll(".player-slider");
  const volumeSliders = document.querySelectorAll(".volume-slider");

  let isPlaying = false;
  let isShuffle = false;
  let loopMode = 0;
  let lastVolume = 66;

  let isLoading = false;
  let loadingTrackId = null;

  function syncSurvivalKitState() {
    if (isPlaying || currentTrack) {
      survivalKit.activate();
    } else {
      survivalKit.deactivate();
    }
  }

  const footer = document.getElementById("musicPlayerFooter");
  const miniPlayer = document.getElementById("mobileMiniPlayer");

  if (window.OptiAudioEngine) {
    try {
      optiAudioEngine = new window.OptiAudioEngine();
      optiAudioEngine.setStateCallback((state) => {
        if (state.type === "loading") {
          isLoading = state.status;
          loadingTrackId = currentTrack ? currentTrack.id : null;
          if (currentTrack) updateNowPlayingUI(currentTrack);

          window.dispatchEvent(
            new CustomEvent("trackLoading", {
              detail: { trackId: loadingTrackId, isLoading },
            }),
          );
        }
      });
      optiAudioEngine.setKeepAliveCallbacks({
        activate: () => survivalKit.activate(),
        deactivate: () => syncSurvivalKitState(),
      });
      primaryAudio = optiAudioEngine.channels.A.element;
      secondaryAudio = optiAudioEngine.channels.B.element;
    } catch (err) {
      optiAudioEngine = null;
    }
  }

  if (!primaryAudio || !secondaryAudio) {
    primaryAudio = new Audio();
    secondaryAudio = new Audio();
  }

  primaryAudio.id = "primaryAudio";
  secondaryAudio.id = "secondaryAudio";
  audio = primaryAudio;
  window.primaryAudio = primaryAudio;
  window.secondaryAudio = secondaryAudio;

  function initGaplessPlayback() {
    if (!window.melechDB) {
      gaplessMode = 'preload';
      isGaplessPlaybackEnabled = false;
      return;
    }

    window.melechDB.getSetting("gaplessPlayback", false).then((enabled) => {
      if (enabled) {
        gaplessMode = 'full';
        isGaplessPlaybackEnabled = true;
      } else {
        gaplessMode = 'preload';
        isGaplessPlaybackEnabled = false;
      }
      if (optiAudioEngine) {
        optiAudioEngine.setGapless(enabled);
      }
    });

    window.melechDB.getSetting("fadeDuration", 4).then((duration) => {
      setFadeDuration(duration);
    });
  }

  function setGaplessPlayback(enabled) {
    if (enabled) {
      gaplessMode = 'full';
      isGaplessPlaybackEnabled = true;
    } else {
      gaplessMode = 'preload';
      isGaplessPlaybackEnabled = false;
    }
    if (optiAudioEngine) {
      optiAudioEngine.setGapless(enabled);
    }
    if (!enabled) {
      releaseWakeLock();
    }
  }

  function setGaplessMode(mode) {
    gaplessMode = mode;
    isGaplessPlaybackEnabled = mode === 'full';
    if (optiAudioEngine) {
      optiAudioEngine.setGapless(mode === 'full');
    }
  }

  function setFadeDuration(duration) {
    fadeDuration = Math.max(2, Math.min(12, duration));
    if (optiAudioEngine) {
      optiAudioEngine.setCrossfadeDuration(fadeDuration);
    }
  }

  function setPlayerCrossfadeDuration(duration) {
    setFadeDuration(duration);
    if (window.melechDB) {
      window.melechDB.setSetting("fadeDuration", fadeDuration).catch(() => {});
    }
    return fadeDuration;
  }

  function cancelGaplessCrossfade() {
    if (!isCrossfading) return;

    if (secondaryAudio) {
      secondaryAudio.pause();
      secondaryAudio.volume = 0;
    }

    if (primaryAudio) {
      primaryAudio.volume = lastVolume ? lastVolume / 100 : 0.66;
    }

    isCrossfading = false;
    nextTrackPreloaded = null;
    syncSurvivalKitState();
  }

  function resetGaplessPreload() {
    if (nextTrackPreloaded) {
      if (secondaryAudio) {
        secondaryAudio.pause();
        secondaryAudio.currentTime = 0;
        try {
          secondaryAudio.removeAttribute("src");
          secondaryAudio._errorSilenced = false;
        } catch (e) {
          console.error(e);
        }
      }

      if (
        nextTrackPreloaded.audioSource &&
        nextTrackPreloaded.audioSource.startsWith("blob:")
      ) {
        try {
          URL.revokeObjectURL(nextTrackPreloaded.audioSource);
          activeObjectUrls = activeObjectUrls.filter(
            (u) => u !== nextTrackPreloaded.audioSource,
          );
        } catch (e) {
          console.error(e);
        }
      }

      nextTrackPreloaded = null;
    }
    syncSurvivalKitState();
  }

  window.setGaplessPlayback = setGaplessPlayback;
  window.setGaplessMode = setGaplessMode;
  window.setFadeDuration = setFadeDuration;
  window.getGaplessMode = () => gaplessMode;
  window.player = window.player || {};
  window.player.setCrossfadeDuration = setPlayerCrossfadeDuration;
  window.player.getCrossfadeDuration = () => fadeDuration;
  window.isGaplessPlaybackEnabled = () => isGaplessPlaybackEnabled;
  window.getFadeDuration = () => fadeDuration;
  window.isCrossfading = () => isCrossfading;
  window.cancelGaplessCrossfade = cancelGaplessCrossfade;
  window.resetGaplessPreload = resetGaplessPreload;
  window.primaryAudio = primaryAudio;
  window.secondaryAudio = secondaryAudio;
  window.audio = audio;

  async function unlockAudioChannels() {
    if (window._audioUnlocked) return;
    if (optiAudioEngine && !optiAudioEngine.ctx) {
      try {
        optiAudioEngine.init();
      } catch (e) {
        console.error(e);
      }
    }

    const silence =
      "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAAAB";
    try {
      const originalSrc = secondaryAudio.src;
      const originalVol = secondaryAudio.volume;

      secondaryAudio.src = silence;
      secondaryAudio.volume = 0.001;
      await secondaryAudio.play();
      secondaryAudio.pause();

      if (originalSrc && originalSrc !== silence) {
        secondaryAudio.src = originalSrc;
        secondaryAudio.volume = originalVol;
      } else {
        secondaryAudio.removeAttribute("src");
      }

      window._audioUnlocked = true;
    } catch (e) {
      console.error(e);
    }
  }

  let wakeLock = null;

  async function requestWakeLock() {
    if ("wakeLock" in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => {
          wakeLock = null;
        });
      } catch (err) {
        console.error(err);
      }
    }
  }

  async function releaseWakeLock() {
    if (wakeLock) {
      try {
        await wakeLock.release();
      } catch (e) {
        console.error(e);
      }
      wakeLock = null;
    }
  }

  async function detectSilenceRegions(audioUrl) {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    try {
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const channelData = audioBuffer.getChannelData(0);
      const sampleRate = audioBuffer.sampleRate;
      const totalSamples = channelData.length;
      const threshold = 0.01;
      const minSilenceDuration = 0.1;

      let startSilenceEnd = 0;
      for (let i = 0; i < totalSamples; i++) {
        if (Math.abs(channelData[i]) > threshold) {
          startSilenceEnd = i / sampleRate;
          break;
        }
      }

      let endSilenceStart = audioBuffer.duration;
      for (let i = totalSamples - 1; i >= 0; i--) {
        if (Math.abs(channelData[i]) > threshold) {
          endSilenceStart = i / sampleRate;
          break;
        }
      }

      return {
        startSilence: startSilenceEnd,
        endSilence: audioBuffer.duration - endSilenceStart,
        actualStart: startSilenceEnd,
        actualEnd: endSilenceStart,
        duration: audioBuffer.duration,
      };
    } catch (err) {
      return null;
    }
  }

  function getNextTrackInfo() {
    if (!window.currentPlaylist || !window.playlistManager) return null;

    const playlist = window.currentPlaylist;
    const manager = window.playlistManager;
    const trackCount =
      playlist.trackIds?.length || playlist.tracks?.length || 0;

    if (manager.isShuffle && manager.shuffledTrackOrder) {
      const currentShuffledIndex = manager.shuffledTrackOrder.findIndex(
        (t) => t.id === currentTrack?.id,
      );
      if (currentShuffledIndex !== -1) {
        if (currentShuffledIndex < manager.shuffledTrackOrder.length - 1) {
          return manager.shuffledTrackOrder[currentShuffledIndex + 1];
        } else if (loopMode === 1 && trackCount > 0) {
          return manager.shuffledTrackOrder[0];
        }
      }
    } else {
      const nextIndex = playlist.currentIndex + 1;
      if (nextIndex < playlist.trackIds.length) {
        const trackId = playlist.trackIds[nextIndex];
        return (
          playlist.tracks?.find((t) => t.id === trackId) ||
          manager.playlists.find((p) => p.id === playlist.id)?.tracks?.[
            nextIndex
          ]
        );
      } else if (loopMode === 1 && trackCount > 0) {
        const firstTrackId = playlist.trackIds[0];
        return (
          playlist.tracks?.find((t) => t.id === firstTrackId) ||
          manager.playlists.find((p) => p.id === playlist.id)?.tracks?.[0]
        );
      }
    }
    return null;
  }

  let isPrefetching = false;

  async function prefetchNextTrack() {
    const allowPrefetch = gaplessMode === 'full' || gaplessMode === 'preload';
    if (
      !allowPrefetch ||
      !isPlaying ||
      isCrossfading ||
      isPrefetching
    )
      return;

    const nextTrack = getNextTrackInfo();
    if (!nextTrack || nextTrackPreloaded?.id === nextTrack.id) return;

    isPrefetching = true;
    try {
      let audioSource = nextTrack.audio;
      if (nextTrack.audioBlob instanceof Blob) {
        audioSource = URL.createObjectURL(nextTrack.audioBlob);
        activeObjectUrls.push(audioSource);
      }

      secondaryAudio._errorSilenced = false;
      secondaryAudio._recoveryAttempts = 0;
      const preloadSuccess = await setAudioSourceSafely(
        secondaryAudio,
        audioSource,
      );

      if (!preloadSuccess) {
        console.error("Failed to preload next track:", nextTrack.id);
        if (audioSource && audioSource.startsWith("blob:")) {
          try {
            URL.revokeObjectURL(audioSource);
            activeObjectUrls = activeObjectUrls.filter(
              (u) => u !== audioSource,
            );
          } catch (e) {
            console.error(e);
          }
        }
        nextTrackPreloaded = null;
        isPrefetching = false;
        return;
      }

      const onWaiting = () => {
        survivalKit.activate();
      };

      secondaryAudio.addEventListener("waiting", onWaiting, { once: true });

      let silenceData = trackSilenceData.get(nextTrack.id);
      if (!silenceData && !nextTrack.audioBlob) {
        silenceData = await detectSilenceRegions(audioSource);
        if (silenceData) {
          trackSilenceData.set(nextTrack.id, silenceData);
        }
      }

      nextTrackPreloaded = {
        ...nextTrack,
        audioSource,
        silenceData,
        isBlob: !!nextTrack.audioBlob,
      };
    } catch (err) {
      nextTrackPreloaded = null;
    } finally {
      isPrefetching = false;
    }
  }

  function checkForTrackTransition() {
    const allowPreload = gaplessMode === 'full' || gaplessMode === 'preload';
    const allowCrossfade = gaplessMode === 'full';

    if (
      !allowPreload ||
      !isPlaying ||
      loopMode === 0 ||
      !currentTrack ||
      !primaryAudio.duration ||
      primaryAudio.currentTime < 2
    )
      return;

    const remaining = primaryAudio.duration - primaryAudio.currentTime;

    const preloadThreshold = document.hidden ? 30 : 15;
    if (
      remaining < preloadThreshold &&
      !nextTrackPreloaded &&
      !isCrossfading &&
      !isPrefetching
    ) {
      prefetchNextTrack();
    }

    if (allowCrossfade && remaining <= fadeDuration && nextTrackPreloaded && !isCrossfading) {
      startCrossfade();
    }
  }

  async function startCrossfade(dynamicFadeDuration = null) {
    if (!nextTrackPreloaded || isCrossfading) return;

    await unlockAudioChannels();
    await requestWakeLock();
    survivalKit.activate();

    isCrossfading = true;
    syncSurvivalKitState();
    const nextTrack = nextTrackPreloaded;
    const actualFadeDuration = dynamicFadeDuration || fadeDuration;
    let currentTrackFadeStart = primaryAudio.currentTime;
    let nextTrackFadeStart = 0;

    const currentSilence = trackSilenceData.get(currentTrack.id);
    if (currentSilence) {
      const actualEndTime = currentSilence.actualEnd;
      if (primaryAudio.currentTime < actualEndTime - 0.5) {
        const timeToActualEnd = actualEndTime - primaryAudio.currentTime;
        if (timeToActualEnd < actualFadeDuration) {
          currentTrackFadeStart =
            actualEndTime - Math.min(actualFadeDuration, timeToActualEnd);
        }
      }
    }

    if (nextTrack.silenceData && nextTrack.silenceData.startSilence > 0.5) {
      nextTrackFadeStart = nextTrack.silenceData.actualStart;
    }

    secondaryAudio.currentTime = nextTrackFadeStart;
    secondaryAudio.volume = 0;

    try {
      secondaryAudio.load();

      const playPromise = secondaryAudio.play();

      if (playPromise !== undefined) {
        await playPromise;
      }

      const fadeSteps = 20;
      const stepDuration = (actualFadeDuration * 1000) / fadeSteps;
      let currentStep = 0;
      const targetVolume = lastVolume ? lastVolume / 100 : 0.66;

      const fadeInterval = setInterval(() => {
        if (!isCrossfading) {
          clearInterval(fadeInterval);
          if (primaryAudio) primaryAudio.volume = targetVolume;
          return;
        }

        currentStep++;
        const progress = currentStep / fadeSteps;
        primaryAudio.volume = Math.max(0, targetVolume * (1 - progress));
        secondaryAudio.volume = Math.min(targetVolume, targetVolume * progress);

        if (currentStep >= fadeSteps) {
          clearInterval(fadeInterval);
          if (isCrossfading) {
            completeCrossfade(nextTrack, targetVolume);
          }
        }
      }, stepDuration);
    } catch (err) {
      isCrossfading = false;
      nextTrackPreloaded = null;
      syncSurvivalKitState();
      completeCrossfade(nextTrack, lastVolume / 100);
    }
  }

  async function completeCrossfade(nextTrack, initialTargetVolume = null) {
    const targetVolume =
      initialTargetVolume !== null
        ? initialTargetVolume
        : lastVolume
          ? lastVolume / 100
          : 0.66;

    const oldPrimary = primaryAudio;
    const newPrimary = secondaryAudio;
    window.primaryAudio = newPrimary;
    window.secondaryAudio = oldPrimary;
    window.audio = newPrimary;
    primaryAudio = newPrimary;
    secondaryAudio = oldPrimary;
    audio = primaryAudio;

    primaryAudio.id = "primaryAudio";
    secondaryAudio.id = "secondaryAudio";

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = null;
      if (window.updateMediaSessionMetadata) {
        window.updateMediaSessionMetadata();
      }
      navigator.mediaSession.playbackState = "playing";
    }

    oldPrimary.pause();
    oldPrimary.volume = targetVolume;
    oldPrimary.currentTime = 0;

    if (activeObjectUrls.length > 0) {
      const oldSrc = oldPrimary.src;
      if (oldSrc && oldSrc.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(oldSrc);
          activeObjectUrls = activeObjectUrls.filter((url) => url !== oldSrc);
        } catch (e) {
          console.error(e);
        }
      }
    }

    if (primaryAudio) {
      primaryAudio.volume = targetVolume;
    }

    currentTrack = nextTrack;
    window.currentTrack = nextTrack;
    isCrossfading = false;
    nextTrackPreloaded = null;

    updateNowPlayingUI(nextTrack);

    if (primaryAudio.duration) {
      const duration = formatTime(primaryAudio.duration);
      const trackDuration = document.getElementById("trackDuration");
      const fullDuration = document.getElementById("fullPlayerDuration");
      if (trackDuration) trackDuration.textContent = duration;
      if (fullDuration) fullDuration.textContent = duration;
    }

    lastProgressData = { progress: 0, formattedTime: "0:00" };
    if (!timeUpdatePending) {
      timeUpdatePending = true;
      requestAnimationFrame(updateProgressUI);
    }

    setTimeout(() => {
      if (primaryAudio.currentTime > 0 && !isNaN(primaryAudio.duration)) {
        const progress =
          (primaryAudio.currentTime / primaryAudio.duration) * 100;
        const formattedTime = formatTime(primaryAudio.currentTime);
        lastProgressData = { progress, formattedTime };
        if (!timeUpdatePending) {
          timeUpdatePending = true;
          requestAnimationFrame(updateProgressUI);
        }
      }
    }, 100);

    if (window.updateMediaSessionMetadata) {
      window.updateMediaSessionMetadata();
    }

    if (window.currentPlaylist && window.playlistManager) {
      const playlist = window.playlistManager.playlists.find(
        (p) => p.id === window.currentPlaylist.id,
      );
      if (playlist) {
        const index = playlist.trackIds.findIndex((id) => id === nextTrack.id);
        if (index !== -1) {
          window.currentPlaylist.currentIndex = index;
          window.currentPlaylist.currentTrackId = nextTrack.id;
          playlist.currentIndex = index;
          playlist.currentTrackId = nextTrack.id;
          if (
            window.playlistManager.isShuffle &&
            window.playlistManager.shuffledTrackOrder
          ) {
            const shuffledIndex =
              window.playlistManager.shuffledTrackOrder.findIndex(
                (t) => t.id === nextTrack.id,
              );
            if (shuffledIndex !== -1) {
              window.currentPlaylist.shufflePointer = shuffledIndex;
            }
          }
        }
      }
      window.playlistManager.renderPlaylistList();
    }

    if (window.setupMediaSessionAudioListeners) {
      window.setupMediaSessionAudioListeners();
    }
    if (window.updateMediaSessionMetadata) {
      window.updateMediaSessionMetadata();
    }
    if (window.updateMediaSessionPlaybackState) {
      window.updateMediaSessionPlaybackState();
    }

    if (window.updateMediaSessionActionHandlers) {
      window.updateMediaSessionActionHandlers();
    }

    if (typeof updateNavigationButtons === "function") {
      updateNavigationButtons();
    }

    if (!isPlaying) {
      isPlaying = true;
    }

    updatePlayPauseButton();
    attachAudioEventListeners();

    savePlaybackState().catch(() => {});

    if (window.updateMediaSessionPlaybackState) {
      window.updateMediaSessionPlaybackState();
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    await releaseWakeLock();
    syncSurvivalKitState();
  }

  const favoriteMiniPlayerBtn = document.getElementById(
    "favoriteMiniPlayerBtn",
  );
  const favoriteFooterBtn = document.getElementById("favoriteFooterBtn");
  const fullPlayerFavoriteBtn = document.getElementById(
    "fullPlayerFavoriteBtn",
  );
  const sidePlayerFavoriteBtn = document.getElementById(
    "sidePlayerFavoriteBtn",
  );

  const skipPrevBtn = document.getElementById("skipPrevBtn");
  const skipNextBtn = document.getElementById("skipNextBtn");
  const fullPlayerPrevBtn = document.getElementById("fullPlayerPrevBtn");
  const fullPlayerNextBtn = document.getElementById("fullPlayerNextBtn");
  const replay10Span = Array.from(
    document.querySelectorAll(".material-symbols-rounded"),
  ).find((span) => span.textContent.trim() === "replay_10");
  const forward10Span = Array.from(
    document.querySelectorAll(".material-symbols-rounded"),
  ).find((span) => span.textContent.trim() === "forward_10");
  const replay10Btn = replay10Span?.closest("button");
  const forward10Btn = forward10Span?.closest("button");

  function updateFooterSpacing() {
    if (!footer) return;
    const footerHeight = footer.offsetHeight;
    document.documentElement.style.setProperty(
      "--footer-height",
      `${footerHeight}px`,
    );
    if (miniPlayer && miniPlayer.classList.contains("active")) {
      document.body.classList.remove("has-footer");
      document.body.classList.add("has-footer-and-mini");
    } else {
      document.body.classList.remove("has-footer-and-mini");
      document.body.classList.add("has-footer");
    }
  }

  window.addEventListener("resize", updateFooterSpacing);
  if (footer) {
    new ResizeObserver(updateFooterSpacing).observe(footer);
  }
  updateFooterSpacing();

  let currentTrack = null;

  function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  function updateSliderBackground(slider, color = "#800020") {
    const val = slider.value;
    const min = slider.min || 0;
    const max = slider.max || 100;
    const percent = ((val - min) / (max - min)) * 100;
    slider.style.background = `linear-gradient(to right, ${color} ${percent}%, rgba(162, 162, 162, 0.3) ${percent}%)`;
  }

  playerSliders.forEach((slider) => updateSliderBackground(slider));
  volumeSliders.forEach((slider) => updateSliderBackground(slider, "#800020"));

  let miniPlayerClosed = false;

  function updateNowPlayingUI(track) {
    if (!track) return;

    const sideTitle = document.getElementById("sidePlayerTitle");
    const sideArtist = document.getElementById("sidePlayerArtist");
    const sideImage = document.getElementById("sidePlayerImage");
    const sidePlaceholder = document.getElementById("sidePlayerPlaceholder");
    const desktopNowPlaying = document.getElementById("desktopNowPlaying");
    const nextTrackDesk = document.getElementById("nextTracksGrid");

    if (desktopNowPlaying) {
      const nextTrack = getNextTrackInfo();

      if (nextTrack) {
        if (nextTrackDesk) nextTrackDesk.classList.add("hidden");

        const nextTrackTitle = document.getElementById("nextTrackTitle");
        const nextTrackArtist = document.getElementById("nextTrackArtist");
        const nextTrackImage = document.getElementById("nextTrackImage");
        const nextTrackInfoElement = document.getElementById("nextTrackInfo");

        if (nextTrackTitle)
          nextTrackTitle.textContent =
            nextTrack.title ||
            (window.t ? window.t("song.unknownSong") : "Unknown Song");
        if (nextTrackArtist)
          nextTrackArtist.textContent =
            nextTrack.artist ||
            (window.t ? window.t("song.unknownArtist") : "Unknown Artist");

        if (nextTrackImage) {
          nextTrackImage.src = nextTrack.image || "./resources/MelechCover.png";
          nextTrackImage.classList.remove("opacity-0");
        }

        if (nextTrackInfoElement) {
          nextTrackInfoElement.classList.remove("hidden");
        }
      } else {
        const nextTrackInfoElement = document.getElementById("nextTrackInfo");
        if (nextTrackInfoElement) {
          nextTrackInfoElement.classList.add("hidden");
        }
        if (nextTrackDesk) nextTrackDesk.classList.remove("hidden");
      }
    }

    const unknownSong = window.t
      ? window.t("player.unknownSong")
      : "Unknown Song";
    const unknownArtist = window.t
      ? window.t("player.unknownArtist")
      : "Unknown Artist";
    if (sideTitle) sideTitle.textContent = track.title || unknownSong;
    if (sideArtist) sideArtist.textContent = track.artist || unknownArtist;
    if (sideImage) {
      sideImage.src = track.image || "./resources/MelechCover.png";
      sideImage.classList.remove("opacity-0");
      if (sidePlaceholder) sidePlaceholder.classList.add("hidden");
    }

    const sidePlayerLoading = document.getElementById("sidePlayerLoading");
    if (sidePlayerLoading) {
      if (isLoading && loadingTrackId === track.id) {
        sidePlayerLoading.classList.remove("hidden");
      } else {
        sidePlayerLoading.classList.add("hidden");
      }
    }

    const miniPlayer = document.getElementById("mobileMiniPlayer");
    const miniTitle = document.getElementById("miniPlayerTitle");
    const miniArtist = document.getElementById("miniPlayerArtist");
    const miniImage = document.getElementById("miniPlayerImage");

    if (miniTitle) miniTitle.textContent = track.title || unknownSong;
    if (miniArtist) miniArtist.textContent = track.artist || unknownArtist;
    if (miniImage) miniImage.src = track.image || "./resources/MelechCover.png";
    if (miniPlayer && !miniPlayerClosed) {
      miniPlayer.classList.add("active");
      updateFooterSpacing();
    }

    const miniPlayerLoading = document.getElementById("miniPlayerLoading");
    if (miniPlayerLoading) {
      if (isLoading && loadingTrackId === track.id) {
        miniPlayerLoading.classList.remove("hidden");
      } else {
        miniPlayerLoading.classList.add("hidden");
      }
    }

    const fullPlayer = document.getElementById("mobileFullPlayer");
    const fullTitle = document.getElementById("fullPlayerTitle");
    const fullArtist = document.getElementById("fullPlayerArtist");
    const fullImage = document.getElementById("fullPlayerImage");

    const fullPlayerLoading = document.getElementById("fullPlayerLoading");
    if (fullPlayerLoading) {
      if (isLoading && loadingTrackId === track.id) {
        fullPlayerLoading.classList.remove("hidden");
      } else {
        fullPlayerLoading.classList.add("hidden");
      }
    }

    if (fullTitle) fullTitle.textContent = track.title || unknownSong;
    if (fullArtist) fullArtist.textContent = track.artist || unknownArtist;
    if (fullImage) fullImage.src = track.image || "./resources/MelechCover.png";

    updateFavoriteUI();
    if (typeof updateNavigationButtons === "function") {
      updateNavigationButtons();
    }

    const coverBg = document.getElementById("coverDynamicColorBg");
    if (track.image && coverBg && window.extractDominantColor) {
      window
        .extractDominantColor(track.image)
        .then((color) => {
          coverBg.style.background = `linear-gradient(180deg, ${color} 0%, rgba(20, 0, 4, 0) 80%)`;
        })
        .catch(() => {});
    }
  }

  let activeObjectUrls = [];

  function revokeOldObjectUrls() {
    activeObjectUrls.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error(e);
      }
    });
    activeObjectUrls = [];
  }

  function getEngineChannelByAudioElement(audioEl) {
    if (!optiAudioEngine) return null;
    if (optiAudioEngine.channels.A.element === audioEl)
      return optiAudioEngine.channels.A;
    if (optiAudioEngine.channels.B.element === audioEl)
      return optiAudioEngine.channels.B;
    if (optiAudioEngine.channels.L.element === audioEl)
      return optiAudioEngine.channels.L;
    return null;
  }

  function isLiveTrack(track) {
    if (!track) return false;
    return track.isLive === true || track.source === "radio";
  }

  async function setAudioSourceSafely(audioEl, sourceUrl) {
    const engineChannel = getEngineChannelByAudioElement(audioEl);
    if (engineChannel) {
      const success = await optiAudioEngine._smartLoad(
        engineChannel,
        sourceUrl,
      );
      return success;
    }

    try {
      audioEl.src = sourceUrl;
      audioEl.load();
      return true;
    } catch (err) {
      console.error("setAudioSourceSafely failed:", err);
      return false;
    }
  }

  async function playTrack(track, resumeFrom = 0, fromPlaylist = false) {
    if (!track) return;

    survivalKit.activate();

    await unlockAudioChannels();

    const isSameTrack = currentTrack && currentTrack.id === track.id;

    if (currentTrack && !isSameTrack) {
      savePlaybackState().catch(() => {});
    }

    if (isLiveTrack(track) && !isSameTrack) {
      primaryAudio.pause();
      primaryAudio.removeAttribute("src");
      secondaryAudio.pause();
      secondaryAudio.removeAttribute("src");
    }

    if (!isLiveTrack(track) && isLiveTrack(currentTrack) && optiAudioEngine) {
      optiAudioEngine.stop();
    }

    if (isCrossfading || nextTrackPreloaded) {
      secondaryAudio.pause();
      secondaryAudio.volume = 1;
      secondaryAudio.currentTime = 0;
      try {
        secondaryAudio.removeAttribute("src");
        secondaryAudio._errorSilenced = false;
      } catch (e) {
        console.error(e);
      }

      if (
        nextTrackPreloaded &&
        nextTrackPreloaded.audioSource &&
        nextTrackPreloaded.audioSource.startsWith("blob:")
      ) {
        try {
          URL.revokeObjectURL(nextTrackPreloaded.audioSource);
          activeObjectUrls = activeObjectUrls.filter(
            (u) => u !== nextTrackPreloaded.audioSource,
          );
        } catch (e) {
          console.error(e);
        }
      }

      isCrossfading = false;
      nextTrackPreloaded = null;
    }

    if (!fromPlaylist && window.currentPlaylist) {
      window.currentPlaylist = null;
      updateNavigationButtons();
      if (window.playlistManager) {
        window.playlistManager.renderPlaylistList();
      }
    }

    currentTrack = track;
    window.currentTrack = track;
    let audioSource = track.audio;
    if (track.audioBlob instanceof Blob) {
      revokeOldObjectUrls();
      audioSource = URL.createObjectURL(track.audioBlob);
      activeObjectUrls.push(audioSource);
    } else if (
      !audioSource ||
      audioSource === "null" ||
      audioSource === "undefined"
    ) {
      return;
    }

    if (isLiveTrack(track) && optiAudioEngine) {
      const liveSuccess = await optiAudioEngine.playLive(audioSource);

      if (!liveSuccess) {
        isPlaying = false;
        updatePlayPauseButton();
        syncSurvivalKitState();

        if (window.showToast) {
          window.showToast(
            window.t?.("player.loadError") ||
              "Failed to load live stream. Please check your connection.",
            "error",
            3000,
          );
        }
        return;
      }

      isPlaying = true;
      syncSurvivalKitState();
      miniPlayerClosed = false;
      updatePlayPauseButton();
      updateNowPlayingUI(track);

      if (window.updateMediaSessionMetadata) {
        window.updateMediaSessionMetadata();
      }

      updateNavigationButtons();
      savePlaybackState().catch(() => {});
      return;
    }

    audio = primaryAudio;
    audio._errorSilenced = false;
    audio._recoveryAttempts = 0;

    const loadSuccess = await setAudioSourceSafely(audio, audioSource);

    if (!loadSuccess) {
      console.error("Failed to load audio source:", audioSource);
      isPlaying = false;
      isLoading = false;
      loadingTrackId = null;
      updatePlayPauseButton();
      syncSurvivalKitState();

      window.dispatchEvent(
        new CustomEvent("trackLoading", {
          detail: { trackId: track.id, isLoading: false },
        }),
      );

      if (window.showToast) {
        window.showToast(
          window.t?.("player.loadError") ||
            "Failed to load track. Please check your connection or try again.",
          "error",
          3000,
        );
      }
      return;
    }

    if (resumeFrom > 0) {
      audio.currentTime = resumeFrom;
    } else if (isSameTrack && isPlaying) {
      audio.currentTime = 0;
    }

    isPlaying = true;
    syncSurvivalKitState();
    miniPlayerClosed = false;
    updatePlayPauseButton();
    updateNowPlayingUI(track);

    if (window.updateMediaSessionMetadata) {
      window.updateMediaSessionMetadata();
    }
    if (window.updateMediaSessionPlaybackState) {
      window.updateMediaSessionPlaybackState();
    }

    if (!isSameTrack || audio.paused || audio.ended) {
      isLoading = true;
      loadingTrackId = track.id;
      window.dispatchEvent(
        new CustomEvent("trackLoading", {
          detail: { trackId: track.id, isLoading: true },
        }),
      );
    } else {
      clearLoadingState();
    }

    updateNavigationButtons();

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((error) => {
        console.error("Play error:", error.name, error.message);
        isPlaying = false;
        isLoading = false;
        loadingTrackId = null;
        updatePlayPauseButton();
        syncSurvivalKitState();

        window.dispatchEvent(
          new CustomEvent("trackLoading", {
            detail: { trackId: track.id, isLoading: false },
          }),
        );

        if (error.name === "NotAllowedError") {
          if (window.showToast) {
            window.showToast(
              window.t?.("player.interactionNeeded") ||
                "Please interact with the page first to play audio.",
              "warning",
              3000,
            );
          }
        } else if (
          error.name === "NotSupportedError" ||
          error.name === "AbortError"
        ) {
          if (window.showToast) {
            window.showToast(
              window.t?.("player.loadError") ||
                "Failed to load track. Please check your connection.",
              "error",
              3000,
            );
          }
        }
      });
    }

    savePlaybackState().catch(() => {});
  }

  async function restorePlaylistState(savedState) {
    if (!savedState?.playlistId || !window.playlistManager) return false;

    const playlist = window.playlistManager.playlists.find(
      (p) => p.id === savedState.playlistId,
    );
    if (!playlist) return false;

    if (!playlist.trackIds) {
      playlist.trackIds = playlist.tracks?.map((t) => t.id) || [];
    }

    const resolvedTracks =
      (await window.melechDB?.resolveTrackIds(playlist.trackIds)) || [];

    window.currentPlaylist = {
      ...playlist,
      tracks: resolvedTracks,
      trackIds: [...playlist.trackIds],
      currentIndex: savedState.playlistIndex || 0,
      shuffledIndices: savedState.shuffledIndices || [],
      shufflePointer: savedState.shufflePointer || 0,
      currentTrackId: savedState.track?.id,
    };

    if (savedState.isShuffle && window.playlistManager) {
      window.playlistManager.isShuffle = true;
      shuffleBtn?.classList.add("btn-active");
      isShuffle = true;
      if (
        savedState.shuffledTrackIds &&
        savedState.shuffledTrackIds.length > 0
      ) {
        window.playlistManager.shuffledTrackOrder = savedState.shuffledTrackIds
          .map((id) => resolvedTracks.find((t) => t.id === id))
          .filter((t) => t);
      } else {
        window.playlistManager.shuffledTrackOrder =
          window.playlistManager.createShuffledTrackOrder(resolvedTracks);
      }
    }

    updateNavigationButtons();
    window.playlistManager.renderPlaylistList();

    if (
      typeof updateNowPlayingUI === "function" &&
      typeof currentTrack !== "undefined" &&
      currentTrack
    ) {
      updateNowPlayingUI(currentTrack);
    }

    return true;
  }

  (async () => {
    try {
      const savedState = await loadPlaybackState();
      if (savedState && savedState.track) {
        let track = savedState.track;

        if (savedState.track._ref || !savedState.track.audioBlob) {
          let fullTrack = await window.melechDB?.getUserSongById(
            savedState.track.id,
          );

          if (!fullTrack && window.melechLibrary?.allTracks) {
            fullTrack = window.melechLibrary.allTracks.find(
              (t) => t.id === savedState.track.id,
            );
          }

          track = {
            id: fullTrack ? fullTrack.id : savedState.track.id,
            title: fullTrack ? fullTrack.title : savedState.track.title,
            artist: fullTrack ? fullTrack.artist : savedState.track.artist,
            image: fullTrack ? fullTrack.image : savedState.track.image,
            audio: fullTrack ? fullTrack.audio : savedState.track.audio,
            audioBlob: fullTrack ? fullTrack.audioBlob : null,
            source: fullTrack
              ? fullTrack.source || "library"
              : savedState.track.source || "url",
            isLive:
              savedState.track.isLive ||
              savedState.track.source === "radio" ||
              (fullTrack && fullTrack.source === "radio"),
          };
        }

        const audioSource = track.audioBlob || track.audio;
        if (!audioSource) return;

        if (track.audioBlob instanceof Blob) {
          revokeOldObjectUrls();
          const tempUrl = URL.createObjectURL(track.audioBlob);
          activeObjectUrls.push(tempUrl);
          track = { ...track, audio: tempUrl };
        } else if (track.audio && track.audio.startsWith("blob:")) {
          return;
        }

        currentTrack = track;
        window.currentTrack = track;

        window._savedPlaybackTime = savedState.currentTime || 0;

        updateNowPlayingUI(track);

        if (window.updateMediaSessionMetadata) {
          window.updateMediaSessionMetadata();
        }

        const restored = await restorePlaylistState(savedState);
        if (!restored && savedState.playlistId) {
          window.addEventListener(
            "playlistsLoaded",
            async () => {
              await restorePlaylistState(savedState);
            },
            { once: true },
          );
        }
      }
    } catch (err) {
      console.error("Playback state load error:", err);
    }
  })();

  (async () => {
    if (window.melechDB) {
      try {
        const savedShuffle = await window.melechDB.getSetting(
          "shuffleEnabled",
          false,
        );
        isShuffle = savedShuffle;
        if (isShuffle && shuffleBtn) {
          shuffleBtn.classList.add("btn-active");
        }
        if (window.playlistManager) {
          await window.playlistManager.setShuffle(isShuffle);
        }
        if (
          typeof updateNowPlayingUI === "function" &&
          typeof currentTrack !== "undefined" &&
          currentTrack
        ) {
          updateNowPlayingUI(currentTrack);
        }
      } catch (err) {
        console.error(err);
      }
    }

    if (window.melechDB) {
      try {
        const savedLoopMode = await window.melechDB.getSetting("loopMode", 0);
        loopMode = savedLoopMode;
        if (loopMode > 0 && loopBtn && loopIcon) {
          loopBtn.classList.add("btn-active");
          if (loopMode === 2) {
            loopIcon.textContent = "repeat_one";
          }
        }
        if (
          typeof updateNowPlayingUI === "function" &&
          typeof currentTrack !== "undefined" &&
          currentTrack
        ) {
          updateNowPlayingUI(currentTrack);
        }
      } catch (err) {
        console.error(err);
      }
    }
  })();

  (async () => {
    if (!window.melechDB) return;

    try {
      const savedVolume = await window.melechDB.getSetting("volume", 66);
      if (savedVolume !== null && savedVolume !== undefined) {
        lastVolume = savedVolume;
        const currentAudio = window.audio || audio;
        if (currentAudio) {
          currentAudio.volume = savedVolume / 100;
        }
        volumeSliders.forEach((s) => {
          s.value = savedVolume;
          updateSliderBackground(s, "#800020");
        });
        updateVolumeIcon(savedVolume);
      }
    } catch (err) {
      console.error(err);
    }
  })();

  function updatePlayPauseButton() {
    const icon = playPauseBtn.querySelector(".material-symbols-rounded");
    const miniIcon = document.querySelector(
      "#miniPlayPauseBtn .material-symbols-rounded",
    );
    const fullIcon = document.querySelector(
      "#fullPlayPauseBtn .material-symbols-rounded",
    );

    const iconName = isPlaying ? "pause" : "play_arrow";
    if (icon) icon.textContent = iconName;
    if (miniIcon) miniIcon.textContent = iconName;
    if (fullIcon) fullIcon.textContent = iconName;

    if (isPlaying) {
      playPauseBtn.classList.add("shadow-[0_0_25px_rgba(128,0,32,0.4)]");
    } else {
      playPauseBtn.classList.remove("shadow-[0_0_25px_rgba(128,0,32,0.4)]");
    }

    window.dispatchEvent(
      new CustomEvent("playPauseStateChanged", {
        detail: { isPlaying, currentTrack },
      }),
    );

    if (typeof updateNowPlayingUI === "function" && currentTrack) {
      updateNowPlayingUI(currentTrack);
    }
  }

  async function togglePlay() {
    const currentAudio = window.audio || audio;

    await unlockAudioChannels();

    if (!currentTrack) {
      try {
        const saved = await loadPlaybackState();
        if (saved && saved.track) {
          let track = saved.track;
          if (saved.track._ref || !saved.track.audioBlob) {
            const fullTrack = await window.melechDB?.getUserSongById(
              saved.track.id,
            );
            if (fullTrack) {
              track = {
                id: fullTrack.id,
                title: fullTrack.title,
                artist: fullTrack.artist,
                image: fullTrack.image,
                audio: fullTrack.audio,
                audioBlob: fullTrack.audioBlob,
                source: fullTrack.source || "library",
                isLive: fullTrack.source === "radio" || fullTrack.isLive,
              };
            }
          }
          const fromPlaylist = !!saved.playlistId;
          await playTrack(track, saved.currentTime, fromPlaylist);
        }
      } catch (err) {
        console.error(err);
      }
      return;
    }

    const crossfading =
      typeof window.isCrossfading === "function"
        ? window.isCrossfading()
        : isCrossfading;

    if (crossfading) {
      const priAudio = window.primaryAudio || primaryAudio;
      const secAudio = window.secondaryAudio || secondaryAudio;
      if (priAudio.paused && secAudio.paused) {
        try {
          await Promise.all([priAudio.play(), secAudio.play()]);
          isPlaying = true;
          updatePlayPauseButton();
        } catch (err) {
          console.error(err);
        }
      } else {
        priAudio.pause();
        secAudio.pause();
        isPlaying = false;
        updatePlayPauseButton();
        syncSurvivalKitState();
        savePlaybackState().catch(() => {});
      }
      return;
    }

    if (isLiveTrack(currentTrack) && optiAudioEngine) {
      const liveChannel = optiAudioEngine.channels.L;

      if (
        !liveChannel.currentUrl ||
        liveChannel.element.src === "" ||
        liveChannel.element.src === window.location.href
      ) {
        await playTrack(currentTrack, 0, !!window.currentPlaylist);
        return;
      }

      if (liveChannel.element.paused) {
        isPlaying = true;
        updatePlayPauseButton();
        try {
          await liveChannel.element.play();
        } catch (error) {
          if (error.name === "NotAllowedError") {
            isPlaying = false;
            updatePlayPauseButton();
            syncSurvivalKitState();
          }
        }
      } else {
        optiAudioEngine.pause();
        isPlaying = false;
        updatePlayPauseButton();
        syncSurvivalKitState();
      }
      return;
    }

    if (!currentAudio || currentAudio.paused) {
      const currentSrc = currentAudio ? currentAudio.src : "";
      const isInvalidBlobUrl =
        currentSrc &&
        currentSrc.startsWith("blob:") &&
        (!currentTrack || currentTrack.audioBlob instanceof Blob === false);
      const isEmptySrc =
        !currentSrc ||
        currentSrc === "null" ||
        currentSrc === "undefined" ||
        currentSrc === window.location.href;

      if ((isInvalidBlobUrl || isEmptySrc) && currentTrack) {
        const resumeTime = window._savedPlaybackTime || 0;
        await playTrack(currentTrack, resumeTime, !!window.currentPlaylist);
        window._savedPlaybackTime = 0;
        return;
      }

      isPlaying = true;
      updatePlayPauseButton();

      const playPromise = currentAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          if (error.name === "NotAllowedError") {
            isPlaying = false;
            updatePlayPauseButton();
            syncSurvivalKitState();
          }
        });
      }
    } else {
      currentAudio.pause();
      isPlaying = false;
      updatePlayPauseButton();
      syncSurvivalKitState();
    }
  }

  playPauseBtn.addEventListener("click", togglePlay);
  window.togglePlay = togglePlay;
  window.getIsPlaying = () => isPlaying;
  window.updateNowPlayingUI = updateNowPlayingUI;
  window.getCurrentTrack = () => currentTrack;
  window.playTrack = playTrack;
  window.updateNavigationButtons = updateNavigationButtons;
  window.getLoopMode = () => loopMode;
  window.updatePlayPauseUI = (playingState) => {
    if (typeof playingState === "boolean") {
      isPlaying = playingState;
    }
    updatePlayPauseButton();
  };

  shuffleBtn.addEventListener("click", async () => {
    isShuffle = !isShuffle;
    shuffleBtn.classList.toggle("btn-active", isShuffle);
    if (window.playlistManager) {
      await window.playlistManager.setShuffle(isShuffle);
      updateNavigationButtons();
    }
    if (window.melechDB) {
      window.melechDB.setSetting("shuffleEnabled", isShuffle).catch(() => {});
    }
    if (currentTrack) updateNowPlayingUI(currentTrack);
  });

  loopBtn.addEventListener("click", () => {
    loopMode = (loopMode + 1) % 3;
    loopBtn.classList.remove("btn-active");
    loopIcon.textContent = "repeat";

    if (loopMode === 1) {
      loopBtn.classList.add("btn-active");
      loopIcon.textContent = "repeat";
    } else if (loopMode === 2) {
      loopBtn.classList.add("btn-active");
      loopIcon.textContent = "repeat_one";
    }
    if (window.melechDB) {
      window.melechDB.setSetting("loopMode", loopMode).catch(() => {});
    }
    if (currentTrack) updateNowPlayingUI(currentTrack);
    updateNavigationButtons();
  });

  skipPrevBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    await playPreviousTrack();
  });

  skipNextBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    await playNextTrack();
  });

  if (fullPlayerPrevBtn) {
    fullPlayerPrevBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      await playPreviousTrack();
    });
  }

  if (fullPlayerNextBtn) {
    fullPlayerNextBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      await playNextTrack();
    });
  }

  if (replay10Btn) {
    replay10Btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (audio.duration) {
        audio.currentTime = Math.max(0, audio.currentTime - 10);
      }
    });
  }

  if (forward10Btn) {
    forward10Btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (audio.duration) {
        audio.currentTime = Math.min(audio.duration, audio.currentTime + 10);
      }
    });
  }

  document.addEventListener("click", (e) => {
    const fullPlayer = document.getElementById("mobileFullPlayer");

    if (e.target.closest("#miniPlayPauseBtn")) {
      playPauseBtn.click();
    } else if (e.target.closest("#miniPlayerInfo")) {
      if (fullPlayer) fullPlayer.classList.remove("translate-y-full");
    }
  });

  async function playNextTrack(isManual = true) {
    if (!isManual && gaplessMode === 'full' && isCrossfading) {
      return;
    }

    survivalKit.activate();

    if (isLiveTrack(currentTrack) && optiAudioEngine) {
      optiAudioEngine.stop();
    }

    if (isManual && isCrossfading) {
      secondaryAudio.pause();
      secondaryAudio.volume = 1;
      secondaryAudio.currentTime = 0;
      primaryAudio.pause();
      primaryAudio.volume = 1;
      isCrossfading = false;
      nextTrackPreloaded = null;
    }

    savePlaybackState().catch(() => {});

    if (window.currentPlaylist && window.playlistManager) {
      const hasNext = await window.playlistManager.playNextInPlaylist();
      if (!hasNext) {
        const trackCount =
          window.currentPlaylist.trackIds?.length ||
          window.currentPlaylist.tracks?.length ||
          0;
        if (loopMode === 1 && trackCount > 0) {
          if (isShuffle) {
            window.playlistManager.generateShuffledIndices();
            const shuffledIndices = window.currentPlaylist.shuffledIndices;
            if (shuffledIndices && shuffledIndices.length > 0) {
              const nextIndex = shuffledIndices[0];
              await window.playlistManager.playTrackFromPlaylist(nextIndex);
            }
          } else {
            await window.playlistManager.playTrackFromPlaylist(0);
          }
        } else {
          isPlaying = false;
          updatePlayPauseButton();
          syncSurvivalKitState();
          if (window.clearMediaSessionPosition) {
            window.clearMediaSessionPosition();
          }
        }
      }
      if (window.updateMediaSessionActionHandlers) {
        window.updateMediaSessionActionHandlers();
      }

      if (window.updateMediaSessionMetadata) {
        window.updateMediaSessionMetadata();
      }
      if (window.updateMediaSessionPlaybackState) {
        window.updateMediaSessionPlaybackState();
      }
      if (window.setupMediaSessionAudioListeners) {
        window.setupMediaSessionAudioListeners();
      }
    } else {
      isPlaying = false;
      updatePlayPauseButton();
      syncSurvivalKitState();
      if (window.clearMediaSessionPosition) {
        window.clearMediaSessionPosition();
      }
    }

    if (typeof updateNowPlayingUI === "function" && currentTrack) {
      updateNowPlayingUI(currentTrack);
    }
  }

  async function playPreviousTrack() {
    survivalKit.activate();

    if (isLiveTrack(currentTrack) && optiAudioEngine) {
      optiAudioEngine.stop();
    }

    if (isCrossfading) {
      secondaryAudio.pause();
      secondaryAudio.volume = 1;
      secondaryAudio.currentTime = 0;
      primaryAudio.pause();
      primaryAudio.volume = 1;
      isCrossfading = false;
      nextTrackPreloaded = null;
    }

    savePlaybackState().catch(() => {});

    if (window.currentPlaylist && window.playlistManager) {
      const hasPrev = await window.playlistManager.playPreviousInPlaylist();
      if (window.updateMediaSessionActionHandlers) {
        window.updateMediaSessionActionHandlers();
      }
    }

    if (typeof updateNowPlayingUI === "function" && currentTrack) {
      updateNowPlayingUI(currentTrack);
    }
  }

  window.playNextTrack = playNextTrack;
  window.playPreviousTrack = playPreviousTrack;

  const closeFullPlayerBtn = document.getElementById("closeFullPlayerBtn");
  if (closeFullPlayerBtn) {
    closeFullPlayerBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      document
        .getElementById("mobileFullPlayer")
        .classList.add("translate-y-full");
    });
  }

  const fullPlayPauseBtn = document.getElementById("fullPlayPauseBtn");
  if (fullPlayPauseBtn) {
    fullPlayPauseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      playPauseBtn.click();
    });
  }

  let timeUpdatePending = false;
  let lastProgressData = null;

  function updateProgressUI() {
    timeUpdatePending = false;
    if (!lastProgressData) return;
    if (
      currentTrack &&
      (currentTrack.source === "radio" || currentTrack.isLive)
    )
      return;

    const { progress, formattedTime } = lastProgressData;
    if (!isDragging) {
      playerSliders.forEach((s) => {
        s.value = progress;
        updateSliderBackground(s);
      });
    }

    const trackTime = document.getElementById("trackTime");
    const mobileProgress = document.getElementById("mobileProgress");
    const fullProgress = document.getElementById("fullPlayerProgress");
    const fullTime = document.getElementById("fullPlayerTime");
    const miniProgressLine = document.getElementById("miniProgressLine");

    if (trackTime) trackTime.textContent = formattedTime;
    if (fullTime) fullTime.textContent = formattedTime;
    if (mobileProgress && !isDragging) {
      mobileProgress.value = progress;
      updateSliderBackground(mobileProgress);
    }
    if (fullProgress && !isDragging) {
      fullProgress.value = progress;
      updateSliderBackground(fullProgress);
    }
    if (miniProgressLine) {
      miniProgressLine.style.width = `${progress}%`;
    }

    timeUpdatePending = false;
  }

  function handleTimeUpdate(a) {
    const activeAudio = window.primaryAudio || primaryAudio;
    if (a !== activeAudio) return;
    if (
      currentTrack &&
      (currentTrack.source === "radio" || currentTrack.isLive)
    )
      return;
    if (isNaN(a.duration)) return;
    const progress = (a.currentTime / a.duration) * 100;
    const formattedTime = formatTime(a.currentTime);
    lastProgressData = { progress, formattedTime };
    if (!timeUpdatePending) {
      timeUpdatePending = true;
      requestAnimationFrame(updateProgressUI);
    }

    if (isPlaying) {
      const remaining = a.duration - a.currentTime;
      const prefetchThreshold = document.hidden ? 30 : 15;

      const allowPreload = gaplessMode === 'full' || gaplessMode === 'preload';
      const allowCrossfade = gaplessMode === 'full';

      if (allowPreload) {
        if (
          remaining < prefetchThreshold &&
          !nextTrackPreloaded &&
          !isPrefetching &&
          !isCrossfading
        ) {
          prefetchNextTrack();
        }
        if (allowCrossfade && remaining <= fadeDuration && nextTrackPreloaded && !isCrossfading) {
          startCrossfade();
        }
      }
    }
  }

  function handleLoadedMetadata(a) {
    const activeAudio = window.primaryAudio || primaryAudio;
    if (a !== activeAudio) return;
    if (
      currentTrack &&
      (currentTrack.source === "radio" || currentTrack.isLive)
    )
      return;
    const duration = formatTime(a.duration);
    const trackDuration = document.getElementById("trackDuration");
    const fullDuration = document.getElementById("fullPlayerDuration");
    if (trackDuration) trackDuration.textContent = duration;
    if (fullDuration) fullDuration.textContent = duration;
  }

  async function handleEnded(a) {
    if (
      currentTrack &&
      (currentTrack.source === "radio" || currentTrack.isLive)
    ) {
      isPlaying = false;
      updatePlayPauseButton();
      return;
    }
    if (gaplessMode === 'full' && isCrossfading) return;

    if (a.id === "secondaryAudio") {
      return;
    }

    if (loopMode === 2) {
      primaryAudio.currentTime = 0;
      try {
        await primaryAudio.play();
        isPlaying = true;
      } catch {
        isPlaying = false;
      }
      updatePlayPauseButton();
      syncSurvivalKitState();
    } else {
      if (window.currentPlaylist && window.playlistManager) {
        await playNextTrack(false);
      } else {
        isPlaying = false;
        updatePlayPauseButton();
        syncSurvivalKitState();
        if (window.clearMediaSessionPosition) {
          window.clearMediaSessionPosition();
        }
      }
    }
  }

  function onTimeUpdate(e) {
    handleTimeUpdate(e.target);
  }
  function onSecondaryTimeUpdate(e) {
    handleTimeUpdate(e.target);
  }
  function onLoadedMetadata(e) {
    handleLoadedMetadata(e.target);
  }
  function onSecondaryLoadedMetadata(e) {
    handleLoadedMetadata(e.target);
  }
  function onEnded(e) {
    handleEnded(e.target);
  }
  function onSecondaryEnded(e) {
    handleEnded(e.target);
  }
  function onPlaying(e) {
    handlePlaying(e.target);
  }
  function onSecondaryPlaying(e) {
    handlePlaying(e.target);
  }
  function onPause(e) {
    handlePause(e.target);
  }
  function onSecondaryPause(e) {
    handlePause(e.target);
  }
  function onError(e) {
    handleError(e, e.target);
  }
  function onSecondaryError(e) {
    handleError(e, e.target);
  }

  function onWaiting(e) {
    handleWaiting(e.target);
  }
  function onSecondaryWaiting(e) {
    handleWaiting(e.target);
  }
  function onStalled(e) {
    handleStalled(e.target);
  }
  function onSecondaryStalled(e) {
    handleStalled(e.target);
  }

  function handleWaiting(a) {
    const activeAudio = window.primaryAudio || primaryAudio;
    if (a !== activeAudio) return;
    if (isPlaying) {
      survivalKit.activate();
      isLoading = true;
      loadingTrackId = currentTrack?.id;
      window.dispatchEvent(
        new CustomEvent("trackLoading", {
          detail: { trackId: currentTrack?.id, isLoading: true },
        }),
      );
    }
  }

  function handleStalled(a) {
    const activeAudio = window.primaryAudio || primaryAudio;
    if (a !== activeAudio) return;

    survivalKit.activate();

    if (currentTrack?.audioBlob instanceof Blob) {
      syncSurvivalKitState();
      return;
    }

    if (isPlaying && !a.paused) {
      a.pause();
      a.play().catch((err) => {
        console.error("Stalled recovery failed:", err);
        isPlaying = false;
        isLoading = false;
        loadingTrackId = null;
        updatePlayPauseButton();
        syncSurvivalKitState();
        clearLoadingState();
      });
    }
  }

  const eventHandlers = {
    timeupdate: { primary: onTimeUpdate, secondary: onSecondaryTimeUpdate },
    loadedmetadata: {
      primary: onLoadedMetadata,
      secondary: onSecondaryLoadedMetadata,
    },
    ended: { primary: onEnded, secondary: onSecondaryEnded },
    playing: { primary: onPlaying, secondary: onSecondaryPlaying },
    pause: { primary: onPause, secondary: onSecondaryPause },
    error: { primary: onError, secondary: onSecondaryError },
    waiting: { primary: onWaiting, secondary: onSecondaryWaiting },
    stalled: { primary: onStalled, secondary: onSecondaryStalled },
  };
  window.gaplessEventHandlers = eventHandlers;

  function attachAudioEventListeners() {
    const allAudios = [primaryAudio, secondaryAudio];
    allAudios.forEach((el) => {
      Object.values(eventHandlers).forEach((h) => {
        el.removeEventListener(
          Object.keys(eventHandlers).find((k) => eventHandlers[k] === h),
          h.primary,
        );
        el.removeEventListener(
          Object.keys(eventHandlers).find((k) => eventHandlers[k] === h),
          h.secondary,
        );
      });
    });

    Object.keys(eventHandlers).forEach((type) => {
      primaryAudio.addEventListener(type, eventHandlers[type].primary);
      secondaryAudio.addEventListener(type, eventHandlers[type].secondary);
    });
  }

  attachAudioEventListeners();
  window.attachGaplessAudioEventListeners = attachAudioEventListeners;

  function clearLoadingState() {
    isLoading = false;
    loadingTrackId = null;
    if (currentTrack) {
      updateNowPlayingUI(currentTrack);
    }
    window.dispatchEvent(
      new CustomEvent("trackLoading", {
        detail: { trackId: null, isLoading: false },
      }),
    );
    syncSurvivalKitState();
  }

  function handlePlaying(a) {
    const activeAudio = window.primaryAudio || primaryAudio;
    if (a !== activeAudio) return;
    clearLoadingState();
    if (!isPlaying) {
      isPlaying = true;
      updatePlayPauseButton();
    }

    survivalKit.activate();
    syncSurvivalKitState();
  }

  function handlePause(a) {
    const activeAudio = window.primaryAudio || primaryAudio;
    if (a !== activeAudio) return;
    if (isPlaying && !a.ended) {
      isPlaying = false;
      updatePlayPauseButton();
      savePlaybackState().catch(() => {});
    }
    clearLoadingState();
    syncSurvivalKitState();
  }

  function handleError(e, a) {
    if (a._errorSilenced) return;

    const activeAudio = window.primaryAudio || primaryAudio;
    const isSecondaryDuringCrossfade = isCrossfading && a === secondaryAudio;

    if (a.error?.code === 4 || a.error?.code === 3) {
      const trackToRecover = isSecondaryDuringCrossfade
        ? nextTrackPreloaded
        : currentTrack;

      if (trackToRecover && trackToRecover.audioBlob instanceof Blob) {
        const newUrl = URL.createObjectURL(trackToRecover.audioBlob);
        const savedTime = a.currentTime;

        a.src = newUrl;
        a.load();

        a.currentTime = savedTime;
        a.play()
          .then(() => {
            survivalKit.activate();
          })
          .catch(() => {});
        return;
      }
    }

    const currentSrcAttr = a.getAttribute("src");
    if (
      !a.src ||
      a.src === "" ||
      a.src === window.location.href ||
      !currentSrcAttr
    ) {
      return;
    }

    if (a !== activeAudio && !isSecondaryDuringCrossfade) {
      a._errorSilenced = true;
      a.pause();
      try {
        a.removeAttribute("src");
      } catch (ex) {
        console.error(ex);
      }
      return;
    }

    const trackToRecover = isSecondaryDuringCrossfade
      ? nextTrackPreloaded
      : currentTrack;

    if (trackToRecover && trackToRecover.audioBlob instanceof Blob) {
      const currentSrc = a.src;
      const attempts = (a._recoveryAttempts || 0) + 1;
      a._recoveryAttempts = attempts;
      if (attempts > 3) {
        a._errorSilenced = true;
        clearLoadingState();
        if (a === activeAudio) {
          isPlaying = false;
          updatePlayPauseButton();
          syncSurvivalKitState();
        }
        return;
      }
      if (currentSrc && currentSrc.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(currentSrc);
          activeObjectUrls = activeObjectUrls.filter(
            (url) => url !== currentSrc,
          );
        } catch (ex) {
          console.error(ex);
        }

        const newUrl = URL.createObjectURL(trackToRecover.audioBlob);
        activeObjectUrls.push(newUrl);
        a.src = newUrl;

        a.play().catch((err) => {
          console.error("Offline blob recovery play failed:", err);
          if (a === activeAudio) {
            isPlaying = false;
            isLoading = false;
            loadingTrackId = null;
            updatePlayPauseButton();
            syncSurvivalKitState();
            clearLoadingState();

            if (window.showToast) {
              window.showToast(
                window.t?.("player.offlinePlayError") ||
                  "Failed to play offline track.",
                "error",
                3000,
              );
            }
          }
        });
        return;
      }
    }

    clearLoadingState();
    if (isPlaying && a === activeAudio) {
      isPlaying = false;
      updatePlayPauseButton();
      syncSurvivalKitState();
    }
  }

  window.addEventListener("beforeunload", () => {
    savePlaybackState().catch(() => {});
  });

  window.addEventListener("playTrack", async (e) => {
    const track = e.detail;
    const fromPlaylist = track.fromPlaylist === true;
    await playTrack(track, 0, fromPlaylist);
  });

  let isDragging = false;

  playerSliders.forEach((slider) => {
    slider.addEventListener("mousedown", () => (isDragging = true));
    slider.addEventListener("touchstart", () => (isDragging = true), {
      passive: true,
    });
    slider.addEventListener("mouseup", () => (isDragging = false));
    slider.addEventListener("touchend", () => (isDragging = false));
    slider.addEventListener("input", (e) => {
      const val = e.target.value;
      playerSliders.forEach((s) => {
        s.value = val;
        updateSliderBackground(s);
      });
    });
    slider.addEventListener("change", (e) => {
      isDragging = false;

      const currentAudio = window.audio || window.primaryAudio;
      if (currentAudio && currentAudio.duration) {
        const time = (e.target.value / 100) * currentAudio.duration;
        const remaining = currentAudio.duration - time;
        if (
          typeof window.isCrossfading === "function" &&
          window.isCrossfading()
        ) {
          window.cancelGaplessCrossfade();
        }
        if (
          isGaplessPlaybackEnabled &&
          remaining < fadeDuration &&
          remaining > 0.5
        ) {
          resetGaplessPreload();
        }

        currentAudio.currentTime = time;
      }
    });
  });

  function updateVolumeIcon(val) {
    const icon = volumeBtn.querySelector(".material-symbols-rounded");
    if (val == 0) {
      icon.textContent = "volume_off";
      volumeBtn.classList.add("text-white/20");
    } else if (val < 50) {
      icon.textContent = "volume_down";
      volumeBtn.classList.remove("text-white/20");
    } else {
      icon.textContent = "volume_up";
      volumeBtn.classList.remove("text-white/20");
    }
  }

  audio.volume = 0.66;

  function updateVolumeSlidersVisual(value) {
    volumeSliders.forEach((s) => {
      s.value = Math.round(value);
      updateSliderBackground(s, "#800020");
    });
    updateVolumeIcon(Math.round(value));
  }

  volumeSliders.forEach((slider) => {
    slider.addEventListener("input", async (e) => {
      const val = parseInt(e.target.value);

      const currentAudio = window.audio || audio;
      const crossfading =
        typeof window.isCrossfading === "function"
          ? window.isCrossfading()
          : false;

      if (crossfading && window.primaryAudio && window.secondaryAudio) {
        window.primaryAudio.volume = val / 100;
        window.secondaryAudio.volume = val / 100;
      } else if (currentAudio) {
        currentAudio.volume = val / 100;
      }
      lastVolume = val;

      volumeSliders.forEach((s) => {
        s.value = val;
        updateSliderBackground(s, "#800020");
      });
      updateVolumeIcon(val);

      if (window.melechDB) {
        window.melechDB.setSetting("volume", val).catch(() => {});
      }
    });
  });

  volumeBtn.addEventListener("click", () => {
    const currentVal = parseInt(volumeSliders[0].value);
    const currentAudio = window.audio || audio;
    const crossfading =
      typeof window.isCrossfading === "function"
        ? window.isCrossfading()
        : false;

    if (currentVal > 0) {
      lastVolume = currentVal;
      volumeSliders.forEach((s) => {
        s.value = 0;
        updateSliderBackground(s, "#800020");
      });
      updateVolumeIcon(0);
      if (window.melechDB) {
        window.melechDB.setSetting("volume", 0).catch(() => {});
      }
      if (crossfading && window.primaryAudio && window.secondaryAudio) {
        window.primaryAudio.volume = 0;
        window.secondaryAudio.volume = 0;
      } else if (currentAudio) {
        currentAudio.volume = 0;
      }
    } else {
      volumeSliders.forEach((s) => {
        s.value = lastVolume;
        updateSliderBackground(s, "#800020");
      });
      updateVolumeIcon(lastVolume);
      if (window.melechDB) {
        window.melechDB.setSetting("volume", lastVolume).catch(() => {});
      }
      if (crossfading && window.primaryAudio && window.secondaryAudio) {
        window.primaryAudio.volume = lastVolume / 100;
        window.secondaryAudio.volume = lastVolume / 100;
      } else if (currentAudio) {
        currentAudio.volume = lastVolume / 100;
      }
    }
  });

  function updateNavigationButtons() {
    const canNext = window.playlistManager?.canGoNext() || false;
    const canPrev = window.playlistManager?.canGoPrev() || false;
    if (
      currentTrack &&
      (currentTrack.source === "radio" || currentTrack.isLive)
    )
      return;
    const nextButtons = [skipNextBtn, fullPlayerNextBtn];
    const prevButtons = [skipPrevBtn, fullPlayerPrevBtn];

    nextButtons.forEach((btn) => {
      if (btn) {
        btn.style.opacity = canNext ? "1" : "0.2";
        btn.style.pointerEvents = canNext ? "auto" : "none";
      }
    });

    prevButtons.forEach((btn) => {
      if (btn) {
        btn.style.opacity = canPrev ? "1" : "0.2";
        btn.style.pointerEvents = canPrev ? "auto" : "none";
      }
    });

    if (window.updateMediaSessionActionHandlers) {
      window.updateMediaSessionActionHandlers();
    }
  }

  function toggleCurrentTrackFavorite() {
    if (!currentTrack || !window.playlistManager) return;
    window.playlistManager.toggleFavorite(currentTrack);
  }

  favoriteMiniPlayerBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleCurrentTrackFavorite();
  });

  favoriteFooterBtn?.addEventListener("click", () => {
    toggleCurrentTrackFavorite();
  });

  fullPlayerFavoriteBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleCurrentTrackFavorite();
  });

  sidePlayerFavoriteBtn?.addEventListener("click", () => {
    toggleCurrentTrackFavorite();
  });

  function updateFavoriteUI(trackId = null, isFav = null) {
    if (!currentTrack) {
      [favoriteFooterBtn, sidePlayerFavoriteBtn].forEach((btn) => {
        if (btn) btn.classList.add("opacity-0", "pointer-events-none");
      });
      return;
    }

    const targetId = trackId || currentTrack.id;
    if (targetId !== currentTrack.id) return;

    [favoriteFooterBtn, sidePlayerFavoriteBtn].forEach((btn) => {
      if (btn) btn.classList.remove("opacity-0", "pointer-events-none");
    });

    const isFavorite =
      isFav !== null
        ? isFav
        : window.playlistManager?.isTrackFavorite(targetId) || false;

    const icons = [
      favoriteMiniPlayerBtn?.querySelector(".material-symbols-rounded"),
      favoriteFooterBtn?.querySelector(".material-symbols-rounded"),
      fullPlayerFavoriteBtn?.querySelector(".material-symbols-rounded"),
      sidePlayerFavoriteBtn?.querySelector(".material-symbols-rounded"),
    ];

    icons.forEach((icon) => {
      if (icon) {
        icon.textContent = isFavorite ? "favorite" : "favorite";
        icon.style.fontVariationSettings = isFavorite ? "'FILL' 1" : "'FILL' 0";
        if (isFavorite) {
          icon.classList.add("text-red-500");
          icon.classList.remove("text-white/40");
        } else {
          icon.classList.remove("text-red-500");
          icon.classList.add("text-white/40");
        }
      }
    });
  }

  window.addEventListener("favoritesUpdated", (e) => {
    updateFavoriteUI(e.detail.trackId, e.detail.isFavorite);
  });

  window.addEventListener("playTrack", () => {
    setTimeout(() => updateFavoriteUI(), 50);
  });

  window.addEventListener("togglePlayPause", async () => {
    if (window.togglePlay) {
      await window.togglePlay();
      if (window.playlistManager?.renderPlaylistList) {
        window.playlistManager.renderPlaylistList();
      }
    }
  });

  initGaplessPlayback();

  gaplessCheckInterval = setInterval(() => {
    if (!currentTrack || isLiveTrack(currentTrack)) return;
    checkForTrackTransition();
  }, 1000);
});
