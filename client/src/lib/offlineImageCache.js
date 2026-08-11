// Cache de imagens pra apresentar sem depender do wifi continuar de pé —
// ver client/public/sw.js. A escrita acontece aqui, direto pela Cache
// Storage API (não pelo `fetch` do service worker): assim funciona mesmo se
// o SW ainda não tiver assumido controle da página logo após o registro. O
// service worker só faz a LEITURA (cache-first) quando o <img> real do slide
// pedir a imagem depois — os dois lados precisam usar o mesmo nome de cache.
const IMAGE_CACHE_NAME = 'posologia-images-v1';

const IMG_SRC_RE = /<img\b[^>]*\bsrc=["']([^"']+)["']/gi;
const CSS_URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;

function addIfFetchable(set, url) {
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return;
  set.add(url);
}

function extractImageUrls(slides) {
  const urls = new Set();
  (slides || []).forEach((slide) => {
    const html = slide?.html || '';
    IMG_SRC_RE.lastIndex = 0;
    let m;
    while ((m = IMG_SRC_RE.exec(html))) addIfFetchable(urls, m[1]);
    CSS_URL_RE.lastIndex = 0;
    while ((m = CSS_URL_RE.exec(html))) addIfFetchable(urls, m[2]);
  });
  return [...urls];
}

export function registerOfflineImageCache() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Chamado ao abrir uma apresentação (editor ou visualização pública) — sem
// isto, a primeira vez que cada imagem aparece continua exigindo rede,
// mesmo com o service worker instalado.
export async function primeOfflineImageCache(slides) {
  if (!('caches' in window) || !navigator.onLine) return;
  const urls = extractImageUrls(slides);
  if (urls.length === 0) return;
  try {
    const cache = await caches.open(IMAGE_CACHE_NAME);
    await Promise.all(urls.map(async (url) => {
      try {
        if (await cache.match(url)) return;
        const response = await fetch(url, { mode: 'no-cors' });
        await cache.put(url, response);
      } catch {
        // Sem sorte com esta imagem específica (ex.: URL já caiu, CORS
        // bloqueou mesmo em no-cors) — não trava as outras nem o resto do app.
      }
    }));
  } catch {
    // Cache Storage indisponível (ex.: aba anônima com storage bloqueado) —
    // degrada pro comportamento de sempre precisar de rede, sem quebrar nada.
  }
}
