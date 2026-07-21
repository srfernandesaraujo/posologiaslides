// Apresentação de demonstração usada para popular o armazenamento na primeira
// execução do servidor (mesmo conteúdo que antes vivia hardcoded em App.jsx).
export const seedPresentation = {
  id: 'p-1',
  title: 'Farmacoterapia e Posologia Avançada',
  description: 'Apresentação de demonstração interativa com Metodologias Ativas',
  slides: [
    {
      id: 'demo-slide-1',
      title: 'Posologia e Janela Terapêutica',
      type: 'intro',
      html: `
        <div class="slide-root" style="height: 100%; display: flex; flex-direction: column; justify-content: space-between; background: linear-gradient(135deg, #090d16 0%, #111827 100%); color: #f3f4f6; padding: 2.5rem; border-radius: 1rem; box-sizing: border-box;">
          <header style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1rem;">
            <div>
              <span style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.1em; color: #a855f7; font-weight: 700;">METODOLOGIA ATIVA & SIMULAÇÃO</span>
              <h2 style="font-size: 2.2rem; font-weight: 800; margin: 0.3rem 0 0 0; background: linear-gradient(90deg, #c084fc, #38bdf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Janela Terapêutica Interativa</h2>
              <p style="margin: 0.2rem 0 0 0; color: #9ca3af; font-size: 1rem;">Escaneie o QR Code no canto da tela com o celular para participar dos quizzes em tempo real!</p>
            </div>
            <div style="background: rgba(255,255,255,0.05); padding: 0.5rem 1rem; border-radius: 2rem; border: 1px solid rgba(255,255,255,0.1); font-weight: 600; color: #9ca3af;">
              Slide 1/3
            </div>
          </header>

          <main style="display: grid; grid-template-columns: 1fr 1.2fr; gap: 2rem; align-items: center; margin: 1rem 0;">
            <div style="background: rgba(255,255,255,0.03); padding: 1.5rem; border-radius: 1rem; border: 1px solid rgba(255,255,255,0.08);">
              <h3 style="margin-top: 0; color: #38bdf8; font-size: 1.1rem;">Controles de Posologia</h3>
              <div style="margin-bottom: 1.2rem;">
                <label style="display: flex; justify-content: space-between; font-size: 0.88rem; margin-bottom: 0.4rem; color: #e5e7eb;">
                  <span>Dose do Fármaco (mg):</span>
                  <strong id="val-dose">500 mg</strong>
                </label>
                <input type="range" id="input-dose" min="100" max="1000" step="50" value="500" style="width: 100%; accent-color: #a855f7;">
              </div>
              <div style="margin-bottom: 1.2rem;">
                <label style="display: flex; justify-content: space-between; font-size: 0.88rem; margin-bottom: 0.4rem; color: #e5e7eb;">
                  <span>Intervalo entre Doses (Horas):</span>
                  <strong id="val-hours">8h em 8h</strong>
                </label>
                <input type="range" id="input-hours" min="4" max="24" step="2" value="8" style="width: 100%; accent-color: #38bdf8;">
              </div>
            </div>

            <div style="background: rgba(0,0,0,0.3); padding: 1.5rem; border-radius: 1rem; border: 1px solid rgba(255,255,255,0.1); height: 260px; display: flex; align-items: center; justify-content: center;">
              <canvas id="chart-dose-canvas" style="max-height: 230px; width: 100%;"></canvas>
            </div>
          </main>

          <footer style="display: flex; justify-content: space-between; font-size: 0.85rem; color: #6b7280; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 0.8rem;">
            <span>Farmacoterapia Avançada</span>
            <span>Posologia Interactive Presentation System</span>
          </footer>

          <script>
            (function() {
              const dInput = document.getElementById('input-dose');
              const hInput = document.getElementById('input-hours');
              const dVal = document.getElementById('val-dose');
              const hVal = document.getElementById('val-hours');
              let chartInstance = null;

              function renderChart() {
                const ctx = document.getElementById('chart-dose-canvas');
                if (!ctx || typeof Chart === 'undefined') return;

                const dose = parseInt(dInput ? dInput.value : 500);
                const hours = parseInt(hInput ? hInput.value : 8);

                dVal.textContent = dose + ' mg';
                hVal.textContent = hours + 'h em ' + hours + 'h';

                const dataPoints = [];
                const labels = [];
                let conc = 0;
                for (let t = 0; t <= 48; t += 2) {
                  labels.push(t + 'h');
                  if (t % hours === 0) conc += (dose / 10);
                  conc *= 0.82;
                  dataPoints.push(Math.round(conc));
                }

                if (chartInstance) {
                  chartInstance.data.datasets[0].data = dataPoints;
                  chartInstance.update();
                } else {
                  chartInstance = new Chart(ctx, {
                    type: 'line',
                    data: {
                      labels,
                      datasets: [
                        { label: 'Concentração Plasmática (µg/mL)', data: dataPoints, borderColor: '#a855f7', backgroundColor: 'rgba(168, 85, 247, 0.15)', fill: true, tension: 0.4 },
                        { label: 'Limite Tóxico (90 µg/mL)', data: Array(25).fill(90), borderColor: '#ef4444', borderDash: [5, 5], pointRadius: 0 },
                        { label: 'Mínimo Eficaz (20 µg/mL)', data: Array(25).fill(20), borderColor: '#10b981', borderDash: [5, 5], pointRadius: 0 }
                      ]
                    },
                    options: {
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { labels: { color: '#e5e7eb' } } },
                      scales: {
                        x: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                        y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } }
                      }
                    }
                  });
                }
              }

              if (dInput && hInput) {
                dInput.addEventListener('input', renderChart);
                hInput.addEventListener('input', renderChart);
              }
              setTimeout(renderChart, 200);
            })();
          </script>
        </div>
      `
    },
    {
      id: 'demo-slide-2',
      title: 'Quiz de Prontidão e Avaliação iRAT/tRAT',
      type: 'quiz',
      branches: [
        { optionText: 'Trilha A: Iniciar Antimicrobiano de Largo Espectro', targetSlideId: 'demo-slide-3' },
        { optionText: 'Trilha B: Solicitar Hemocultura e Aguardar 12h', targetSlideId: 'demo-slide-3' }
      ],
      html: `
        <div class="slide-root" style="height: 100%; display: flex; flex-direction: column; justify-content: space-between; background: linear-gradient(135deg, #090d16 0%, #151d2a 100%); color: #f3f4f6; padding: 2.5rem; border-radius: 1rem; box-sizing: border-box;">
          <header style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1rem;">
            <div>
              <span style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.1em; color: #f59e0b; font-weight: 700;">QUIZ AO VIVO & TRILHA DE DECISÃO</span>
              <h2 style="font-size: 2.2rem; font-weight: 800; margin: 0.3rem 0 0 0; background: linear-gradient(90deg, #fbbf24, #ef4444); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Caso Clínico & Conduta Terapêutica</h2>
              <p style="margin: 0.2rem 0 0 0; color: #9ca3af; font-size: 1rem;">Paciente com infecção grave. Qual a conduta correta?</p>
            </div>
            <div style="background: rgba(255,255,255,0.05); padding: 0.5rem 1rem; border-radius: 2rem; border: 1px solid rgba(255,255,255,0.1); font-weight: 600; color: #9ca3af;">
              Slide 2/3
            </div>
          </header>

          <main style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; align-items: center; margin: 1rem 0;">
            <div style="background: rgba(255,255,255,0.03); padding: 1.5rem; border-radius: 1rem; border: 1px solid rgba(255,255,255,0.08);">
              <h3 style="margin-top: 0; color: #fbbf24;">Responda pelo Celular:</h3>
              <ul style="list-style: none; padding: 0; display: flex; flex-direction: column; gap: 0.8rem;">
                <li style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; padding: 0.8rem 1rem; border-radius: 0.5rem;"><strong>A:</strong> Ajustar dose pelo clearance de creatinina</li>
                <li style="background: rgba(59, 130, 246, 0.15); border: 1px solid #3b82f6; padding: 0.8rem 1rem; border-radius: 0.5rem;"><strong>B:</strong> Suspender a medicação imediatamente</li>
                <li style="background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; padding: 0.8rem 1rem; border-radius: 0.5rem;"><strong>C:</strong> Dobrar a dosagem diária</li>
                <li style="background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; padding: 0.8rem 1rem; border-radius: 0.5rem;"><strong>D:</strong> Manter dose e monitorar sinais de toxicidade</li>
              </ul>
            </div>

            <div style="background: rgba(0,0,0,0.3); padding: 1.5rem; border-radius: 1rem; border: 1px solid rgba(255,255,255,0.1); text-align: center;">
              <h3 style="margin-top: 0; color: #38bdf8;">Votação dos Alunos no Celular</h3>
              <p style="color: #9ca3af; font-size: 0.9rem;">As escolhas enviadas pelos alunos são computadas e agregadas no widget no canto superior direito.</p>
            </div>
          </main>

          <footer style="display: flex; justify-content: space-between; font-size: 0.85rem; color: #6b7280; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 0.8rem;">
            <span>Farmacoterapia Avançada</span>
            <span>Posologia Interactive Presentation System</span>
          </footer>
        </div>
      `
    },
    {
      id: 'demo-slide-3',
      title: 'Diretrizes Clínicas Recomendadas',
      type: 'conclusion',
      html: `
        <div class="slide-root" style="height: 100%; display: flex; flex-direction: column; justify-content: space-between; background: linear-gradient(135deg, #0d1117 0%, #1f2937 100%); color: #f3f4f6; padding: 2.5rem; border-radius: 1rem; box-sizing: border-box;">
          <header style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1rem;">
            <div>
              <span style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.1em; color: #10b981; font-weight: 700;">CONCLUSÃO DA CONDUTA</span>
              <h2 style="font-size: 2.2rem; font-weight: 800; margin: 0.3rem 0 0 0; background: linear-gradient(90deg, #34d399, #f472b6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Diretrizes Clínicas Recomendadas</h2>
              <p style="margin: 0.2rem 0 0 0; color: #9ca3af; font-size: 1rem;">Passo a passo para otimização farmacoterapêutica individualizada.</p>
            </div>
            <div style="background: rgba(255,255,255,0.05); padding: 0.5rem 1rem; border-radius: 2rem; border: 1px solid rgba(255,255,255,0.1); font-weight: 600; color: #9ca3af;">
              Slide 3/3
            </div>
          </header>

          <main style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; margin: 2rem 0;">
            <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); padding: 1.5rem; border-radius: 1rem;">
              <h3 style="margin: 0 0 0.5rem 0; color: #38bdf8;">1. Monitoramento</h3>
              <p style="margin: 0; font-size: 0.9rem; color: #9ca3af;">Realizar dosagem sérica no tempo de vale (T-trough) após atingir estado de equilíbrio.</p>
            </div>
            <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); padding: 1.5rem; border-radius: 1rem;">
              <h3 style="margin: 0 0 0.5rem 0; color: #34d399;">2. Personalização</h3>
              <p style="margin: 0; font-size: 0.9rem; color: #9ca3af;">Ajustar posologia de acordo com clearance de creatinina e função hepática.</p>
            </div>
            <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); padding: 1.5rem; border-radius: 1rem;">
              <h3 style="margin: 0 0 0.5rem 0; color: #f472b6;">3. Acompanhamento</h3>
              <p style="margin: 0; font-size: 0.9rem; color: #9ca3af;">Reavaliar eficácia a cada 30 dias com retorno do paciente e diário de medicação.</p>
            </div>
          </main>

          <footer style="display: flex; justify-content: space-between; font-size: 0.85rem; color: #6b7280; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 0.8rem;">
            <span>Farmacoterapia Avançada</span>
            <span>Posologia Interactive Presentation System</span>
          </footer>
        </div>
      `
    }
  ]
};
