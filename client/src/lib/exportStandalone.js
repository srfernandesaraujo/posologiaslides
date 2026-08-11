import { buildSpotlightScript, buildZoomGestureScript, buildAnimationTriggerScript } from '../components/PresentationViewer';
import { extractImageUrls } from './offlineImageCache';
import { slugify } from './exportDeck';
import { SLIDE_NATIVE_WIDTH, SLIDE_NATIVE_HEIGHT, STAGE_BOTTOM_RESERVE } from './canvasConstants';
import { resolveTransition } from './transitionCatalog';

// Exporta a apresentação como UM ÚNICO arquivo .html que roda sozinho no
// navegador (sem backend, sem internet, direto de file://) — ao contrário do
// PDF/PPTX (ver exportDeck.js), aqui o slide continua sendo HTML/CSS/JS de
// verdade (gráficos Chart.js/Mermaid interativos, animações, zoom/holofote),
// não uma imagem "print". A técnica reaproveita a mesma montagem de documento
// que PresentationViewer.jsx usa pro srcdoc de cada slide (ver
// buildSpotlightScript/buildZoomGestureScript/buildAnimationTriggerScript,
// exportados de lá pra cá) — cada slide vira o mesmo tipo de documento
// autocontido que já roda hoje dentro do iframe, só que com TUDO embutido em
// vez de referenciado por URL/path relativo:
//   - imagens: baixadas e convertidas pra data: URI (ver buildImageDataUriMap)
//   - Google Fonts: CSS + arquivos de fonte baixados e embutidos como base64
//   - Chart.js/Mermaid: texto do bundle vendor embutido como <script> inline
//     em vez de <script src="/vendor/...">
//
// DELIBERADAMENTE FORA DE ESCOPO (confirmado com o usuário): tudo que depende
// de alunos conectados ao vivo via socket.io/backend — quiz/nuvem de
// palavras/TBL/hotspot com respostas agregadas da turma, QR code de entrada,
// controle remoto por celular, votação de árvore de decisão. Esses widgets
// são um OVERLAY renderizado pelo app por cima do slide (ver
// ActiveMethodologiesOverlay.jsx), nunca fazem parte do HTML do próprio
// slide — então simplesmente não existem no export standalone; o slide em si
// (texto, imagem, gráfico, diagrama, embed) aparece normalmente.
const GOOGLE_FONTS_CSS_URL = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Geist:wght@300;400;500;600;700;800&family=Poppins:wght@300;400;500;600;700;800&family=Merriweather:wght@300;400;700;900&family=JetBrains+Mono:wght@400;500;600&display=swap";

const FETCH_CONCURRENCY = 6; // baixar tudo de uma vez trava a aba num deck grande; sequencial é lento demais
const FETCH_TIMEOUT_MS = 20000; // uma URL de imagem/fonte travada (sem erro, sem resposta) não pode segurar o export inteiro pra sempre

function blobToDataUri(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler arquivo'));
    reader.readAsDataURL(blob);
  });
}

async function urlToDataUri(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await blobToDataUri(await res.blob());
  } finally {
    clearTimeout(timeout);
  }
}

// Roda `worker` sobre `items` com no máximo `limit` chamadas simultâneas —
// cada worker resolve seu próprio item de forma independente, então rodar em
// paralelo (em vez de sequencial, ver exportDeck.js que é sequencial de
// propósito por outro motivo) não tem risco de corrida real aqui.
async function mapWithConcurrency(items, limit, worker) {
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}

// Baixa cada imagem referenciada (mesma extração usada pelo cache offline,
// ver offlineImageCache.js) e devolve um mapa url -> data:URI. Uma imagem que
// falhar (host sem CORS liberado, link quebrado — mesmo problema já
// documentado em exportDeck.js sobre canvas tainted) fica de fora do mapa: o
// slide mantém a URL original, que ainda funciona se houver internet na hora
// de abrir o arquivo exportado, só não fica 100% offline pra ELA especificamente.
async function buildImageDataUriMap(slides, onProgress) {
  const urls = extractImageUrls(slides);
  const map = new Map();
  const failed = [];
  let done = 0;
  await mapWithConcurrency(urls, FETCH_CONCURRENCY, async (url) => {
    try {
      map.set(url, await urlToDataUri(url));
    } catch (err) {
      console.error(`Falha ao baixar imagem para embutir no export: ${url}`, err);
      failed.push(url);
    } finally {
      done++;
      onProgress?.(done, urls.length);
    }
  });
  return { map, failed };
}

function inlineImagesInHtml(html, imageMap) {
  let result = html || '';
  imageMap.forEach((dataUri, url) => {
    result = result.split(url).join(dataUri);
  });
  return result;
}

// Baixa o CSS do Google Fonts (mesmo @import de PresentationViewer.jsx) e
// embute cada arquivo de fonte referenciado como base64 dentro do próprio
// CSS (troca os url(...) por data:URI) — sem isto, o export só teria fontes
// customizadas com internet disponível na hora de abrir. Falha aqui não
// quebra o export inteiro: o navegador só cai pra fonte do sistema.
async function buildInlineFontsCss() {
  try {
    const cssText = await fetchTextWithTimeout(GOOGLE_FONTS_CSS_URL);
    const fontUrls = [...new Set([...cssText.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1].replace(/["']/g, '')))];
    let result = cssText;
    await mapWithConcurrency(fontUrls, FETCH_CONCURRENCY, async (url) => {
      try {
        const dataUri = await urlToDataUri(url);
        result = result.split(url).join(dataUri);
      } catch (err) {
        console.error(`Falha ao embutir fonte no export: ${url}`, err);
      }
    });
    return result;
  } catch (err) {
    console.error('Falha ao baixar Google Fonts para o export — arquivo final usará fontes do sistema.', err);
    return '';
  }
}

async function fetchTextWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchVendorScriptText(path) {
  try {
    return await fetchTextWithTimeout(path);
  } catch (err) {
    console.error(`Falha ao baixar script vendor para o export: ${path}`, err);
    return '';
  }
}

// Mesmo bloco de estilo base que PresentationViewer.jsx injeta no srcdoc de
// cada slide (scrollbar fina, overflow, data-scrollable) — copiado (não
// importado) de propósito: extrair isso do componente ao vivo arriscaria
// regressão numa área já sofrida (ver memória sobre bug de autosave/perda de
// slide), e é pouca coisa pra duplicar.
function baseSlideStyles() {
  return `
  html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
  body { margin: 0; padding: 0; width: 100%; height: 100%; overflow-y: auto; overflow-x: hidden; font-family: 'Plus Jakarta Sans', sans-serif; background: #090d16; }
  * { box-sizing: border-box; }
  body::-webkit-scrollbar { width: 8px; }
  body::-webkit-scrollbar-track { background: transparent; }
  body::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.35); border-radius: 999px; }
  body::-webkit-scrollbar-thumb:hover { background: rgba(148,163,184,0.55); }
  body { scrollbar-width: thin; scrollbar-color: rgba(148,163,184,0.35) transparent; }
  .slide-root[data-scrollable="true"], body[data-scrollable="true"] { overflow-y: auto !important; max-height: 100% !important; }
  .slide-root[data-scrollable="true"]::-webkit-scrollbar, body[data-scrollable="true"]::-webkit-scrollbar { width: 8px !important; }
  .slide-root[data-scrollable="true"]::-webkit-scrollbar-track, body[data-scrollable="true"]::-webkit-scrollbar-track { background: rgba(0,0,0,0.2) !important; }
  .slide-root[data-scrollable="true"]::-webkit-scrollbar-thumb, body[data-scrollable="true"]::-webkit-scrollbar-thumb { background: rgba(56,189,248,0.6) !important; border-radius: 999px !important; }
  @keyframes pos-fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes pos-fade-in-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes pos-fade-in-down { from { opacity: 0; transform: translateY(-16px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes pos-slide-in-left { from { opacity: 0; transform: translateX(-40px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes pos-slide-in-right { from { opacity: 0; transform: translateX(40px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes pos-scale-in { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
  @keyframes pos-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
  @keyframes pos-shake { 10%, 90% { transform: translateX(-1px); } 20%, 80% { transform: translateX(2px); } 30%, 50%, 70% { transform: translateX(-4px); } 40%, 60% { transform: translateX(4px); } }
  @keyframes pos-flash { 0%, 50%, 100% { opacity: 1; } 25%, 75% { opacity: 0.25; } }
  @keyframes pos-bounce { 0%, 100% { transform: translateY(0); } 30% { transform: translateY(-14px); } 50% { transform: translateY(0); } 70% { transform: translateY(-6px); } }
  @keyframes pos-fade-out { from { opacity: 1; } to { opacity: 0; } }
  @keyframes pos-fade-out-up { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-16px); } }
  @keyframes pos-fade-out-down { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(16px); } }
  @keyframes pos-slide-out-left { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(-40px); } }
  @keyframes pos-slide-out-right { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(40px); } }
  @keyframes pos-scale-out { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.85); } }
`;
}

// Repassa setas do teclado pro documento pai quando o foco está dentro do
// iframe do slide (acontece depois de qualquer clique num elemento
// interativo do slide) — mesmo problema/solução documentado em
// buildEditorScript de PresentationViewer.jsx, mas esse script só roda em
// modo edição; o standalone precisa da própria versão, sempre ativa.
function buildNavRelayScript() {
  return `
<script>
(function () {
  document.addEventListener('keydown', function (e) {
    if (e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    var direction = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'PageDown') direction = 'next';
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') direction = 'prev';
    if (!direction) return;
    window.parent.postMessage({ source: 'posologia-standalone', type: 'nav-key', direction: direction }, '*');
  });
})();
</script>`;
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Mesmas 8 transições de client/src/lib/transitionCatalog.js + estilo do
// palco/barra flutuante de client/src/styles/index.css — copiados (não
// importados: são regras CSS, não JS) pra o export ficar 100% autocontido,
// sem depender do bundle de estilos do app.
function buildShellStyles() {
  return `
:root {
  --pos-accent: #22d3ee;
  --pos-accent-strong: #06b6d4;
  --pos-accent-glow: rgba(34, 211, 238, 0.35);
  --pos-text-main: #f9fafb;
  --pos-text-muted: #9ca3af;
  --pos-border: rgba(255,255,255,0.16);
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; height: 100%; background: #05070d; font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; }
body { display: flex; flex-direction: column; }
.pos-header { padding: 0.85rem 1.25rem; color: var(--pos-text-main); font-weight: 700; font-size: 0.95rem; border-bottom: 1px solid var(--pos-border); flex-shrink: 0; }
.pos-stage-container { flex: 1; display: flex; align-items: center; justify-content: center; padding: 1.5rem; overflow: hidden; background: radial-gradient(circle at center, #111827 0%, #080c14 100%); }
.pos-stage { position: relative; width: 100%; max-width: 1400px; aspect-ratio: 16/9; border-radius: 1rem; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.6); border: 1px solid var(--pos-border); }
.pos-stage.pos-fullscreen-stage {
  position: fixed !important; top: 50% !important; left: 50% !important; transform: translate(-50%, -50%) !important;
  width: min(100vw, calc(100vh * 16 / 9)) !important;
  height: min(100vh, calc(100vw * 9 / 16)) !important;
  max-width: none !important; border-radius: 0 !important; border: none !important; z-index: 9999;
}
.pos-canvas { position: absolute; top: 0; left: 0; width: ${SLIDE_NATIVE_WIDTH}px; height: ${SLIDE_NATIVE_HEIGHT}px; transform-origin: top left; }
.pos-transition-wrapper { position: absolute; inset: 0; --pos-transition-duration: 0.6s; }
.pos-frame { width: 100%; height: 100%; border: none; display: block; background: #090d16; }

.pos-transition-fade { animation: pos-transition-fade var(--pos-transition-duration) ease both; }
.pos-transition-slide-right { animation: pos-transition-slide-right var(--pos-transition-duration) cubic-bezier(0.22, 1, 0.36, 1) both; }
.pos-transition-slide-left { animation: pos-transition-slide-left var(--pos-transition-duration) cubic-bezier(0.22, 1, 0.36, 1) both; }
.pos-transition-slide-up { animation: pos-transition-slide-up var(--pos-transition-duration) cubic-bezier(0.22, 1, 0.36, 1) both; }
.pos-transition-zoom-in { animation: pos-transition-zoom-in var(--pos-transition-duration) ease both; }
.pos-transition-zoom-out { animation: pos-transition-zoom-out var(--pos-transition-duration) ease both; }
.pos-transition-wipe { animation: pos-transition-wipe var(--pos-transition-duration) cubic-bezier(0.65, 0, 0.35, 1) both; }
.pos-transition-wipe::after {
  content: ''; position: absolute; top: 0; bottom: 0; width: 3px;
  background: linear-gradient(180deg, transparent, #22d3ee, #34d399, transparent);
  box-shadow: 0 0 20px 4px rgba(34, 211, 238, 0.55); pointer-events: none;
  animation: pos-transition-wipe-edge var(--pos-transition-duration) cubic-bezier(0.65, 0, 0.35, 1) both;
}
@keyframes pos-transition-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes pos-transition-slide-right { from { opacity: 0; transform: translateX(64px); } to { opacity: 1; transform: translateX(0); } }
@keyframes pos-transition-slide-left { from { opacity: 0; transform: translateX(-64px); } to { opacity: 1; transform: translateX(0); } }
@keyframes pos-transition-slide-up { from { opacity: 0; transform: translateY(56px); } to { opacity: 1; transform: translateY(0); } }
@keyframes pos-transition-zoom-in { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
@keyframes pos-transition-zoom-out { from { opacity: 0; transform: scale(1.12); } to { opacity: 1; transform: scale(1); } }
@keyframes pos-transition-wipe { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes pos-transition-wipe-edge { from { left: 0%; opacity: 1; } to { left: 100%; opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .pos-transition-wrapper, .pos-transition-wrapper::after { animation: none !important; }
}

.pos-toolbar { position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 1.2rem; background: rgba(15,23,42,0.85); backdrop-filter: blur(20px); border: 1px solid var(--pos-border); border-radius: 2rem; box-shadow: 0 8px 24px rgba(0,0,0,0.4); z-index: 10; transition: opacity 0.3s ease; }
.pos-toolbar.pos-autohide { opacity: 0.15; }
.pos-toolbar.pos-autohide:hover { opacity: 1; }
.pos-btn { background: transparent; border: none; color: var(--pos-text-muted); width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 1.15rem; line-height: 1; transition: all 0.2s ease; }
.pos-btn:hover { color: var(--pos-text-main); background: rgba(255,255,255,0.1); }
.pos-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.pos-counter { font-size: 0.85rem; font-weight: 700; padding: 0 0.5rem; color: var(--pos-text-muted); white-space: nowrap; }
.pos-sep { width: 1px; height: 24px; background: rgba(255,255,255,0.15); margin: 0 0.2rem; }
`;
}

// Runtime vanilla (sem React/bundler) que troca de slide, escala o palco pro
// tamanho da janela (mesma matemática de useCanvasFit.js) e trata teclado/
// tela cheia/pinça de zoom — tudo que já roda ao vivo no app, reimplementado
// sem dependências porque o arquivo final não carrega nenhum bundle.
//
// `dataJsonLiteral` carrega fontes/Chart.js/Mermaid/scripts de comportamento
// (spotlight, zoom, animação, relay de teclado) e os estilos base UMA VEZ SÓ
// (DATA.*) — cada slide guarda só o próprio conteúdo (`content`) já com as
// imagens embutidas. `buildSlideDoc` (abaixo, dentro do runtime) MONTA o
// documento completo do iframe em tempo real, a cada troca de slide, a partir
// desses pedaços compartilhados. Isto é o oposto de pré-montar um documento
// completo por slide no momento do export: um deck de 20 slides com fontes
// (várias MB em base64) e Chart.js embutidos em CADA slide inflava o arquivo
// pra centenas de MB — pesado o bastante pra travar o download ou o
// navegador ao abrir (reportado pelo usuário como "só baixou o primeiro
// slide"). Montar sob demanda custa uma remontagem de string barata a cada
// troca de slide, em troca de um arquivo ordens de magnitude menor.
function buildShellScript(dataJsonLiteral) {
  return `
const DATA = ${dataJsonLiteral};
const SLIDES = DATA.slides;

function buildSlideDoc(slide) {
  var vendor = '<scr' + 'ipt>' + DATA.chartJs + '</scr' + 'ipt>' + (slide.needsMermaid ? ('<scr' + 'ipt>' + DATA.mermaidJs + '</scr' + 'ipt>') : '');
  return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8" /><style>' + DATA.fontsCss + DATA.baseStyles + '</style>' + vendor + '</head><body>' + slide.content + DATA.behaviorScripts + '</body></html>';
}

(function () {
  var idx = 0;
  var zoomFactor = 1;
  var frame = document.getElementById('pos-frame');
  var transitionEl = document.getElementById('pos-transition');
  var canvas = document.getElementById('pos-canvas');
  var stage = document.getElementById('pos-stage');
  var toolbar = document.getElementById('pos-toolbar');
  var header = document.getElementById('pos-header');
  var counter = document.getElementById('pos-counter');
  var prevBtn = document.getElementById('pos-prev');
  var nextBtn = document.getElementById('pos-next');
  var fsBtn = document.getElementById('pos-fullscreen');

  var NATIVE_W = ${SLIDE_NATIVE_WIDTH};
  var NATIVE_H = ${SLIDE_NATIVE_HEIGHT};
  var BOTTOM_RESERVE = ${STAGE_BOTTOM_RESERVE};

  function updateScale() {
    var availableH = Math.max(0, stage.clientHeight - BOTTOM_RESERVE);
    var fit = Math.min(stage.clientWidth / NATIVE_W, availableH / NATIVE_H);
    canvas.style.transform = 'scale(' + (fit * zoomFactor) + ')';
  }

  function render() {
    var slide = SLIDES[idx];
    frame.srcdoc = buildSlideDoc(slide);
    transitionEl.className = 'pos-transition-wrapper pos-transition-' + slide.transition.type;
    transitionEl.style.setProperty('--pos-transition-duration', slide.transition.duration + 's');
    void transitionEl.offsetWidth; // força reflow: reinicia a animação de transição a cada troca
    counter.textContent = (idx + 1) + ' / ' + SLIDES.length;
    prevBtn.disabled = idx <= 0;
    nextBtn.disabled = idx >= SLIDES.length - 1;
    document.title = (slide.title ? slide.title + ' — ' : '') + document.title.split(' — ').pop();
  }

  function goPrev() { if (idx > 0) { idx--; zoomFactor = 1; render(); } }
  function goNext() { if (idx < SLIDES.length - 1) { idx++; zoomFactor = 1; render(); } }

  prevBtn.addEventListener('click', goPrev);
  nextBtn.addEventListener('click', goNext);

  document.addEventListener('keydown', function (e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); goNext(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); goPrev(); }
    else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFullscreen(); }
  });

  window.addEventListener('message', function (e) {
    var data = e.data;
    if (!data) return;
    if (data.type === 'nav-key') {
      if (data.direction === 'next') goNext(); else if (data.direction === 'prev') goPrev();
    } else if (data.type === 'zoom-gesture' && typeof data.factor === 'number') {
      zoomFactor = Math.min(3, Math.max(1, zoomFactor * data.factor));
      updateScale();
    }
  });

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      stage.requestFullscreen().catch(function () {});
    } else {
      document.exitFullscreen().catch(function () {});
    }
  }
  fsBtn.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', function () {
    var isFs = !!document.fullscreenElement;
    stage.classList.toggle('pos-fullscreen-stage', isFs);
    if (header) header.style.display = isFs ? 'none' : '';
    updateScale();
  });

  var autohideTimer;
  window.addEventListener('mousemove', function () {
    toolbar.classList.remove('pos-autohide');
    clearTimeout(autohideTimer);
    if (document.fullscreenElement) autohideTimer = setTimeout(function () { toolbar.classList.add('pos-autohide'); }, 3500);
  });

  if (window.ResizeObserver) {
    new ResizeObserver(updateScale).observe(stage);
  }
  window.addEventListener('resize', updateScale);

  render();
  updateScale();
})();
`;
}

function buildShellHtml(title, data) {
  const safeTitle = escapeHtml(title || 'Apresentação');
  // \\u003c em vez de "<": o conteúdo de cada slide (e os próprios
  // Chart.js/Mermaid embutidos) contém <script> de verdade — sem escapar, o
  // parser HTML encontraria um "</script" literal DENTRO do JSON e cortaria a
  // tag <script> do shell no meio, corrompendo o arquivo inteiro. \\u003c
  // decodifica de volta pra "<" quando o JS do shell é interpretado, então o
  // conteúdo final não muda.
  const dataJsonLiteral = JSON.stringify(data).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${safeTitle}</title>
<style>${buildShellStyles()}</style>
</head>
<body>
<div id="pos-header" class="pos-header"><span>${safeTitle}</span></div>
<div class="pos-stage-container">
  <div id="pos-stage" class="pos-stage">
    <div id="pos-canvas" class="pos-canvas">
      <div id="pos-transition" class="pos-transition-wrapper">
        <iframe id="pos-frame" class="pos-frame" title="slide" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
      </div>
    </div>
    <div id="pos-toolbar" class="pos-toolbar">
      <button id="pos-prev" class="pos-btn" title="Slide anterior (seta esquerda)">&#8249;</button>
      <span id="pos-counter" class="pos-counter"></span>
      <button id="pos-next" class="pos-btn" title="Próximo slide (seta direita / espaço)">&#8250;</button>
      <div class="pos-sep"></div>
      <button id="pos-fullscreen" class="pos-btn" title="Tela cheia (F)">&#9974;</button>
    </div>
  </div>
</div>
<script>${buildShellScript(dataJsonLiteral)}</script>
</body>
</html>`;
}

export function downloadHtmlFile(htmlString, filename) {
  const blob = new Blob([htmlString], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Monta o HTML standalone completo. `onProgress({ phase, current, total })`
// é chamado em cada fase (`images` -> `fonts` -> `slides`) pra o modal de
// export mostrar o que está acontecendo — um deck com muitas imagens em alta
// resolução pode levar bem mais tempo que gerar o PDF/PPTX, já que tudo é
// baixado de novo e reconvertido pra base64 (ver comentário no topo do
// arquivo sobre por que não dá pra reaproveitar nenhum cache existente).
// Retorna `{ html, failedImageUrls }` (não só a string) — ver comentário
// junto do `return` mais abaixo sobre por que essa lista importa.
export async function buildStandaloneHtml(presentation, { onProgress } = {}) {
  const visibleSlides = (presentation.slides || []).filter((s) => !s.hidden);

  const { map: imageMap, failed: failedImageUrls } = await buildImageDataUriMap(visibleSlides, (current, total) => {
    onProgress?.({ phase: 'images', current, total });
  });

  onProgress?.({ phase: 'fonts', current: 0, total: 1 });
  const fontsCss = await buildInlineFontsCss();
  onProgress?.({ phase: 'fonts', current: 1, total: 1 });

  onProgress?.({ phase: 'scripts', current: 0, total: 1 });
  const chartJsText = await fetchVendorScriptText('/vendor/chart.umd.min.js');
  const needsMermaidGlobal = visibleSlides.some((s) => /mermaid/i.test(s.html || ''));
  const mermaidJsText = needsMermaidGlobal ? await fetchVendorScriptText('/vendor/mermaid.min.js') : '';
  onProgress?.({ phase: 'scripts', current: 1, total: 1 });

  // Só o CONTEÚDO de cada slide é por-slide — fontes, Chart.js/Mermaid,
  // estilos base e os scripts de comportamento (spotlight/zoom/animação/
  // relay de teclado) vão UMA VEZ no objeto DATA embutido no shell (ver
  // buildShellScript) e são reaproveitados por todos os slides em tempo real,
  // em vez de duplicados em cada um — ver comentário em buildShellScript
  // sobre o inchaço de arquivo (e a falha real) que essa duplicação causava.
  const slidesPayload = visibleSlides.map((slide, i) => {
    onProgress?.({ phase: 'slides', current: i + 1, total: visibleSlides.length });
    const content = inlineImagesInHtml(slide.html, imageMap);
    return {
      id: slide.id,
      title: slide.title || '',
      content,
      needsMermaid: /mermaid/i.test(content),
      transition: resolveTransition(slide.transition)
    };
  });

  const behaviorScripts = buildSpotlightScript(true) + buildZoomGestureScript(true) + buildAnimationTriggerScript(true) + buildNavRelayScript();

  const html = buildShellHtml(presentation.title, {
    fontsCss,
    chartJs: chartJsText,
    mermaidJs: mermaidJsText,
    baseStyles: baseSlideStyles(),
    behaviorScripts,
    slides: slidesPayload
  });

  // `failedImageUrls`: imagens que o fetch() não conseguiu baixar (ex.: bucket
  // sem CORS liberado pra leitura via JS, link quebrado) — o slide mantém a
  // URL remota original (ver inlineImagesInHtml/comentário no topo do
  // arquivo), então o arquivo final SÓ é realmente "sem depender de
  // internet" se esta lista vier vazia. O chamador (ExportModal) decide como
  // avisar o usuário; aqui só reportamos o fato.
  return { html, failedImageUrls };
}

export function standaloneHtmlFileName(presentationTitle) {
  return `${slugify(presentationTitle)}.html`;
}
