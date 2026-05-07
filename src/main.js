window.addEventListener("DOMContentLoaded", async () => {
  if (window.jukehostIntegration) {
    window.jukehostIntegration.init();
  }

  let userSettings = { username: "User" };

  if (window.melechDB) {
    const savedUsername = await window.melechDB.getSetting("username", "User");
    userSettings.username = savedUsername;
  }

  function updateGreeting() {
    const hour = new Date().getHours();
    let greeting = "";
    if (hour >= 5 && hour < 12) {
      greeting = window.t("greeting.morning") || "Good Morning";
    } else if (hour >= 12 && hour < 18) {
      greeting = window.t("greeting.afternoon") || "Good Afternoon";
    } else if (hour >= 18 && hour < 22) {
      greeting = window.t("greeting.evening") || "Good Evening";
    } else {
      greeting = window.t("greeting.night") || "Good Night";
    }
    const username =
      userSettings.username || window.t("greeting.user") || "User";
    const greetingEl = document.getElementById("panelGreeting");
    if (greetingEl) {
      greetingEl.textContent = `${greeting}, ${username}!`;
    }
  }
  updateGreeting();

  const settingsBtn = document.getElementById("settingsBtn");
  const settingsModal = document.getElementById("settingsModal");
  const settingsBackdrop = document.getElementById("settingsBackdrop");
  const closeSettingsBtn = document.getElementById("closeSettingsBtn");
  const usernameInput = document.getElementById("usernameInput");
  const saveUsernameBtn = document.getElementById("saveUsernameBtn");
  const languageSelectBtn = document.getElementById("languageSelectBtn");
  const languageDropdown = document.getElementById("languageDropdown");
  const currentLanguageLabel = document.getElementById("currentLanguageLabel");
  const exploreLimitSlider = document.getElementById("exploreLimitSlider");
  const exploreLimitValue = document.getElementById("exploreLimitValue");
  const gaplessPlaybackToggle = document.getElementById(
    "gaplessPlaybackToggle",
  );
  const fadeDurationContainer = document.getElementById(
    "fadeDurationContainer",
  );
  const fadeDurationSlider = document.getElementById("fadeDurationSlider");
  const fadeDurationValue = document.getElementById("fadeDurationValue");

  async function openSettings() {
    settingsModal?.classList.remove("opacity-0", "pointer-events-none");
    settingsModal?.querySelector(".transform")?.classList.remove("scale-95");
    settingsModal?.querySelector(".transform")?.classList.add("scale-100");

    document.body.style.overflow = "hidden";

    if (usernameInput) {
      usernameInput.value = userSettings.username || "";
    }

    if (currentLanguageLabel && window.i18n) {
      updateLanguageLabel(window.i18n.getSavedLanguage());
    }

    if (exploreLimitSlider && window.melechDB) {
      const savedLimit = await window.melechDB.getSetting(
        "exploreSongLimit",
        30,
      );
      exploreLimitSlider.value = savedLimit;
      if (exploreLimitValue) exploreLimitValue.textContent = savedLimit;
    }

    if (gaplessPlaybackToggle && window.melechDB) {
      const savedGapless = await window.melechDB.getSetting(
        "gaplessPlayback",
        false,
      );
      gaplessPlaybackToggle.checked = savedGapless;
      updateFadeDurationVisibility(savedGapless);
    }

    if (fadeDurationSlider && window.melechDB) {
      const savedFadeDuration = await window.melechDB.getSetting(
        "fadeDuration",
        4,
      );
      fadeDurationSlider.value = savedFadeDuration;
      if (fadeDurationValue)
        fadeDurationValue.textContent = `${savedFadeDuration}s`;
    }
  }

  function closeSettings() {
    settingsModal?.classList.add("opacity-0", "pointer-events-none");
    settingsModal?.querySelector(".transform")?.classList.add("scale-95");
    settingsModal?.querySelector(".transform")?.classList.remove("scale-100");
    document.body.style.overflow = "";
  }

  function updateFadeDurationVisibility(isEnabled) {
    if (fadeDurationContainer) {
      if (isEnabled) {
        fadeDurationContainer.classList.remove(
          "opacity-50",
          "pointer-events-none",
        );
      } else {
        fadeDurationContainer.classList.add(
          "opacity-50",
          "pointer-events-none",
        );
      }
    }
  }

  settingsBtn?.addEventListener("click", () => {
    const playlistOverlay = document.getElementById("playlistOverlay");
    if (playlistOverlay?.classList.contains("open")) {
      playlistOverlay.classList.remove("open");
      document
        .getElementById("playlistOverlayBackdrop")
        ?.classList.remove("open");
    }
    openSettings();
  });

  const settingsBtnMain = document.getElementById("settingsBtnMain");
  settingsBtnMain?.addEventListener("click", () => {
    openSettings();
  });

  closeSettingsBtn?.addEventListener("click", closeSettings);
  settingsBackdrop?.addEventListener("click", closeSettings);

  saveUsernameBtn?.addEventListener("click", async () => {
    const newName = usernameInput?.value.trim();
    if (newName) {
      userSettings.username = newName;
      if (window.melechDB) {
        await window.melechDB.setSetting("username", newName);
      }
      updateGreeting();

      const originalHTML = saveUsernameBtn.innerHTML;
      saveUsernameBtn.innerHTML =
        '<span translate="no" class="material-symbols-rounded">check</span>';
      setTimeout(() => {
        saveUsernameBtn.innerHTML = originalHTML;
      }, 1000);
    }
  });

  usernameInput?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      saveUsernameBtn?.click();
    }
  });

  let isLanguageDropdownOpen = false;
  function updateLanguageLabel(langCode) {
    if (!currentLanguageLabel) return;
    const labels = {
      auto: window.t ? window.t("settings.languageAuto") : "Auto (System)",
      en: "English",
      tr: "Türkçe",
    };
    currentLanguageLabel.textContent = labels[langCode] || labels["auto"];
  }

  function toggleLanguageDropdown() {
    isLanguageDropdownOpen = !isLanguageDropdownOpen;
    if (languageDropdown) {
      if (isLanguageDropdownOpen) {
        languageDropdown.classList.remove("opacity-0", "pointer-events-none");
        languageDropdown.classList.add("opacity-100", "pointer-events-auto");
      } else {
        languageDropdown.classList.add("opacity-0", "pointer-events-none");
        languageDropdown.classList.remove("opacity-100", "pointer-events-auto");
      }
    }
  }

  function closeLanguageDropdown() {
    isLanguageDropdownOpen = false;
    if (languageDropdown) {
      languageDropdown.classList.add("opacity-0", "pointer-events-none");
      languageDropdown.classList.remove("opacity-100", "pointer-events-auto");
    }
  }

  languageSelectBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleLanguageDropdown();
  });

  document.querySelectorAll(".language-option")?.forEach((option) => {
    option.addEventListener("click", async (e) => {
      e.stopPropagation();
      const selectedLang = option.dataset.value;
      if (window.i18n) {
        await window.i18n.setLanguage(selectedLang);
        updateLanguageLabel(selectedLang);
      }
      closeLanguageDropdown();
    });
  });

  document.addEventListener("click", (e) => {
    if (isLanguageDropdownOpen && !e.target.closest("#languageSelector")) {
      closeLanguageDropdown();
    }
  });

  exploreLimitSlider?.addEventListener("input", (e) => {
    const val = e.target.value;
    if (exploreLimitValue) exploreLimitValue.textContent = val;
  });

  exploreLimitSlider?.addEventListener("change", async (e) => {
    const val = parseInt(e.target.value);
    if (window.melechDB) {
      await window.melechDB.setSetting("exploreSongLimit", val);
    }

    if (window.melechLibrary && window.userLibrary) {
      window.melechLibrary.exploreLimit = val;
      const isExploreActive =
        window.userLibrary?.exploreContent &&
        !window.userLibrary.exploreContent.classList.contains("hidden");
      if (isExploreActive) {
        try {
          window.melechLibrary.clearDOM();
          await window.melechLibrary.loadLibrary();
        } catch (err) {
          console.error(err);
        }
      }
    }
  });

  gaplessPlaybackToggle?.addEventListener("change", async (e) => {
    const isEnabled = e.target.checked;
    updateFadeDurationVisibility(isEnabled);
    if (window.melechDB) {
      await window.melechDB.setSetting("gaplessPlayback", isEnabled);
    }

    if (window.setGaplessPlayback) {
      window.setGaplessPlayback(isEnabled);
    }
  });

  fadeDurationSlider?.addEventListener("input", (e) => {
    const val = e.target.value;
    if (fadeDurationValue) fadeDurationValue.textContent = `${val}s`;
  });

  fadeDurationSlider?.addEventListener("change", async (e) => {
    const val = parseInt(e.target.value);
    if (window.melechDB) {
      await window.melechDB.setSetting("fadeDuration", val);
    }

    if (window.setFadeDuration) {
      window.setFadeDuration(val);
    }
  });

  const clearCacheBtn = document.getElementById("clearCacheBtn");
  clearCacheBtn?.addEventListener("click", async () => {
    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }

      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));

      if (window.showToast) {
        window.showToast(
          window.t?.("settings.cacheClearSuccess") ||
            "Cache cleared successfully, Refresh to get updates.",
          "success",
          3000,
        );
      }

      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      console.error("Cache clear failed:", err);
      if (window.showToast) {
        window.showToast(
          window.t?.("settings.cacheClearError") ||
            "Could not clear cache. Please refresh the page.",
          "error",
          3000,
        );
      }
    }
  });

  const menuControlBtn = document.getElementById("menuControlBtn");
  const menuCloseBtn = document.getElementById("menuCloseBtn");
  const menuOverlay = document.getElementById("menuOverlay");

  function openMenu() {
    menuOverlay.classList.add("open");
    menuControlBtn.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
    menuCloseBtn.focus();
  }

  function closeMenu() {
    menuOverlay.classList.remove("open");
    menuControlBtn.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }

  menuControlBtn.addEventListener("click", openMenu);
  menuCloseBtn.addEventListener("click", closeMenu);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menuOverlay.classList.contains("open")) {
      closeMenu();
    }
  });

  menuOverlay.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  const playlistMenuBtn = document.getElementById("playlistMenuBtn");
  const playlistCloseBtn = document.getElementById("playlistCloseBtn");
  const playlistOverlay = document.getElementById("playlistOverlay");
  const playlistBackdrop = document.getElementById("playlistOverlayBackdrop");
  const playlistDetailPanel = document.getElementById("playlistDetailPanel");

  if (playlistMenuBtn && playlistOverlay) {
    playlistMenuBtn.addEventListener("click", () => {
      const isOpen = playlistOverlay.classList.contains("open");
      if (isOpen) {
        playlistOverlay.classList.remove("open");
        playlistBackdrop?.classList.remove("open");
        playlistMenuBtn.setAttribute("aria-expanded", "false");
      } else {
        if (playlistDetailPanel?.classList.contains("open")) {
          playlistDetailPanel.classList.remove("open");
        }
        playlistOverlay.classList.add("open");
        playlistBackdrop?.classList.add("open");
        playlistMenuBtn.setAttribute("aria-expanded", "true");
      }
    });
  }

  if (playlistCloseBtn && playlistOverlay) {
    playlistCloseBtn.addEventListener("click", () => {
      playlistOverlay.classList.remove("open");
      playlistBackdrop?.classList.remove("open");
      playlistMenuBtn?.setAttribute("aria-expanded", "false");
    });
  }

  if (playlistBackdrop) {
    playlistBackdrop.addEventListener("click", () => {
      playlistOverlay.classList.remove("open");
      playlistBackdrop.classList.remove("open");
      playlistMenuBtn?.setAttribute("aria-expanded", "false");
    });
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("./sw.js", { scope: "./" })
    .then((reg) => {
      console.log("SW registered:", reg.scope);
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        newWorker.addEventListener("statechange", () => {
          if (
            newWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            console.log("New SW available, reloading...");
            window.location.reload();
          }
        });
      });
    })
    .catch((err) => console.error("SW registration failed:", err));
}
