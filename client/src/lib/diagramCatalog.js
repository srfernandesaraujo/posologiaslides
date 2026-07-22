import { uniqueId } from './slideHtmlUtils.js';

const PALETTE = ['#22d3ee', '#a78bfa', '#34d399', '#fbbf24', '#f472b6', '#60a5fa', '#fb7185', '#4ade80'];

function parseLines(raw, fallback) {
  return (raw || fallback).split('\n').map((s) => s.trim()).filter(Boolean);
}

function parseRows(raw) {
  return raw.trim().split('\n').map((line) => line.split(',').map((c) => c.trim())).filter((r) => r.length && r.some((c) => c !== ''));
}

// ---------------------------------------------------------------------------
// Construtor de Gráfico (Chart.js — já vendorizado e injetado no iframe do slide)
// ---------------------------------------------------------------------------

const CHART_JS_TYPE = { line: 'line', area: 'line', bar: 'bar', horizontalBar: 'bar', pie: 'pie', doughnut: 'doughnut', radar: 'radar', scatter: 'scatter', bubble: 'bubble' };

function buildChart(config = {}) {
  const uid = uniqueId('chart');
  const type = config.type || 'bar';
  const title = (config.title || '').trim();
  const rawData = (config.data || 'Fármaco, Eficácia (%), Efeitos Adversos (%)\nA, 78, 12\nB, 65, 8\nC, 88, 20').trim();

  let chartData;
  if (type === 'scatter' || type === 'bubble') {
    const rows = parseRows(rawData).map((r) => r.map(Number));
    const points = rows.map((r) => (type === 'bubble' ? { x: r[0] || 0, y: r[1] || 0, r: r[2] || 6 } : { x: r[0] || 0, y: r[1] || 0 }));
    chartData = { datasets: [{ label: title || 'Série', data: points, backgroundColor: `${PALETTE[0]}AA`, borderColor: PALETTE[0] }] };
  } else {
    const rows = parseRows(rawData);
    const [header, ...body] = rows;
    const labels = body.map((r) => r[0]);
    const seriesNames = header.slice(1).length ? header.slice(1) : ['Série 1'];
    const isPieLike = type === 'pie' || type === 'doughnut';
    const datasets = seriesNames.map((name, i) => {
      const values = body.map((r) => Number(r[i + 1]) || 0);
      const color = PALETTE[i % PALETTE.length];
      return {
        label: name,
        data: values,
        borderColor: color,
        backgroundColor: isPieLike ? body.map((_, j) => PALETTE[j % PALETTE.length]) : `${color}${type === 'bar' ? 'CC' : '30'}`,
        fill: type === 'area',
        tension: 0.35,
        borderWidth: isPieLike ? 0 : 2
      };
    });
    chartData = { labels, datasets };
  }

  const chartJsType = CHART_JS_TYPE[type] || 'bar';
  const showScales = !['pie', 'doughnut', 'radar'].includes(type);
  // Escapa "</" pra dado colado pelo usuário não poder fechar a tag <script> deste widget.
  const chartDataJson = JSON.stringify(chartData).replace(/<\//g, '<\\/');

  return `
<div style="margin:1.5rem 0;padding:1.25rem;border-radius:1rem;background:rgba(15,23,42,0.55);border:1px solid rgba(255,255,255,0.1);">
  ${title ? `<div style="font-size:0.7rem;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#22d3ee;margin-bottom:1rem;">${title}</div>` : ''}
  <div style="position:relative;height:320px;">
    <canvas id="${uid}-canvas"></canvas>
  </div>
</div>
<script>
(function () {
  function render() {
    var canvas = document.getElementById('${uid}-canvas');
    if (!canvas) return;
    if (typeof Chart === 'undefined') { setTimeout(render, 300); return; }
    new Chart(canvas, {
      type: '${chartJsType}',
      data: ${chartDataJson},
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: '${type === 'horizontalBar' ? 'y' : 'x'}',
        animation: { duration: 300 },
        ${showScales ? `scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' } }, y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' }, beginAtZero: true } },` : ''}
        plugins: { legend: { labels: { color: '#cbd5e1' } } }
      }
    });
  }
  render();
})();
</script>`;
}

// ---------------------------------------------------------------------------
// Diagramas Mermaid (mermaid.js já vendorizado — injetado quando a palavra
// "mermaid" aparece no HTML do slide, ver PresentationViewer.jsx)
// ---------------------------------------------------------------------------

function buildMermaidDiagram(config = {}) {
  const uid = uniqueId('mermaid');
  const code = (config.code || 'graph TD\n  A[Início] --> B[Fim]').trim();
  const codeJson = JSON.stringify(code).replace(/<\//g, '<\\/');

  return `
<div style="margin:1.5rem 0;padding:1.25rem;border-radius:1rem;background:rgba(15,23,42,0.4);border:1px solid rgba(255,255,255,0.1);overflow:auto;">
  <div id="${uid}" class="mermaid" style="display:flex;justify-content:center;"></div>
</div>
<script>
(function () {
  function render() {
    if (typeof mermaid === 'undefined') { setTimeout(render, 300); return; }
    var el = document.getElementById('${uid}');
    if (!el) return;
    mermaid.initialize({ startOnLoad: false, theme: 'dark' });
    mermaid.render('${uid}-svg', ${codeJson}).then(function (result) {
      el.innerHTML = result.svg;
    }).catch(function (err) {
      el.innerHTML = '<pre style="color:#f87171;font-size:0.72rem;white-space:pre-wrap;">Erro ao renderizar diagrama Mermaid: ' + err.message + '</pre>';
    });
  }
  render();
})();
</script>`;
}

const GANTT_DEFAULT = `gantt
    title Cronograma da Disciplina
    dateFormat  YYYY-MM-DD
    axisFormat  %d/%m
    section Farmacocinética
    Absorção e distribuição      :a1, 2026-08-03, 5d
    Metabolismo e excreção       :a2, after a1, 5d
    section Farmacodinâmica
    Mecanismos de ação           :b1, after a2, 7d
    Avaliação                    :crit, b2, after b1, 2d`;

const MINDMAP_DEFAULT = `mindmap
  root((Antibióticos))
    Beta-lactâmicos
      Penicilinas
      Cefalosporinas
    Macrolídeos
      Azitromicina
      Claritromicina
    Quinolonas
      Ciprofloxacino
      Levofloxacino`;

const FLOWCHART_DEFAULT = `flowchart TD
    A[Paciente com dor] --> B{Dor leve a moderada?}
    B -- Sim --> C[Paracetamol ou AINE]
    B -- Não --> D{Contraindicação a opioide?}
    D -- Sim --> E[Reavaliar com especialista]
    D -- Não --> F[Opioide fraco + adjuvante]`;

const TIMELINE_DEFAULT = `timeline
    title Marcos no desenvolvimento de um fármaco
    Descoberta : Triagem de compostos
    Pré-clínico : Testes in vitro e em animais
    Fase I : Segurança em voluntários sadios
    Fase II : Eficácia em pacientes
    Fase III : Estudo confirmatório em larga escala
    Registro : Aprovação regulatória`;

// ---------------------------------------------------------------------------
// Diagramas ilustrados (HTML/CSS/SVG estáticos, sem script)
// ---------------------------------------------------------------------------

function buildFunnel(config = {}) {
  const raw = (config.items || 'Visitantes | 1000\nLeads | 400\nOportunidades | 150\nVendas | 60').trim();
  const items = raw.split('\n').map((line) => {
    const [label, value] = line.split('|').map((s) => (s || '').trim());
    return { label, value: Number(value) || 0 };
  }).filter((i) => i.label);
  const max = Math.max(...items.map((i) => i.value), 1);

  const rows = items.map((item, i) => {
    const widthPct = 32 + (item.value / max) * 68;
    const color = PALETTE[i % PALETTE.length];
    return `
    <div style="width:${widthPct}%;background:${color};padding:0.7rem 1rem;border-radius:0.3rem;text-align:center;color:#071019;font-weight:700;font-size:0.85rem;margin:0.15rem 0;">
      ${item.label} <span style="opacity:0.65;font-weight:600;">— ${item.value}</span>
    </div>`;
  }).join('');

  return `<div style="margin:1.5rem 0;display:flex;flex-direction:column;align-items:center;">${rows}</div>`;
}

function buildTarget(config = {}) {
  const items = parseLines(config.items, 'Visão de longo prazo\nMeta intermediária\nObjetivo central');
  const n = Math.max(1, items.length);
  const outer = 240;
  const step = outer / (n + 1);

  const rings = items.map((_, i) => {
    const size = outer - i * step;
    const color = PALETTE[i % PALETTE.length];
    return `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:${size}px;height:${size}px;border-radius:50%;background:${color};z-index:${i};"></div>`;
  }).join('');

  const legend = items.map((label, i) => `
    <div style="display:flex;align-items:center;gap:0.5rem;margin:0.35rem 0;">
      <span style="width:10px;height:10px;border-radius:50%;background:${PALETTE[i % PALETTE.length]};flex-shrink:0;"></span>
      <span style="color:#e2e8f0;font-size:0.85rem;">${label}</span>
    </div>`).join('');

  return `
<div style="margin:1.5rem 0;display:flex;align-items:center;gap:2rem;flex-wrap:wrap;">
  <div style="position:relative;width:${outer}px;height:${outer}px;flex-shrink:0;">${rings}</div>
  <div>${legend}</div>
</div>`;
}

function buildConcentricCircles(config = {}) {
  const items = parseLines(config.items, 'Núcleo\nCamada 2\nCamada 3');
  const n = Math.max(1, items.length);
  const outer = 260;
  const step = outer / (n + 1);

  const rings = items.map((label, i) => {
    const size = outer - i * step;
    const color = PALETTE[i % PALETTE.length];
    return `
    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:${size}px;height:${size}px;border-radius:50%;background:${color};z-index:${i};display:flex;justify-content:center;padding-top:0.6rem;box-sizing:border-box;">
      <span style="font-size:0.7rem;font-weight:700;color:#071019;">${label}</span>
    </div>`;
  }).join('');

  return `<div style="margin:1.5rem 0;position:relative;width:${outer}px;height:${outer}px;">${rings}</div>`;
}

function buildVenn(config = {}) {
  const rawItems = parseLines(config.items, 'Conjunto A\nConjunto B\nConjunto C').slice(0, 3);
  const n = Math.max(2, Math.min(3, rawItems.length || 2));
  const colors = ['#22d3ee', '#a78bfa', '#fbbf24'];

  const layouts = {
    2: {
      viewBox: '0 0 360 260',
      circles: [{ cx: 140, cy: 130, r: 95 }, { cx: 220, cy: 130, r: 95 }],
      labelPos: [{ x: 70, y: 40 }, { x: 290, y: 40 }]
    },
    3: {
      viewBox: '0 0 360 300',
      circles: [{ cx: 140, cy: 115, r: 95 }, { cx: 220, cy: 115, r: 95 }, { cx: 180, cy: 190, r: 95 }],
      labelPos: [{ x: 55, y: 32 }, { x: 305, y: 32 }, { x: 180, y: 292 }]
    }
  };
  const layout = layouts[n];

  const circlesSvg = layout.circles.slice(0, n).map((c, i) =>
    `<circle cx="${c.cx}" cy="${c.cy}" r="${c.r}" fill="${colors[i]}" fill-opacity="0.4" stroke="${colors[i]}" stroke-width="2"/>`
  ).join('');
  const labelsSvg = layout.labelPos.slice(0, n).map((p, i) =>
    `<text x="${p.x}" y="${p.y}" text-anchor="middle" font-size="14" font-weight="700" fill="${colors[i]}">${rawItems[i] || ''}</text>`
  ).join('');

  return `
<div style="margin:1.5rem 0;display:flex;justify-content:center;">
  <svg viewBox="${layout.viewBox}" style="width:100%;max-width:420px;font-family:'Plus Jakarta Sans',sans-serif;">
    ${circlesSvg}
    ${labelsSvg}
  </svg>
</div>`;
}

function parseTimeToMinutes(t) {
  const [h, m] = (t || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

const WEEK_DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function buildWeeklyCalendar(config = {}) {
  const startHour = Math.max(0, Math.min(22, Number(config.startHour) || 7));
  const endHour = Math.max(startHour + 1, Math.min(24, Number(config.endHour) || 19));
  const raw = (config.events || 'Seg | 08:00 | 09:30 | Farmacocinética\nQua | 10:00 | 11:00 | Prova\nSex | 14:00 | 16:00 | Laboratório').trim();
  const events = raw.split('\n').map((line) => {
    const [day, start, end, title] = line.split('|').map((s) => (s || '').trim());
    return { day, start, end, title };
  }).filter((e) => e.day && e.start && e.end);

  const rangeStart = startHour * 60;
  const rangeEnd = endHour * 60;
  const totalMinutes = rangeEnd - rangeStart;
  const pxPerHour = 44;
  const bodyHeight = (endHour - startHour) * pxPerHour;

  const hourMarks = [];
  for (let h = startHour; h <= endHour; h++) hourMarks.push(h);

  const hourRows = hourMarks.map((h) => {
    const top = ((h * 60 - rangeStart) / totalMinutes) * 100;
    return `<div style="position:absolute;top:${top}%;left:0;right:0;border-top:1px solid rgba(255,255,255,0.06);"></div>`;
  }).join('');

  const hourLabels = hourMarks.map((h) => {
    const top = ((h * 60 - rangeStart) / totalMinutes) * 100;
    return `<div style="position:absolute;top:calc(${top}% - 0.5em);right:0.5rem;font-size:0.66rem;color:#6b7280;">${String(h).padStart(2, '0')}:00</div>`;
  }).join('');

  const dayColumns = WEEK_DAYS.map((day) => {
    const dayEvents = events.filter((e) => e.day.toLowerCase().startsWith(day.toLowerCase().slice(0, 3)));
    const cards = dayEvents.map((e) => {
      const s = Math.max(rangeStart, parseTimeToMinutes(e.start));
      const en = Math.min(rangeEnd, parseTimeToMinutes(e.end));
      if (en <= s) return '';
      const top = ((s - rangeStart) / totalMinutes) * 100;
      const height = ((en - s) / totalMinutes) * 100;
      return `
      <div style="position:absolute;top:${top}%;height:${height}%;left:2px;right:2px;background:rgba(34,211,238,0.18);border:1px solid rgba(34,211,238,0.4);border-radius:0.3rem;padding:0.25rem 0.4rem;overflow:hidden;box-sizing:border-box;">
        <div style="font-size:0.66rem;font-weight:700;color:#67e8f9;line-height:1.2;">${e.title}</div>
        <div style="font-size:0.58rem;color:#a5f3fc;">${e.start}–${e.end}</div>
      </div>`;
    }).join('');
    return `<div style="position:relative;flex:1;border-left:1px solid rgba(255,255,255,0.06);">${cards}</div>`;
  }).join('');

  return `
<div style="margin:1.5rem 0;">
  <div style="display:flex;">
    <div style="width:3.2rem;flex-shrink:0;"></div>
    ${WEEK_DAYS.map((d) => `<div style="flex:1;text-align:center;font-size:0.72rem;font-weight:800;text-transform:uppercase;letter-spacing:0.04em;color:#9ca3af;padding-bottom:0.4rem;">${d}</div>`).join('')}
  </div>
  <div style="display:flex;">
    <div style="width:3.2rem;flex-shrink:0;position:relative;height:${bodyHeight}px;">${hourLabels}</div>
    <div style="flex:1;display:flex;position:relative;height:${bodyHeight}px;border-top:1px solid rgba(255,255,255,0.1);border-right:1px solid rgba(255,255,255,0.06);background:rgba(15,23,42,0.3);border-radius:0 0.5rem 0.5rem 0;">
      ${hourRows}
      ${dayColumns}
    </div>
  </div>
</div>`;
}

export const DIAGRAM_CATALOG = [
  {
    id: 'chart-builder',
    title: 'Construtor de Gráfico',
    description: 'Linha, coluna, barra, pizza, rosquinha, radar, dispersão ou bolha, a partir de dados colados.',
    iconName: 'BarChart3',
    configFields: [
      {
        key: 'type',
        label: 'Tipo de gráfico',
        type: 'select',
        default: 'bar',
        options: [
          { value: 'line', label: 'Linha' },
          { value: 'area', label: 'Área' },
          { value: 'bar', label: 'Coluna' },
          { value: 'horizontalBar', label: 'Barra' },
          { value: 'pie', label: 'Pizza' },
          { value: 'doughnut', label: 'Rosquinha' },
          { value: 'radar', label: 'Radar' },
          { value: 'scatter', label: 'Dispersão' },
          { value: 'bubble', label: 'Bolha' }
        ]
      },
      { key: 'title', label: 'Título (opcional)', type: 'text', default: '' },
      {
        key: 'data',
        label: 'Dados — "Rótulo, Série1, Série2..." (Dispersão/Bolha: "x, y" ou "x, y, r", sem cabeçalho)',
        type: 'textarea',
        default: 'Fármaco, Eficácia (%), Efeitos Adversos (%)\nA, 78, 12\nB, 65, 8\nC, 88, 20'
      }
    ],
    buildHtml: buildChart
  },
  {
    id: 'gantt',
    title: 'Gráfico de Gantt',
    description: 'Cronograma em barras — sintaxe Mermaid, editável no campo abaixo.',
    iconName: 'GanttChartSquare',
    configFields: [{ key: 'code', label: 'Sintaxe Mermaid (gantt)', type: 'textarea', default: GANTT_DEFAULT }],
    buildHtml: buildMermaidDiagram
  },
  {
    id: 'mindmap',
    title: 'Mapa Mental',
    description: 'Mapa de ideias ramificado — sintaxe Mermaid, editável no campo abaixo.',
    iconName: 'Network',
    configFields: [{ key: 'code', label: 'Sintaxe Mermaid (mindmap)', type: 'textarea', default: MINDMAP_DEFAULT }],
    buildHtml: buildMermaidDiagram
  },
  {
    id: 'flowchart',
    title: 'Fluxograma',
    description: 'Diagrama de decisão/processo — sintaxe Mermaid, editável no campo abaixo.',
    iconName: 'Workflow',
    configFields: [{ key: 'code', label: 'Sintaxe Mermaid (flowchart)', type: 'textarea', default: FLOWCHART_DEFAULT }],
    buildHtml: buildMermaidDiagram
  },
  {
    id: 'timeline',
    title: 'Linha do Tempo',
    description: 'Sequência de marcos — sintaxe Mermaid, editável no campo abaixo.',
    iconName: 'History',
    configFields: [{ key: 'code', label: 'Sintaxe Mermaid (timeline)', type: 'textarea', default: TIMELINE_DEFAULT }],
    buildHtml: buildMermaidDiagram
  },
  {
    id: 'funnel',
    title: 'Funil',
    description: 'Etapas afunilando — cada linha vira uma faixa proporcional ao valor.',
    iconName: 'Filter',
    configFields: [{ key: 'items', label: 'Etapas — "Nome | Valor" por linha', type: 'textarea', default: 'Visitantes | 1000\nLeads | 400\nOportunidades | 150\nVendas | 60' }],
    buildHtml: buildFunnel
  },
  {
    id: 'target',
    title: 'Alvo',
    description: 'Círculos concêntricos com legenda — bom pra mostrar prioridades ou camadas de objetivo.',
    iconName: 'Target',
    configFields: [{ key: 'items', label: 'Camadas, da mais externa pra mais interna — uma por linha', type: 'textarea', default: 'Visão de longo prazo\nMeta intermediária\nObjetivo central' }],
    buildHtml: buildTarget
  },
  {
    id: 'concentric-circles',
    title: 'Círculos Concêntricos',
    description: 'Camadas com rótulo dentro de cada anel — bom pra hierarquia ou escopo.',
    iconName: 'CircleDot',
    configFields: [{ key: 'items', label: 'Camadas, da mais externa pra mais interna — uma por linha', type: 'textarea', default: 'Núcleo\nCamada 2\nCamada 3' }],
    buildHtml: buildConcentricCircles
  },
  {
    id: 'venn',
    title: 'Diagrama de Venn',
    description: '2 ou 3 conjuntos sobrepostos.',
    iconName: 'CircleEllipsis',
    configFields: [{ key: 'items', label: 'Conjuntos (2 ou 3) — um por linha', type: 'textarea', default: 'Conjunto A\nConjunto B\nConjunto C' }],
    buildHtml: buildVenn
  },
  {
    id: 'weekly-calendar',
    title: 'Calendário Semanal',
    description: 'Grade de horários da semana com eventos posicionados por horário.',
    iconName: 'CalendarDays',
    configFields: [
      { key: 'startHour', label: 'Hora inicial', type: 'number', default: 7, min: 0, max: 22, step: 1 },
      { key: 'endHour', label: 'Hora final', type: 'number', default: 19, min: 1, max: 24, step: 1 },
      { key: 'events', label: 'Eventos — "Dia | Início | Fim | Título" por linha', type: 'textarea', default: 'Seg | 08:00 | 09:30 | Farmacocinética\nQua | 10:00 | 11:00 | Prova\nSex | 14:00 | 16:00 | Laboratório' }
    ],
    buildHtml: buildWeeklyCalendar
  }
];
