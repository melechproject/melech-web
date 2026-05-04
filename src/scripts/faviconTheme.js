document.addEventListener("DOMContentLoaded", () => {
  const themeMedia = window.matchMedia("(prefers-color-scheme: dark)");
  const handleTheme = (e) => {
    const isDark = e.matches;
    const suffix = isDark ? "White" : "Black";
    document
      .getElementById("favicon")
      ?.setAttribute("href", `resources/MelechLogo${suffix}.svg`);
    const logo = document.getElementById("navbarLogoVector");
    if (logo) logo.dataset.theme = isDark ? "dark" : "light";
  };
  handleTheme(themeMedia);
  themeMedia.addEventListener("change", handleTheme);
});
