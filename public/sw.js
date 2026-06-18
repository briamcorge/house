// 自销毁 Service Worker：覆盖旧 PWA SW，然后把自己清除
self.addEventListener('install', () => {
  self.skipWaiting()
})
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.registration.unregister()
    const clients = await self.clients.matchAll()
    clients.forEach(c => c.navigate(c.url))
  })())
})
