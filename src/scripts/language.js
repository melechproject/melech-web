class I18n {
  constructor() {
    this.currentLang = "en";
    this.savedLang = "auto";
    this.translations = {};
    this.fallbackLang = "en";
    this.listeners = [];
    this.availableLangs = ["en", "tr"];
  }

  async init(defaultLang = "en") {
    this.savedLang = localStorage.getItem("melech-language") || "auto";
    this.currentLang = this._resolveLanguage(this.savedLang);

    await this.loadLanguage(this.currentLang);
    if (this.fallbackLang !== this.currentLang) {
      await this.loadLanguage(this.fallbackLang);
    }

    this.applyTranslations();
    document.documentElement.lang = this.currentLang;
  }

  _resolveLanguage(langCode) {
    if (langCode !== "auto") {
      return this.availableLangs.includes(langCode)
        ? langCode
        : this.fallbackLang;
    }

    const browserLang = navigator.language || navigator.userLanguage || "en";
    const primaryLang = browserLang.split("-")[0].toLowerCase();

    if (this.availableLangs.includes(primaryLang)) {
      return primaryLang;
    }

    return this.fallbackLang;
  }

  getSavedLanguage() {
    return this.savedLang;
  }

  async loadLanguage(langCode) {
    try {
      const basePath = window.location.pathname.includes("/about/")
        ? "../"
        : "";
      const response = await fetch(`${basePath}language/${langCode}.json`);
      if (!response.ok) throw new Error(`Failed to load ${langCode}`);
      this.translations[langCode] = await response.json();
    } catch (error) {
      if (langCode !== this.fallbackLang) {
        await this.loadLanguage(this.fallbackLang);
      }
    }
  }

  t(key, params = {}) {
    const lang =
      this.translations[this.currentLang] ||
      this.translations[this.fallbackLang] ||
      {};
    const keys = key.split(".");
    let value = lang;

    for (const k of keys) {
      value = value?.[k];
      if (value === undefined) break;
    }

    if (value === undefined) {
      const fallback = this.translations[this.fallbackLang];
      if (fallback) {
        let fbValue = fallback;
        for (const k of keys) {
          fbValue = fbValue?.[k];
          if (fbValue === undefined) break;
        }
        if (fbValue !== undefined) value = fbValue;
      }
    }

    if (value === undefined) {
      return key;
    }

    return value.replace(/\{\{(\w+)\}\}/g, (match, paramKey) => {
      return params[paramKey] !== undefined ? params[paramKey] : match;
    });
  }

  async setLanguage(langCode) {
    this.savedLang = langCode;
    localStorage.setItem("melech-language", langCode);
    const resolvedLang = this._resolveLanguage(langCode);

    if (resolvedLang === this.currentLang && langCode !== "auto") return;

    if (!this.translations[resolvedLang]) {
      await this.loadLanguage(resolvedLang);
    }

    this.currentLang = resolvedLang;
    document.documentElement.lang = resolvedLang;

    this.applyTranslations();
    
    const manifestLink = document.getElementById("manifest-link");
    if (manifestLink) {
        manifestLink.href = resolvedLang === "tr" ? "manifest-tr.json" : "manifest-en.json";
    }

    this.notifyListeners();
  }

  _isSongPlaying() {
    if (window.currentTrack) {
      return true;
    }

    const sidePlayerTitle = document.getElementById("sidePlayerTitle");

    if (sidePlayerTitle) {
      const text = sidePlayerTitle.textContent?.trim();
      if (
        text &&
        text !== "" &&
        text !== "player.noSongPlaying" &&
        text !== "No song playing"
      ) {
        return true;
      }
    }
    return false;
  }

  applyTranslations() {
    const isSongPlaying = this._isSongPlaying();
    const elements = document.querySelectorAll("[data-i18n]");
    elements.forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const attr = el.getAttribute("data-i18n-attr") || "textContent";

      if (
        isSongPlaying &&
        (key === "player.noSongPlaying" || key === "player.noArtistSelected")
      ) {
        return;
      }

      const translation = this.t(key);

      if (attr === "textContent") {
        el.textContent = translation;
      } else if (attr === "innerHTML") {
        el.innerHTML = translation;
      } else {
        el.setAttribute(attr, translation);
      }
    });

    const placeholderElements = document.querySelectorAll(
      "[data-i18n-placeholder]",
    );
    placeholderElements.forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      el.placeholder = this.t(key);
    });

    const ariaElements = document.querySelectorAll("[data-i18n-aria]");
    ariaElements.forEach((el) => {
      const key = el.getAttribute("data-i18n-aria");
      el.setAttribute("aria-label", this.t(key));
    });
  }

  onLanguageChange(callback) {
    this.listeners.push(callback);
  }

  notifyListeners() {
    this.listeners.forEach((callback) => {
      try {
        callback(this.currentLang);
      } catch (error) {
        console.error(error);
      }
    });
  }

  getCurrentLang() {
    return this.currentLang;
  }

  getAvailableLanguages() {
    return Object.keys(this.translations);
  }
}

window.i18n = new I18n();

document.addEventListener("DOMContentLoaded", () => {
  window.i18n.init("en");
});

window.t = (key, params) => window.i18n.t(key, params);
