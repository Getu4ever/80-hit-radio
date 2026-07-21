/**
 * Minimal service worker — enables installable PWA (Chrome/Edge/Android).
 * Network-only: the radio app is dynamic; we do not cache HTML or API responses.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
