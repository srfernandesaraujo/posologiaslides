function buildColumns(config = {}) {
  const raw = (config.content ||
    'Coluna 1: descreva o primeiro ponto aqui.\n---\nColuna 2: descreva o segundo ponto aqui.\n---\nColuna 3: descreva o terceiro ponto aqui.'
  ).trim();
  const chunks = raw.split(/\n?---\n?/).map((c) => c.trim()).filter(Boolean);
  const cols = Math.max(2, Math.min(6, chunks.length || 2));
  const colHtml = chunks.map((c) =>
    `<div style="color:#e2e8f0;font-size:0.95rem;line-height:1.6;">${c.replace(/\n/g, '<br/>')}</div>`
  ).join('');
  return `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:1.5rem;margin:1.5rem 0;">${colHtml}</div>`;
}

function parseTitleTextPairs(raw, fallback) {
  return (raw || fallback).split('\n')
    .map((line) => {
      const [title, text] = line.split('|').map((s) => (s || '').trim());
      return { title, text };
    })
    .filter((item) => item.title);
}

const BOX_FALLBACK = 'Primeiro ponto | Breve explicação do primeiro ponto.\nSegundo ponto | Breve explicação do segundo ponto.\nTerceiro ponto | Breve explicação do terceiro ponto.';

function buildBoxes(variant) {
  const variantStyle = {
    solid: { radius: '0.75rem', box: 'background:rgba(34,211,238,0.08);border:1px solid rgba(34,211,238,0.18);' },
    outline: { radius: '0.75rem', box: 'background:transparent;border:1.5px solid rgba(255,255,255,0.18);' },
    side: { radius: '0.4rem', box: 'background:rgba(255,255,255,0.03);border:none;border-left:3px solid #22d3ee;' }
  }[variant];

  return (config = {}) => {
    const items = parseTitleTextPairs(config.items, BOX_FALLBACK);
    const cols = Math.min(3, Math.max(1, items.length));
    const cardsHtml = items.map((item) => `
      <div style="padding:1.1rem 1.25rem;border-radius:${variantStyle.radius};${variantStyle.box}">
        <div style="font-weight:700;color:#fff;font-size:0.98rem;margin-bottom:0.4rem;">${item.title}</div>
        <div style="color:#9ca3af;font-size:0.85rem;line-height:1.5;">${item.text || ''}</div>
      </div>`).join('');
    return `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:1rem;margin:1.5rem 0;">${cardsHtml}</div>`;
  };
}

function parseLines(raw, fallback) {
  return (raw || fallback).split('\n').map((s) => s.trim()).filter(Boolean);
}

const MARKER_FALLBACK = 'Primeiro ponto\nSegundo ponto\nTerceiro ponto';

function buildLargeMarkers(config = {}) {
  const items = parseLines(config.items, MARKER_FALLBACK);
  const rows = items.map((text, i) => `
    <div style="display:flex;align-items:flex-start;gap:1rem;margin:1rem 0;">
      <div style="flex-shrink:0;width:2.4rem;height:2.4rem;border-radius:50%;background:rgba(34,211,238,0.12);border:1px solid rgba(34,211,238,0.3);display:flex;align-items:center;justify-content:center;color:#67e8f9;font-weight:800;font-size:1.05rem;">${i + 1}</div>
      <div style="color:#e2e8f0;font-size:1.05rem;line-height:1.5;padding-top:0.3rem;">${text}</div>
    </div>`).join('');
  return `<div>${rows}</div>`;
}

function buildSmallMarkers(config = {}) {
  const items = parseLines(config.items, MARKER_FALLBACK);
  const li = items.map((text) => `<li style="margin:0.35rem 0;color:#cbd5e1;font-size:0.88rem;line-height:1.4;">${text}</li>`).join('');
  return `<ul style="list-style:disc;padding-left:1.2rem;margin:0.75rem 0;">${li}</ul>`;
}

function buildArrowMarkers(config = {}) {
  const items = parseLines(config.items, MARKER_FALLBACK);
  const li = items.map((text) =>
    `<li style="display:flex;gap:0.6rem;align-items:flex-start;margin:0.55rem 0;color:#e2e8f0;font-size:0.98rem;line-height:1.4;"><span style="color:#22d3ee;font-weight:800;flex-shrink:0;">→</span><span>${text}</span></li>`
  ).join('');
  return `<ul style="list-style:none;padding-left:0;margin:1rem 0;">${li}</ul>`;
}

export const LAYOUT_CATALOG = [
  {
    id: 'columns',
    title: 'Colunas',
    description: 'De 2 a 6 colunas — separe o conteúdo de cada uma com uma linha "---".',
    iconName: 'Columns3',
    configFields: [
      {
        key: 'content',
        label: 'Conteúdo — separe cada coluna com uma linha "---"',
        type: 'textarea',
        default: 'Coluna 1: descreva o primeiro ponto aqui.\n---\nColuna 2: descreva o segundo ponto aqui.\n---\nColuna 3: descreva o terceiro ponto aqui.'
      }
    ],
    buildHtml: buildColumns
  },
  {
    id: 'boxes-solid',
    title: 'Caixas Sólidas',
    description: 'Cartões com fundo colorido — título e texto por item.',
    iconName: 'LayoutGrid',
    configFields: [{ key: 'items', label: 'Itens — "Título | Texto" por linha', type: 'textarea', default: BOX_FALLBACK }],
    buildHtml: buildBoxes('solid')
  },
  {
    id: 'boxes-outline',
    title: 'Caixas com Contorno',
    description: 'Cartões com apenas uma borda, sem preenchimento.',
    iconName: 'LayoutGrid',
    configFields: [{ key: 'items', label: 'Itens — "Título | Texto" por linha', type: 'textarea', default: BOX_FALLBACK }],
    buildHtml: buildBoxes('outline')
  },
  {
    id: 'boxes-side-line',
    title: 'Caixas com Linha Lateral',
    description: 'Itens com uma faixa colorida na lateral esquerda.',
    iconName: 'PanelLeft',
    configFields: [{ key: 'items', label: 'Itens — "Título | Texto" por linha', type: 'textarea', default: BOX_FALLBACK }],
    buildHtml: buildBoxes('side')
  },
  {
    id: 'markers-large',
    title: 'Marcadores Grandes',
    description: 'Itens numerados em círculo, espaçados — bom pra poucos pontos-chave.',
    iconName: 'CircleDot',
    configFields: [{ key: 'items', label: 'Itens — um por linha', type: 'textarea', default: MARKER_FALLBACK }],
    buildHtml: buildLargeMarkers
  },
  {
    id: 'markers-small',
    title: 'Marcadores Pequenos',
    description: 'Lista compacta de marcadores.',
    iconName: 'List',
    configFields: [{ key: 'items', label: 'Itens — um por linha', type: 'textarea', default: MARKER_FALLBACK }],
    buildHtml: buildSmallMarkers
  },
  {
    id: 'markers-arrow',
    title: 'Marcadores de Seta',
    description: 'Lista com seta no lugar do marcador.',
    iconName: 'ArrowRight',
    configFields: [{ key: 'items', label: 'Itens — um por linha', type: 'textarea', default: MARKER_FALLBACK }],
    buildHtml: buildArrowMarkers
  }
];
