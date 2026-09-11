const OFFLINE_URL = '/offline'
importScripts('/service-worker-push.js')

function createOfflineRequest() {
  return new Request(new URL(OFFLINE_URL, self.location.origin).href, { credentials: 'omit' })
}

self.addEventListener('install', event => {
  self.skipWaiting()
  if (!self.caches) return
  event.waitUntil(
    caches
      .open('voucha-offline-v1')
      .then(cache => cache.add(createOfflineRequest()))
      .catch(() => {}),
  )
})

self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(fetch(event.request).catch(offlineResponse))
})

function offlineResponse() {
  if (!self.caches)
    return new Response('Offline', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  return caches.match(OFFLINE_URL).then(
    response =>
      response ??
      new Response('Offline', {
        status: 503,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      }),
  )
}

function getSafeServiceWorkerUrl(rawUrl) {
  try {
    const url = new URL(rawUrl, self.location.origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.origin !== self.location.origin) return null
    return url.href
  } catch {
    return null
  }
}

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const safeUrl = getSafeServiceWorkerUrl(event.notification.data?.url || '/')
  if (!safeUrl) return
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients)
        if ('focus' in client) return client.navigate(safeUrl).then(() => client.focus())
      return self.clients.openWindow(safeUrl)
    }),
  )
})
