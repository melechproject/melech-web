"use strict";

(function () {
  let stations = [];
  let currentStation = null;

  async function initRadio() {
    try {
      const response = await fetch("./radio-lib/radio-lib.json");
      stations = await response.json();
      renderStationList();
      setupEventListeners();
    } catch (err) { console.error(err); }
  }

  function setupEventListeners() {
    const desktopRadioBtn = document.getElementById("desktopRadioBtn");
    const mobileRadioBtn = document.getElementById("mobileRadioBtn");
    const radioStationBackdrop = document.getElementById(
      "radioStationBackdrop",
    );
    const cancelRadioStation = document.getElementById("cancelRadioStation");

    if (desktopRadioBtn)
      desktopRadioBtn.addEventListener("click", (e) => {
        e.preventDefault();
        showRadioPopup();
      });
    if (mobileRadioBtn)
      mobileRadioBtn.addEventListener("click", (e) => {
        e.preventDefault();
        showRadioPopup();
      });

    if (radioStationBackdrop)
      radioStationBackdrop.addEventListener("click", hideRadioPopup);
    if (cancelRadioStation)
      cancelRadioStation.addEventListener("click", hideRadioPopup);
  }

  function renderStationList() {
    const list = document.getElementById("radioStationList");
    if (!list) return;

    const fragment = document.createDocumentFragment();
    list.innerHTML = "";

    stations.forEach((station) => {
      const button = document.createElement("button");
      button.className =
        "w-full px-4 py-3 text-left text-white hover:bg-white/10 rounded-xl transition-colors flex items-center gap-3 group";
      button.innerHTML = `
                <span class="material-symbols-rounded text-white/40 group-hover:text-[var(--primary-color)] transition-colors">radio</span>
                <div class="flex-1 min-w-0 text-left">
                    <div class="font-medium truncate text-sm md:text-base">${station.name}</div>
                    <div class="text-[10px] md:text-xs text-white/40 truncate">${station.group || "Radio"}</div>
                </div>
            `;
      button.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        playRadioStation(station);
        hideRadioPopup();
      };
      fragment.appendChild(button);
    });

    list.appendChild(fragment);
  }

  function showRadioPopup() {
    const modal = document.getElementById("radioStationModal");
    if (!modal) return;

    modal.classList.remove("pointer-events-none", "opacity-0");
    const content = modal.querySelector(".relative");
    if (content) {
      content.classList.remove("scale-95");
      content.classList.add("scale-100");
    }
  }

  function hideRadioPopup() {
    const modal = document.getElementById("radioStationModal");
    if (!modal) return;
    modal.classList.add("pointer-events-none", "opacity-0");
    const content = modal.querySelector(".relative");
    if (content) {
      content.classList.remove("scale-100");
      content.classList.add("scale-95");
    }
  }

  function playRadioStation(station) {
    if (!station) return;
    currentStation = station;

    const radioTrack = {
      id: "radio-" + station.name.toLowerCase().replace(/\s+/g, "-"),
      title: station.name,
      artist: window.t ? window.t("radio.live") : "LIVE",
      image: "radio-lib/data/images/RadioCover.png",
      audio: station.streamUrl,
      source: "radio",
      isLive: true,
    };

    if (window.playTrack) {
      window.playTrack(radioTrack);

      updateRadioUI();
    }
  }

  function updateRadioUI() {
    const currentTrack = window.getCurrentTrack
      ? window.getCurrentTrack()
      : null;
    if (
      !currentTrack ||
      (currentTrack.source !== "radio" && !currentTrack.isLive)
    )
      return;

    const trackProgress = document.getElementById("trackProgress");
    const fullPlayerProgress = document.getElementById("fullPlayerProgress");
    const mobileProgress = document.getElementById("mobileProgress");

    [trackProgress, fullPlayerProgress, mobileProgress].forEach((progress) => {
      if (progress) {
        progress.classList.add("radio-is-live");
        progress.disabled = true;
        progress.value = 100;
        progress.style.background = `linear-gradient(to right, var(--primary-color) 100%, rgba(162, 162, 162, 0.3) 100%)`;
      }
    });

    const liveIndicator = document.getElementById("liveIndicator");
    const liveIndicatorMobile = document.getElementById("liveIndicatorMobile");
    const liveIndicatorFull = document.getElementById("liveIndicatorFull");
    if (liveIndicator) liveIndicator.classList.remove("hidden");
    if (liveIndicatorMobile) liveIndicatorMobile.classList.remove("hidden");
    if (liveIndicatorFull) liveIndicatorFull.classList.remove("hidden");

    const trackTime = document.getElementById("trackTime");
    const trackDuration = document.getElementById("trackDuration");
    const fullPlayerTime = document.getElementById("fullPlayerTime");
    const fullPlayerDuration = document.getElementById("fullPlayerDuration");

    [trackTime, trackDuration, fullPlayerTime, fullPlayerDuration].forEach(
      (el) => {
        if (el) el.classList.add("hidden");
      },
    );

    const skipPrevBtn = document.getElementById("skipPrevBtn");
    const skipNextBtn = document.getElementById("skipNextBtn");
    const fullPlayerPrevBtn = document.getElementById("fullPlayerPrevBtn");
    const fullPlayerNextBtn = document.getElementById("fullPlayerNextBtn");
    const replay10Btn = document.getElementById("replay10Btn");
    const forward10Btn = document.getElementById("forward10Btn");

    [
      skipPrevBtn,
      skipNextBtn,
      fullPlayerPrevBtn,
      fullPlayerNextBtn,
      replay10Btn,
      forward10Btn,
    ].forEach((btn) => {
      if (btn) {
        btn.disabled = true;
        btn.style.opacity = "0.3";
        btn.style.pointerEvents = "none";
      }
    });

    const sidePlayerImage = document.getElementById("sidePlayerImage");
    if (sidePlayerImage) {
      sidePlayerImage.src = "radio-lib/data/images/RadioCover.png";
    }

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: "Radio",
        artwork: [
          {
            src: "radio-lib/data/images/RadioCover.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      });

      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);

      navigator.mediaSession.playbackState =
        window.getIsPlaying && window.getIsPlaying() ? "playing" : "paused";

      try {
        navigator.mediaSession.setPositionState({
          duration: Infinity,
          playbackRate: 1,
          position: 0,
        });
      } catch (e) { console.error(e); }
    }
  }

  window.addEventListener("playPauseStateChanged", (e) => {
    const { isPlaying, currentTrack } = e.detail;
    if (
      isPlaying &&
      currentTrack &&
      (currentTrack.source === "radio" || currentTrack.isLive)
    ) {
      const audio = window.audio || document.querySelector("audio");
      if (audio) {
        if (audio.duration && isFinite(audio.duration)) {
          audio.currentTime = audio.duration;
        } else {
          const oldSrc = audio.src;
          audio.src = "";
          audio.src = oldSrc;
          audio
            .play()
            .catch((err) => console.warn("[Radio] Resume sync failed:", err));
        }
      }
      updateRadioUI();
    }
  });

  window.addEventListener("trackLoading", (e) => {
    setTimeout(() => {
      const currentTrack = window.getCurrentTrack
        ? window.getCurrentTrack()
        : null;
      if (
        currentTrack &&
        currentTrack.source !== "radio" &&
        !currentTrack.isLive
      ) {
        resetRadioUI();
      }
    }, 100);
  });

  function resetRadioUI() {
    const trackProgress = document.getElementById("trackProgress");
    const fullPlayerProgress = document.getElementById("fullPlayerProgress");
    const mobileProgress = document.getElementById("mobileProgress");

    [trackProgress, fullPlayerProgress, mobileProgress].forEach((progress) => {
      if (progress) {
        progress.classList.remove("radio-is-live");
        progress.disabled = false;
      }
    });

    const liveIndicator = document.getElementById("liveIndicator");
    const liveIndicatorMobile = document.getElementById("liveIndicatorMobile");
    const liveIndicatorFull = document.getElementById("liveIndicatorFull");
    if (liveIndicator) liveIndicator.classList.add("hidden");
    if (liveIndicatorMobile) liveIndicatorMobile.classList.add("hidden");
    if (liveIndicatorFull) liveIndicatorFull.classList.add("hidden");

    const trackTime = document.getElementById("trackTime");
    const trackDuration = document.getElementById("trackDuration");
    const fullPlayerTime = document.getElementById("fullPlayerTime");
    const fullPlayerDuration = document.getElementById("fullPlayerDuration");

    [trackTime, trackDuration, fullPlayerTime, fullPlayerDuration].forEach(
      (el) => {
        if (el) el.classList.remove("hidden");
      },
    );

    const skipPrevBtn = document.getElementById("skipPrevBtn");
    const skipNextBtn = document.getElementById("skipNextBtn");
    const fullPlayerPrevBtn = document.getElementById("fullPlayerPrevBtn");
    const fullPlayerNextBtn = document.getElementById("fullPlayerNextBtn");
    const replay10Btn = document.getElementById("replay10Btn");
    const forward10Btn = document.getElementById("forward10Btn");

    [
      skipPrevBtn,
      skipNextBtn,
      fullPlayerPrevBtn,
      fullPlayerNextBtn,
      replay10Btn,
      forward10Btn,
    ].forEach((btn) => {
      if (btn) {
        btn.disabled = false;
        btn.style.opacity = "";
        btn.style.pointerEvents = "";
      }
    });

    if (window.updateNavigationButtons) {
      window.updateNavigationButtons();
    }
  }

  window.initRadio = initRadio;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initRadio);
  } else {
    initRadio();
  }
})();
