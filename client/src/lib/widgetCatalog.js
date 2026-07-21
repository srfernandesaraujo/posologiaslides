// Gera um sufixo curto e único para escopar ids/classes do widget dentro do
// HTML do slide — permite inserir o mesmo widget mais de uma vez sem colisão.
function uniqueId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function buildDoseSimulator() {
  const uid = uniqueId('dose-sim');
  return `
<div id="${uid}" style="margin:1.5rem 0;padding:1.5rem;border-radius:1rem;background:rgba(15,23,42,0.55);border:1px solid rgba(255,255,255,0.1);">
  <div style="font-size:0.7rem;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#22d3ee;margin-bottom:1rem;">Simulação · Farmacocinética</div>
  <div style="display:grid;grid-template-columns:1fr 1.4fr;gap:1.5rem;align-items:center;">
    <div>
      <div style="margin-bottom:1.1rem;">
        <div style="display:flex;justify-content:space-between;font-size:0.8rem;color:#cbd5e1;margin-bottom:0.35rem;">
          <span>Dose inicial (C&#8320;)</span><span id="${uid}-c0-val" style="font-weight:700;color:#fff;">100 mg/L</span>
        </div>
        <input id="${uid}-c0" type="range" min="10" max="200" value="100" step="5" style="width:100%;accent-color:#22d3ee;" />
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;font-size:0.8rem;color:#cbd5e1;margin-bottom:0.35rem;">
          <span>Meia-vida (t&#189;)</span><span id="${uid}-th-val" style="font-weight:700;color:#fff;">6 h</span>
        </div>
        <input id="${uid}-th" type="range" min="1" max="24" value="6" step="1" style="width:100%;accent-color:#22d3ee;" />
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

function buildTimer() {
  const uid = uniqueId('timer');
  return `
<div id="${uid}" style="margin:1.5rem 0;padding:1.5rem;border-radius:1rem;background:rgba(15,23,42,0.55);border:1px solid rgba(255,255,255,0.1);text-align:center;max-width:360px;">
  <div style="font-size:0.7rem;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#22d3ee;margin-bottom:0.75rem;">Temporizador</div>
  <div id="${uid}-display" style="font-family:'JetBrains Mono',monospace;font-size:3rem;font-weight:800;color:#fff;margin-bottom:1rem;">05:00</div>
  <div style="display:flex;justify-content:center;gap:0.4rem;margin-bottom:0.75rem;flex-wrap:wrap;">
    <button data-min="1" class="${uid}-preset" style="padding:0.4rem 0.8rem;border-radius:0.5rem;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#e2e8f0;cursor:pointer;font-size:0.8rem;">1 min</button>
    <button data-min="3" class="${uid}-preset" style="padding:0.4rem 0.8rem;border-radius:0.5rem;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#e2e8f0;cursor:pointer;font-size:0.8rem;">3 min</button>
    <button data-min="5" class="${uid}-preset" style="padding:0.4rem 0.8rem;border-radius:0.5rem;border:1px solid rgba(34,211,238,0.4);background:rgba(34,211,238,0.15);color:#67e8f9;cursor:pointer;font-size:0.8rem;">5 min</button>
    <button data-min="10" class="${uid}-preset" style="padding:0.4rem 0.8rem;border-radius:0.5rem;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#e2e8f0;cursor:pointer;font-size:0.8rem;">10 min</button>
  </div>
  <div style="display:flex;justify-content:center;gap:0.5rem;">
    <button id="${uid}-start" style="padding:0.5rem 1.1rem;border-radius:0.5rem;border:none;background:linear-gradient(135deg,#22d3ee,#06b6d4);color:#071019;font-weight:700;cursor:pointer;">Iniciar</button>
    <button id="${uid}-pause" style="padding:0.5rem 1.1rem;border-radius:0.5rem;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#e2e8f0;font-weight:700;cursor:pointer;">Pausar</button>
    <button id="${uid}-reset" style="padding:0.5rem 1.1rem;border-radius:0.5rem;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#e2e8f0;font-weight:700;cursor:pointer;">Zerar</button>
  </div>
</div>
<script>
(function () {
  var totalSeconds = 5 * 60;
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

function buildRandomPicker() {
  const uid = uniqueId('picker');
  return `
<div id="${uid}" style="margin:1.5rem 0;padding:1.5rem;border-radius:1rem;background:rgba(15,23,42,0.55);border:1px solid rgba(255,255,255,0.1);max-width:420px;">
  <div style="font-size:0.7rem;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#22d3ee;margin-bottom:0.75rem;">Sorteador de Aluno</div>
  <textarea id="${uid}-names" rows="4" placeholder="Cole ou digite um nome por linha..." style="width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:0.5rem;color:#e2e8f0;padding:0.6rem;font-size:0.85rem;font-family:inherit;resize:vertical;margin-bottom:0.75rem;box-sizing:border-box;">Ana
Bruno
Carla
Diego</textarea>
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

export const WIDGET_CATALOG = [
  {
    id: 'dose-simulator',
    title: 'Simulação de Dose (Farmacocinética)',
    description: 'Sliders de dose inicial e meia-vida atualizando ao vivo a curva de concentração x tempo.',
    iconName: 'Activity',
    buildHtml: buildDoseSimulator
  },
  {
    id: 'timer',
    title: 'Temporizador',
    description: 'Contagem regressiva com presets — para atividades em tempo limitado durante a aula.',
    iconName: 'Timer',
    buildHtml: buildTimer
  },
  {
    id: 'random-picker',
    title: 'Sorteador de Aluno',
    description: 'Lista de nomes da turma com sorteio animado — para chamar alunos aleatoriamente.',
    iconName: 'Shuffle',
    buildHtml: buildRandomPicker
  }
];
