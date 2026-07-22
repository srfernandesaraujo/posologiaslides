// Gera um sufixo curto e único para escopar ids/classes do widget dentro do
// HTML do slide — permite inserir o mesmo widget mais de uma vez sem colisão.
function uniqueId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatMMSS(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

function buildDoseSimulator(config = {}) {
  const uid = uniqueId('dose-sim');
  const label = (config.label || '').trim();
  const c0Max = Number(config.c0Max) || 200;
  const halfLifeMax = Number(config.halfLifeMax) || 24;
  const c0Default = Math.min(100, c0Max);
  const halfLifeDefault = Math.min(6, halfLifeMax);
  const title = label ? `Simulação · Farmacocinética — ${label}` : 'Simulação · Farmacocinética';

  return `
<div id="${uid}" style="margin:1.5rem 0;padding:1.5rem;border-radius:1rem;background:rgba(15,23,42,0.55);border:1px solid rgba(255,255,255,0.1);">
  <div style="font-size:0.7rem;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#22d3ee;margin-bottom:1rem;">${title}</div>
  <div style="display:grid;grid-template-columns:1fr 1.4fr;gap:1.5rem;align-items:center;">
    <div>
      <div style="margin-bottom:1.1rem;">
        <div style="display:flex;justify-content:space-between;font-size:0.8rem;color:#cbd5e1;margin-bottom:0.35rem;">
          <span>Dose inicial (C&#8320;)</span><span id="${uid}-c0-val" style="font-weight:700;color:#fff;">${c0Default} mg/L</span>
        </div>
        <input id="${uid}-c0" type="range" min="10" max="${c0Max}" value="${c0Default}" step="5" style="width:100%;accent-color:#22d3ee;" />
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;font-size:0.8rem;color:#cbd5e1;margin-bottom:0.35rem;">
          <span>Meia-vida (t&#189;)</span><span id="${uid}-th-val" style="font-weight:700;color:#fff;">${halfLifeDefault} h</span>
        </div>
        <input id="${uid}-th" type="range" min="1" max="${halfLifeMax}" value="${halfLifeDefault}" step="1" style="width:100%;accent-color:#22d3ee;" />
      </div>
    </div>
    <div style="position:relative;height:200px;">
      <canvas id="${uid}-canvas"></canvas>
    </div>
  </div>
</div>
<script>
(function () {
  function render() {
    var canvas = document.getElementById('${uid}-canvas');
    if (!canvas) return;
    if (typeof Chart === 'undefined') { setTimeout(render, 300); return; }

    var c0Input = document.getElementById('${uid}-c0');
    var thInput = document.getElementById('${uid}-th');
    var c0Val = document.getElementById('${uid}-c0-val');
    var thVal = document.getElementById('${uid}-th-val');

    function buildPoints(c0, halfLife) {
      var labels = [];
      var data = [];
      for (var t = 0; t <= 48; t += 2) {
        labels.push(t + 'h');
        data.push(Number((c0 * Math.pow(0.5, t / halfLife)).toFixed(1)));
      }
      return { labels: labels, data: data };
    }

    var initial = buildPoints(Number(c0Input.value), Number(thInput.value));
    var chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: initial.labels,
        datasets: [{
          label: 'Concentração (mg/L)',
          data: initial.data,
          borderColor: '#22d3ee',
          backgroundColor: 'rgba(34,211,238,0.15)',
          fill: true,
          tension: 0.35,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        scales: {
          x: { ticks: { color: '#94a3b8', maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.06)' } },
          y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' }, beginAtZero: true }
        },
        plugins: { legend: { labels: { color: '#cbd5e1' } } }
      }
    });

    function update() {
      var c0 = Number(c0Input.value);
      var halfLife = Number(thInput.value);
      c0Val.textContent = c0 + ' mg/L';
      thVal.textContent = halfLife + ' h';
      var points = buildPoints(c0, halfLife);
      chart.data.labels = points.labels;
      chart.data.datasets[0].data = points.data;
      chart.update();
    }

    c0Input.addEventListener('input', update);
    thInput.addEventListener('input', update);
  }

  render();
})();
</script>`;
}

function buildTimer(config = {}) {
  const uid = uniqueId('timer');
  const parsedPresets = (config.presets || '1,3,5,10')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => n > 0);
  const presets = parsedPresets.length ? parsedPresets : [1, 3, 5, 10];
  const defaultSeconds = presets[0] * 60;

  const presetButtons = presets.map((m, i) => {
    const active = i === 0;
    const border = active ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.15)';
    const bg = active ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.05)';
    const color = active ? '#67e8f9' : '#e2e8f0';
    return `<button data-min="${m}" class="${uid}-preset" style="padding:0.4rem 0.8rem;border-radius:0.5rem;border:1px solid ${border};background:${bg};color:${color};cursor:pointer;font-size:0.8rem;">${m} min</button>`;
  }).join('');

  return `
<div id="${uid}" style="margin:1.5rem 0;padding:1.5rem;border-radius:1rem;background:rgba(15,23,42,0.55);border:1px solid rgba(255,255,255,0.1);text-align:center;max-width:360px;">
  <div style="font-size:0.7rem;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#22d3ee;margin-bottom:0.75rem;">Temporizador</div>
  <div id="${uid}-display" style="font-family:'JetBrains Mono',monospace;font-size:3rem;font-weight:800;color:#fff;margin-bottom:1rem;">${formatMMSS(defaultSeconds)}</div>
  <div style="display:flex;justify-content:center;gap:0.4rem;margin-bottom:0.75rem;flex-wrap:wrap;">${presetButtons}</div>
  <div style="display:flex;justify-content:center;gap:0.5rem;">
    <button id="${uid}-start" style="padding:0.5rem 1.1rem;border-radius:0.5rem;border:none;background:linear-gradient(135deg,#22d3ee,#06b6d4);color:#071019;font-weight:700;cursor:pointer;">Iniciar</button>
    <button id="${uid}-pause" style="padding:0.5rem 1.1rem;border-radius:0.5rem;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#e2e8f0;font-weight:700;cursor:pointer;">Pausar</button>
    <button id="${uid}-reset" style="padding:0.5rem 1.1rem;border-radius:0.5rem;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#e2e8f0;font-weight:700;cursor:pointer;">Zerar</button>
  </div>
</div>
<script>
(function () {
  var totalSeconds = ${defaultSeconds};
  var remaining = totalSeconds;
  var timerId = null;
  var display = document.getElementById('${uid}-display');

  function render() {
    var m = Math.floor(remaining / 60);
    var s = remaining % 60;
    display.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    display.style.color = (remaining <= 10 && remaining > 0) ? '#f87171' : '#fff';
  }

  function tick() {
    if (remaining <= 0) { clearInterval(timerId); timerId = null; return; }
    remaining -= 1;
    render();
  }

  document.querySelectorAll('.${uid}-preset').forEach(function (btn) {
    btn.addEventListener('click', function () {
      clearInterval(timerId);
      timerId = null;
      totalSeconds = Number(btn.getAttribute('data-min')) * 60;
      remaining = totalSeconds;
      render();
    });
  });

  document.getElementById('${uid}-start').addEventListener('click', function () {
    if (timerId || remaining <= 0) return;
    timerId = setInterval(tick, 1000);
  });
  document.getElementById('${uid}-pause').addEventListener('click', function () {
    clearInterval(timerId);
    timerId = null;
  });
  document.getElementById('${uid}-reset').addEventListener('click', function () {
    clearInterval(timerId);
    timerId = null;
    remaining = totalSeconds;
    render();
  });

  render();
})();
</script>`;
}

function buildRandomPicker(config = {}) {
  const uid = uniqueId('picker');
  const names = (config.names || 'Ana\nBruno\nCarla\nDiego').trim();

  return `
<div id="${uid}" style="margin:1.5rem 0;padding:1.5rem;border-radius:1rem;background:rgba(15,23,42,0.55);border:1px solid rgba(255,255,255,0.1);max-width:420px;">
  <div style="font-size:0.7rem;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#22d3ee;margin-bottom:0.75rem;">Sorteador de Aluno</div>
  <textarea id="${uid}-names" rows="4" placeholder="Cole ou digite um nome por linha..." style="width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:0.5rem;color:#e2e8f0;padding:0.6rem;font-size:0.85rem;font-family:inherit;resize:vertical;margin-bottom:0.75rem;box-sizing:border-box;">${names}</textarea>
  <div style="display:flex;align-items:center;gap:0.75rem;">
    <button id="${uid}-draw" style="padding:0.55rem 1.1rem;border-radius:0.5rem;border:none;background:linear-gradient(135deg,#22d3ee,#06b6d4);color:#071019;font-weight:700;cursor:pointer;white-space:nowrap;">Sortear</button>
    <div id="${uid}-result" style="flex:1;text-align:center;font-size:1.3rem;font-weight:800;color:#fff;min-height:1.6em;"></div>
  </div>
</div>
<script>
(function () {
  var namesArea = document.getElementById('${uid}-names');
  var resultEl = document.getElementById('${uid}-result');
  var drawBtn = document.getElementById('${uid}-draw');
  var spinning = false;

  drawBtn.addEventListener('click', function () {
    if (spinning) return;
    var names = namesArea.value.split('\\n').map(function (n) { return n.trim(); }).filter(Boolean);
    if (names.length === 0) { resultEl.textContent = 'Adicione ao menos um nome'; return; }

    spinning = true;
    var cycles = 14;
    var i = 0;
    var interval = setInterval(function () {
      resultEl.textContent = names[Math.floor(Math.random() * names.length)];
      i += 1;
      if (i >= cycles) {
        clearInterval(interval);
        spinning = false;
      }
    }, 80);
  });
})();
</script>`;
}

function buildDoseCalculator(config = {}) {
  const uid = uniqueId('dose-calc');
  const label = (config.label || 'Fármaco X').trim();
  const dosePerKg = Number(config.dosePerKg) || 10;
  const unit = (config.unit || 'mg').trim();

  return `
<div id="${uid}" style="margin:1.5rem 0;padding:1.5rem;border-radius:1rem;background:rgba(15,23,42,0.55);border:1px solid rgba(255,255,255,0.1);max-width:380px;">
  <div style="font-size:0.7rem;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#22d3ee;margin-bottom:0.35rem;">Calculadora de Dose</div>
  <div style="font-size:0.95rem;font-weight:700;color:#fff;margin-bottom:1rem;">${label} — ${dosePerKg} ${unit}/kg</div>
  <label style="display:block;font-size:0.8rem;color:#cbd5e1;margin-bottom:0.35rem;">Peso do paciente (kg)</label>
  <input id="${uid}-weight" type="number" min="0" step="0.5" placeholder="Ex: 70" style="width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:0.5rem;color:#e2e8f0;padding:0.6rem;font-size:0.9rem;box-sizing:border-box;margin-bottom:1rem;" />
  <div style="display:flex;justify-content:space-between;align-items:baseline;padding-top:0.75rem;border-top:1px solid rgba(255,255,255,0.08);">
    <span style="font-size:0.8rem;color:#9ca3af;">Dose total calculada</span>
    <span id="${uid}-result" style="font-size:1.6rem;font-weight:800;color:#22d3ee;">— ${unit}</span>
  </div>
</div>
<script>
(function () {
  var weightInput = document.getElementById('${uid}-weight');
  var resultEl = document.getElementById('${uid}-result');
  var dosePerKg = ${dosePerKg};
  weightInput.addEventListener('input', function () {
    var weight = Number(weightInput.value);
    if (!weight || weight <= 0) { resultEl.textContent = '— ${unit}'; return; }
    resultEl.textContent = (weight * dosePerKg).toFixed(1) + ' ${unit}';
  });
})();
</script>`;
}

function buildFlashcards(config = {}) {
  const uid = uniqueId('flashcards');
  const raw = (config.cards || [
    'O que é meia-vida de eliminação? | Tempo para a concentração plasmática do fármaco cair pela metade.',
    'O que é biodisponibilidade? | Fração da dose administrada que atinge a circulação sistêmica inalterada.',
    'O que é dose de ataque? | Dose inicial maior, usada para atingir rapidamente a concentração terapêutica.'
  ].join('\n')).trim();

  const cards = raw.split('\n').map((line) => {
    const [q, a] = line.split('|').map((s) => (s || '').trim());
    return { q: q || '', a: a || '' };
  }).filter((c) => c.q);
  // Escapa "</" pra um card não poder fechar a tag <script> deste widget acidentalmente
  const cardsJson = JSON.stringify(cards).replace(/<\//g, '<\\/');

  return `
<div id="${uid}" style="margin:1.5rem 0;padding:1.5rem;border-radius:1rem;background:rgba(15,23,42,0.55);border:1px solid rgba(255,255,255,0.1);max-width:420px;text-align:center;">
  <div style="font-size:0.7rem;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#22d3ee;margin-bottom:1rem;">Flashcards</div>
  <div id="${uid}-card" style="min-height:110px;display:flex;align-items:center;justify-content:center;padding:1.25rem;border-radius:0.75rem;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);cursor:pointer;font-size:1rem;font-weight:600;color:#fff;margin-bottom:0.9rem;"></div>
  <div style="display:flex;justify-content:space-between;align-items:center;">
    <button id="${uid}-prev" style="padding:0.4rem 0.8rem;border-radius:0.5rem;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#e2e8f0;cursor:pointer;font-size:0.8rem;">&larr; Anterior</button>
    <span id="${uid}-count" style="font-size:0.78rem;color:#9ca3af;"></span>
    <button id="${uid}-next" style="padding:0.4rem 0.8rem;border-radius:0.5rem;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#e2e8f0;cursor:pointer;font-size:0.8rem;">Próxima &rarr;</button>
  </div>
  <div style="font-size:0.72rem;color:#6b7280;margin-top:0.6rem;">Clique no card pra virar</div>
</div>
<script>
(function () {
  var cards = ${cardsJson};
  var idx = 0;
  var showingAnswer = false;
  var cardEl = document.getElementById('${uid}-card');
  var countEl = document.getElementById('${uid}-count');

  function render() {
    if (cards.length === 0) { cardEl.textContent = 'Nenhum card configurado.'; countEl.textContent = ''; return; }
    var card = cards[idx];
    cardEl.textContent = showingAnswer ? card.a : card.q;
    cardEl.style.color = showingAnswer ? '#67e8f9' : '#fff';
    countEl.textContent = (idx + 1) + ' / ' + cards.length;
  }

  cardEl.addEventListener('click', function () {
    if (cards.length === 0) return;
    showingAnswer = !showingAnswer;
    render();
  });
  document.getElementById('${uid}-prev').addEventListener('click', function () {
    if (cards.length === 0) return;
    idx = (idx - 1 + cards.length) % cards.length;
    showingAnswer = false;
    render();
  });
  document.getElementById('${uid}-next').addEventListener('click', function () {
    if (cards.length === 0) return;
    idx = (idx + 1) % cards.length;
    showingAnswer = false;
    render();
  });

  render();
})();
</script>`;
}

function buildBeforeAfter(config = {}) {
  const uid = uniqueId('before-after');
  const DEFAULT_IMG = 'https://images.unsplash.com/photo-1530026405186-ed1f139313f8?w=800';
  const beforeUrl = (config.beforeUrl || DEFAULT_IMG).trim();
  const afterUrl = (config.afterUrl || DEFAULT_IMG).trim();
  const beforeLabel = (config.beforeLabel || 'Antes').trim();
  const afterLabel = (config.afterLabel || 'Depois').trim();

  return `
<div id="${uid}" style="margin:1.5rem 0;max-width:520px;">
  <div style="font-size:0.7rem;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#22d3ee;margin-bottom:0.75rem;">Comparador Antes / Depois</div>
  <div id="${uid}-frame" style="position:relative;width:100%;aspect-ratio:16/10;border-radius:0.75rem;overflow:hidden;border:1px solid rgba(255,255,255,0.12);background:#0b1220;">
    <img src="${beforeUrl}" alt="${beforeLabel}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" />
    <img id="${uid}-after-img" src="${afterUrl}" alt="${afterLabel}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;clip-path:inset(0 50% 0 0);" />
    <div id="${uid}-handle" style="position:absolute;top:0;bottom:0;left:50%;width:3px;background:#22d3ee;box-shadow:0 0 8px rgba(34,211,238,0.6);pointer-events:none;"></div>
  </div>
  <input id="${uid}-slider" type="range" min="0" max="100" value="50" style="width:100%;margin-top:0.75rem;accent-color:#22d3ee;" />
  <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:#9ca3af;margin-top:0.3rem;">
    <span>${beforeLabel}</span><span>${afterLabel}</span>
  </div>
</div>
<script>
(function () {
  var slider = document.getElementById('${uid}-slider');
  var afterImg = document.getElementById('${uid}-after-img');
  var handle = document.getElementById('${uid}-handle');
  slider.addEventListener('input', function () {
    var pct = Number(slider.value);
    afterImg.style.clipPath = 'inset(0 ' + (100 - pct) + '% 0 0)';
    handle.style.left = pct + '%';
  });
})();
</script>`;
}

export const WIDGET_CATALOG = [
  {
    id: 'dose-simulator',
    title: 'Simulação de Dose (Farmacocinética)',
    description: 'Sliders de dose inicial e meia-vida atualizando ao vivo a curva de concentração x tempo.',
    iconName: 'Activity',
    configFields: [
      { key: 'label', label: 'Nome do fármaco (opcional)', type: 'text', default: '' },
      { key: 'c0Max', label: 'Dose máxima do slider (mg/L)', type: 'number', default: 200, min: 20, max: 2000, step: 10 },
      { key: 'halfLifeMax', label: 'Meia-vida máxima do slider (h)', type: 'number', default: 24, min: 2, max: 96, step: 1 }
    ],
    buildHtml: buildDoseSimulator
  },
  {
    id: 'timer',
    title: 'Temporizador',
    description: 'Contagem regressiva com presets — para atividades em tempo limitado durante a aula.',
    iconName: 'Timer',
    configFields: [
      { key: 'presets', label: 'Presets em minutos (separados por vírgula)', type: 'text', default: '1,3,5,10' }
    ],
    buildHtml: buildTimer
  },
  {
    id: 'random-picker',
    title: 'Sorteador de Aluno',
    description: 'Lista de nomes da turma com sorteio animado — para chamar alunos aleatoriamente.',
    iconName: 'Shuffle',
    configFields: [
      { key: 'names', label: 'Lista de nomes (um por linha)', type: 'textarea', default: 'Ana\nBruno\nCarla\nDiego' }
    ],
    buildHtml: buildRandomPicker
  },
  {
    id: 'dose-calculator',
    title: 'Calculadora de Dose por Peso',
    description: 'Calcula a dose total ao vivo a partir do peso do paciente (mg/kg configurável).',
    iconName: 'Calculator',
    configFields: [
      { key: 'label', label: 'Nome do fármaco', type: 'text', default: 'Fármaco X' },
      { key: 'dosePerKg', label: 'Dose recomendada (por kg)', type: 'number', default: 10, min: 0.1, max: 500, step: 0.1 },
      { key: 'unit', label: 'Unidade', type: 'text', default: 'mg' }
    ],
    buildHtml: buildDoseCalculator
  },
  {
    id: 'flashcards',
    title: 'Flashcards',
    description: 'Cartões de pergunta/resposta pra revisão rápida — clique pra virar, navegue entre os cards.',
    iconName: 'Layers',
    configFields: [
      {
        key: 'cards',
        label: 'Cards — um por linha, "Pergunta | Resposta"',
        type: 'textarea',
        default: 'O que é meia-vida de eliminação? | Tempo para a concentração plasmática do fármaco cair pela metade.\nO que é biodisponibilidade? | Fração da dose administrada que atinge a circulação sistêmica inalterada.\nO que é dose de ataque? | Dose inicial maior, usada para atingir rapidamente a concentração terapêutica.'
      }
    ],
    buildHtml: buildFlashcards
  },
  {
    id: 'before-after',
    title: 'Comparador Antes / Depois',
    description: 'Slider revelando uma imagem sobre a outra — ótimo pra evolução de caso, anatomia, patologia.',
    iconName: 'Columns2',
    configFields: [
      { key: 'beforeUrl', label: 'URL da imagem "Antes"', type: 'text', default: 'https://images.unsplash.com/photo-1530026405186-ed1f139313f8?w=800' },
      { key: 'afterUrl', label: 'URL da imagem "Depois"', type: 'text', default: 'https://images.unsplash.com/photo-1530026405186-ed1f139313f8?w=800' },
      { key: 'beforeLabel', label: 'Rótulo "Antes"', type: 'text', default: 'Antes' },
      { key: 'afterLabel', label: 'Rótulo "Depois"', type: 'text', default: 'Depois' }
    ],
    buildHtml: buildBeforeAfter
  }
];
