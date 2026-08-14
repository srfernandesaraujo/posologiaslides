// Empacota palavras em espiral (mesma ideia do d3-cloud, sem a dependência):
// cada palavra tenta o centro do container e, se colidir com uma já
// posicionada, avança em espiral até achar um espaço livre. Sem isso, a
// única alternativa sem lib é o flex-wrap simples (nuvem "de verdade" precisa
// de posicionamento 2D com colisão, não flui em linhas).

const SPIRAL_ANGLE_STEP = 0.28;
const SPIRAL_RADIUS_STEP = 2.4;
// Alto o bastante pra espiral cobrir todo o raio do container (~sqrt(w²+h²)/2)
// antes de desistir — com um valor baixo, as primeiras palavras (maiores, perto
// do centro) "trancavam" o meio e tudo que vinha depois ficava de fora por
// falta de tentativas, não por falta de espaço de verdade.
const MAX_ATTEMPTS = 9000;

let measureCtx = null;
function getMeasureCtx() {
  if (!measureCtx) {
    measureCtx = document.createElement('canvas').getContext('2d');
  }
  return measureCtx;
}

function measureWord(word, fontSizePx, fontWeight) {
  const ctx = getMeasureCtx();
  ctx.font = `${fontWeight} ${fontSizePx}px "Manrope", "Inter", sans-serif`;
  return { width: ctx.measureText(word).width, height: fontSizePx * 1.15 };
}

function rectsOverlap(a, b, gap) {
  return !(
    a.x + a.width + gap < b.x ||
    b.x + b.width + gap < a.x ||
    a.y + a.height + gap < b.y ||
    b.y + b.height + gap < a.y
  );
}

// Hash simples e determinístico (mesma palavra sempre gira do mesmo jeito,
// mesmo recalculando o layout do zero a cada nova submissão) — evita usar
// Math.random(), que faria a nuvem inteira "pular" visualmente toda vez que
// a contagem de QUALQUER palavra mudasse, não só a nova.
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// Roda a espiral pra UM footprint (width/height já considerando rotação ou
// não) e devolve o retângulo livre, ou null se não achou em MAX_ATTEMPTS.
function tryPlaceRect(placed, containerWidth, containerHeight, gap, footprintWidth, footprintHeight) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const angle = SPIRAL_ANGLE_STEP * attempt;
    const radius = SPIRAL_RADIUS_STEP * Math.sqrt(attempt);
    // Espiral achatada (0.65 no eixo Y): a nuvem fica mais "faixa larga",
    // que aproveita melhor um container retangular do que um círculo perfeito.
    const cx = radius * Math.cos(angle);
    const cy = radius * Math.sin(angle) * 0.65;
    const rect = { x: cx - footprintWidth / 2, y: cy - footprintHeight / 2, width: footprintWidth, height: footprintHeight };

    if (Math.abs(rect.x + rect.width / 2) + rect.width / 2 > containerWidth / 2) continue;
    if (Math.abs(rect.y + rect.height / 2) + rect.height / 2 > containerHeight / 2) continue;
    if (placed.some((p) => rectsOverlap(rect, p, gap))) continue;

    return rect;
  }
  return null;
}

/**
 * @param {{word: string, count: number}[]} entries já ordenadas por contagem desc
 * @param {{width: number, height: number, minFontSize?: number, maxFontSize?: number, fontWeight?: number, gap?: number}} area
 * @returns {{word: string, count: number, x: number, y: number, width: number, height: number, fontSize: number, rotation: number}[]}
 *   x/y são o canto superior esquerdo do RETÂNGULO JÁ GIRADO, relativo ao
 *   CENTRO do container (podem ser negativos). width/height também já
 *   refletem a rotação (uma palavra girada 90° "deitada" vira alta/estreita).
 */
export function layoutWordCloud(entries, area) {
  if (typeof document === 'undefined' || entries.length === 0) return [];

  const {
    width, height,
    minFontSize = 11, maxFontSize = 44,
    fontWeight = 800,
    gap = 3
  } = area;

  const maxCount = entries[0].count;
  const minCount = entries[entries.length - 1].count;
  const placed = [];

  entries.forEach((entry) => {
    const ratio = maxCount === minCount ? 1 : (entry.count - minCount) / (maxCount - minCount);
    const idealFontSize = Math.round(minFontSize + ratio * (maxFontSize - minFontSize));

    // ~30% das palavras giram 90° — mesma ideia do d3-cloud: numa nuvem só
    // horizontal, palavras compridas obrigam muito espaço vazio ao redor;
    // misturar orientação aproveita cantos que ficariam ociosos.
    const preferRotate = hashString(entry.word) % 10 < 3;

    // Encolhe a fonte em passos até achar espaço livre, tentando as duas
    // orientações em cada tamanho antes de desistir. Sem isso, quando várias
    // palavras empatam na contagem (todas no maxFontSize — ex.: ninguém
    // repetiu nenhuma palavra ainda) uma frase comprida podia não caber de
    // jeito nenhum e sumia da nuvem; a palavra que o aluno enviou nunca
    // deveria simplesmente desaparecer, então ela cede tamanho antes disso.
    const step = Math.max(1, Math.round((idealFontSize - minFontSize) * 0.15));
    let rect = null;
    let fontSize = idealFontSize;
    let rotated = preferRotate;

    while (!rect && fontSize >= minFontSize) {
      const { width: textWidth, height: textHeight } = measureWord(entry.word, fontSize, fontWeight);

      rotated = preferRotate;
      rect = tryPlaceRect(placed, width, height, gap, preferRotate ? textHeight : textWidth, preferRotate ? textWidth : textHeight);

      if (!rect) {
        rotated = !preferRotate;
        rect = tryPlaceRect(placed, width, height, gap, preferRotate ? textWidth : textHeight, preferRotate ? textHeight : textWidth);
      }

      if (!rect) fontSize -= step;
    }

    if (rect) placed.push({ ...entry, x: rect.x, y: rect.y, width: rect.width, height: rect.height, fontSize, rotation: rotated ? 90 : 0 });
  });

  return placed;
}
