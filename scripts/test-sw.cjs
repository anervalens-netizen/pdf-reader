/* Regression for Codex P2: server 503 should load the previously cached
 * PWA shell rather than showing the service outage response. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

const listeners = new Map()
const url = 'https://pdf.local/'
const request = { url, method: 'GET', mode: 'navigate' }
const cache = new Map([[url, new Response('cached-pdf-shell', { status: 200 })]])
const context = {
  self: {
    location: { origin: url.slice(0, -1) },
    addEventListener: (name, callback) => listeners.set(name, callback),
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() }
  },
  URL, Response, Promise, Error,
  caches: {
    match: async (key) => cache.get(typeof key === 'string' ? new URL(key, url).href : key.url),
    open: async () => ({
      addAll: async () => {},
      put: async (key, value) => {
        cache.set(typeof key === 'string' ? new URL(key, url).href : key.url, value)
      }
    }),
    keys: async () => ['pdf-shell-v1.0.3'],
    delete: async () => true
  },
  fetch: async () => new Response('server-error', { status: 503 })
}
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '../src/renderer/public/sw.js'), 'utf8'),
  context
)
let handled
listeners.get('fetch')({ request, respondWith: (promise) => { handled = promise } })
if (!handled) throw new Error('service worker did not respond')
handled.then(async (response) => {
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'cached-pdf-shell')
  console.log('OK — PWA cached shell served on HTTP 503')
}).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
