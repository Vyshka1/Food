// Оффлайн-кэш: приложение целиком статическое, данные лежат в localStorage.
const CACHE = 'menu-nedelya-v1'

self.addEventListener('install', (event) => {
  // страницу кладём в кэш сразу: первую навигацию воркер ещё не видит
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request('index.html', { cache: 'reload' })))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

// страница присылает адреса своих ассетов — иначе их хеши воркеру неизвестны
self.addEventListener('message', (event) => {
  const data = event.data
  if (!data || data.type !== 'cache' || !Array.isArray(data.urls)) return
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        data.urls.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined)),
      ),
    ),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  if (new URL(request.url).origin !== self.location.origin) return

  // Страницу берём из сети, чтобы не залипать на старой версии, но офлайн отдаём из кэша
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put('index.html', copy))
          return response
        })
        .catch(() =>
          // ignoreVary: сервер может отдавать Vary: Origin, и тогда точное
          // совпадение запроса с сохранённым не находится
          caches.match('index.html', { ignoreVary: true }).then((r) => r ?? Response.error()),
        ),
    )
    return
  }

  // Ассеты собраны с хешем в имени — их можно смело отдавать из кэша
  event.respondWith(
    caches.match(request, { ignoreVary: true }).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
          return response
        }),
    ),
  )
})
