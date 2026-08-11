// Service worker de cache de imagens — único objetivo: se o wifi da sala cair
// no meio de uma apresentação, as imagens dos slides continuam aparecendo em
// vez de sumir. Não intercepta NADA além de imagens (nem HTML, nem JS/CSS, nem
// chamadas de API): o app já tem histórico de bug de dados desatualizados
// (autosave/concorrência, ver memória do projeto), então este SW é
// propositalmente burro — cache-first só pra pedidos com destination
// 'image', tudo o resto passa direto pra rede como se ele nem existisse.
const IMAGE_CACHE_NAME = 'posologia-images-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== IMAGE_CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.destination !== 'image') return;

  event.respondWith(
    caches.open(IMAGE_CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;

      const response = await fetch(request);
      // Resposta opaca (cross-origin sem header CORS) ainda serve como <img
      // src> normalmente — só não cacheia erro explícito de mesma origem.
      if (response && (response.ok || response.type === 'opaque')) {
        cache.put(request, response.clone());
      }
      return response;
    })
  );
});
