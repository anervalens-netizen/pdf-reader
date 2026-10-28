/*
 * Service worker for the web / PWA build.
 *
 * The whole application is static, so the shell is precached and every other
 * same-origin request (the bundle, the PDF.js runtime assets, the icons) is
 * served cache-first and stored on first use. That makes the reader usable
 * offline once it has been opened at least once.
 */
const CACHE = 'pdf-shell-v1.0.3'
const SHELL = ['./', './index.html', './manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Navigations are network-first so users see updated releases promptly;
  // offline use still falls back to the cached application shell.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      // HTTP 5xx still resolves fetch(); use the cached shell on outages.
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const copy = response.clone()
      void caches.open(CACHE).then((cache) => cache.put(request, copy))
      return response
    }).catch(async () => (await caches.match(request)) ?? (await caches.match('./index.html')) ?? Response.error()))
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone()
            void caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(async () => {
          // Offline and not cached: fall back to the shell for navigations.
          if (request.mode === 'navigate') {
            const shell = await caches.match('./index.html')
            if (shell) return shell
          }
          return Response.error()
        })
    })
  )
})
