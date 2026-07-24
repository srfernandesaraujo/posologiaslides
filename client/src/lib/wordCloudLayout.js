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

/**
 * @param {{word: string, count: number}[]} entries já ordenadas por contagem desc
 * @param {{width: number, height: number, minFontSize?: number, maxFontSize?: number, fontWeight?: number, gap?: number}} area
 * @returns {{word: string, count: number, x: number, y: number, width: number, height: number, fontSize: number}[]}
 *   x/y são o canto superior esquerdo relativo ao CENTRO do container (podem ser negativos)
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
    const fontSize = Math.round(minFontSize + ratio * (maxFontSize - minFontSize));
    const { width: textWidth, height: textHeight } = measureWord(entry.word, fontSize, fontWeight);

    let placedRect = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const angle = SPIRAL_ANGLE_STEP * attempt;
      const radius = SPIRAL_RADIUS_STEP * Math.sqrt(attempt);
      // Espiral achatada (0.65 no eixo Y): a nuvem fica mais "faixa larga",
      // que aproveita melhor um container retangular do que um círculo perfeito.
      const cx = radius * Math.cos(angle);
      const cy = radius * Math.sin(angle) * 0.65;
      const rect = { x: cx - textWidth / 2, y: cy - textHeight / 2, width: textWidth, height: textHeight };

      if (Math.abs(rect.x + rect.width / 2) + rect.width / 2 > width / 2) continue;
      if (Math.abs(rect.y + rect.height / 2) + rect.height / 2 > height / 2) continue;
      if (placed.some((p) => rectsOverlap(rect, p, gap))) continue;

      placedRect = rect;
      break;
    }

    // Se não coube em nenhuma posição, a palavra fica de fora dessa rodada —
    // mesmo comportamento do d3-cloud (mais raro quanto menor MAX_WORDS_RENDERED
    // no chamador).
    if (placedRect) placed.push({ ...entry, ...placedRect, fontSize });
  });

  return placed;
}
