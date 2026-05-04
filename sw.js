const CACHE_NAME = "melech-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./about/index.html",
  "./manifest.json",
  "./src/style.css",
  "./src/styles/navbarMenu.css",
  "./src/styles/playlist.css",
  "./src/main.js",
  "./src/scripts/language.js",
  "./src/scripts/melechDB.js",
  "./src/scripts/melechPlayer.js",
  "./src/scripts/library.js",
  "./src/scripts/userLibrary.js",
  "./src/scripts/playlist.js",
  "./src/scripts/playlistShare.js",
  "./src/scripts/exportImport.js",
  "./src/scripts/toastNotifications.js",
  "./src/scripts/colorExtractor.js",
  "./src/scripts/faviconTheme.js",
  "./src/scripts/mediaSession.js",
  "./src/scripts/audioEngine.js",
  "./src/scripts/api/melech-api-client.js",
  "./src/scripts/api/official-api.js",
  "./src/scripts/api/sp-tp-api.js",
  "./src/scripts/api/service/jukehost.js",
  "./src/scripts/radio/radio.js",
  "./lib/tailwind.js",
  "./lib/jsmediatags.min.js",
  "./resources/MelechLogoWhite.svg",
  "./resources/MelechLogoBlack.svg",
  "./resources/MelechLogo.png",
  "./resources/MelechCover.png",
  "./resources/MelechBackground.mp4",
  "./resources/MelechBackgroundTemp.jpg",
  "./resources/JH-PartnerLogo.png",
  "./resources/192x192.png",
  "./resources/512x512.png",
  "./resources/fonts/Poppins-Regular.ttf",
  "./resources/fonts/ArchivoBlack-Regular.ttf",
  "./resources/icons/MaterialSymbolsRounded_Filled-Medium.ttf",
  "./language/en.json",
  "./language/tr.json",
  "./language/playlist-names/en.json",
  "./language/playlist-names/tr.json",
  "./radio-lib/radio-lib.json",
  "./radio-lib/data/images/RadioCover.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      );
    }),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200) {
            return response;
          }

          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });

          return response;
        })
        .catch(() => {
          if (request.mode === "navigate") {
            return caches.match("./index.html");
          }
        });
    }),
  );
});
