import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Presentation, LogIn, Wand2, Users, Tv, PenTool, BarChart3,
  Image as ImageIcon, Sparkles
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Fatos reais sobre o produto (não métricas de uso) — animados no painel de estatísticas
const STATS = [
  { icon: Wand2, value: 4, label: 'Formas de gerar com IA', highlight: true },
  { icon: Sparkles, value: 6, label: 'Recursos interativos' },
  { icon: PenTool, value: 5, label: 'Ferramentas de anotação' },
  { icon: Users, value: 2, label: 'Telas conectadas ao vivo' }
];

const STEPS = [
  { title: 'Descreva ou anexe', desc: 'Digite um tema, ou envie um PDF, um link ou imagens de referência.' },
  { title: 'A IA monta o deck', desc: 'Slides completos, com gráficos e diagramas, prontos em segundos.' },
  { title: 'Apresente e engaje', desc: 'Tela cheia, quiz e nuvem de palavras ao vivo, relatório da aula ao final.' }
];

const FEATURES = [
  { icon: Wand2, title: 'Geração com IA', desc: 'Crie um deck completo a partir de um tema, PDF, link ou imagens em poucos segundos.' },
  { icon: Users, title: 'Interatividade ao vivo', desc: 'Alunos entram pelo celular com um PIN e respondem quiz ou nuvem de palavras em tempo real.' },
  { icon: Tv, title: 'Modo Apresentador', desc: 'Notas do orador e um copiloto de IA sugerindo perguntas para engajar a plateia.' },
  { icon: PenTool, title: 'Anotação ao vivo', desc: 'Desenhe, destaque e use o apontador laser direto sobre o slide durante a aula.' },
  { icon: BarChart3, title: 'Relatórios de engajamento', desc: 'Métricas reais da sessão: duração, participantes e respostas da turma.' },
  { icon: ImageIcon, title: 'Mídia embutida', desc: 'Imagens, vídeos e páginas incorporadas direto nos slides gerados.' }
];

// Prévia ilustrativa de respostas de quiz (não são dados reais de uso)
const QUIZ_BARS = [
  { label: 'A', value: 72, color: '#ef4444' },
  { label: 'B', value: 45, color: '#3b82f6' },
  { label: 'C', value: 88, color: '#f59e0b' },
  { label: 'D', value: 60, color: '#10b981' }
];

// Curva de concentração plasmática (modelo de 1 compartimento, absorção de 1ª ordem)
// usada só como prévia ilustrativa de diagrama farmacológico animado.
const PK_MIN_DOSE = 250;
const PK_MAX_DOSE = 1000;
const PK_KA = 1.4;
const PK_KE = 0.22;
const PK_VD = 32;
const PK_T_MAX = 12;
const PK_POINTS = 48;
const PK_VIEW_W = 300;
const PK_VIEW_H = 150;
const PK_PAD = { left: 8, right: 8, top: 18, bottom: 22 };

function pkConcentration(dose, t) {
  return (dose * PK_KA) / (PK_VD * (PK_KA - PK_KE)) * (Math.exp(-PK_KE * t) - Math.exp(-PK_KA * t));
}

// Tempo do pico é constante nesse modelo (não depende da dose) — usado para normalizar o eixo Y.
const PK_T_PEAK = Math.log(PK_KA / PK_KE) / (PK_KA - PK_KE);
const PK_C_REF = pkConcentration(PK_MAX_DOSE, PK_T_PEAK);

function buildPkPaths(dose) {
  const innerW = PK_VIEW_W - PK_PAD.left - PK_PAD.right;
  const innerH = PK_VIEW_H - PK_PAD.top - PK_PAD.bottom;
  const baselineY = PK_PAD.top + innerH;
  const pts = [];

  for (let i = 0; i <= PK_POINTS; i++) {
    const t = (i / PK_POINTS) * PK_T_MAX;
    const c = pkConcentration(dose, t);
    const x = PK_PAD.left + (t / PK_T_MAX) * innerW;
    const y = PK_PAD.top + innerH - (c / PK_C_REF) * innerH;
    pts.push([x, y]);
  }

  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${(PK_PAD.left + innerW).toFixed(1)},${baselineY.toFixed(1)} L${PK_PAD.left.toFixed(1)},${baselineY.toFixed(1)} Z`;
  const peakIndex = pts.reduce((best, p, i) => (p[1] < pts[best][1] ? i : best), 0);

  return { line, area, peak: pts[peakIndex], baselineY };
}

// Oscila a dose entre min/max continuamente enquanto a seção estiver visível,
// simulando alguém arrastando o slider.
function usePkDose(active) {
  const [dose, setDose] = useState(PK_MIN_DOSE);

  useEffect(() => {
    if (!active) {
      setDose(PK_MIN_DOSE);
      return undefined;
    }
    const period = 3600;
    const start = performance.now();
    let frameId;

    const tick = (now) => {
      const elapsed = now - start;
      const phase = (Math.sin((elapsed / period) * Math.PI * 2 - Math.PI / 2) + 1) / 2;
      setDose(PK_MIN_DOSE + phase * (PK_MAX_DOSE - PK_MIN_DOSE));
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [active]);

  return dose;
}

function PkDemo({ active }) {
  const dose = usePkDose(active);
  const { line, area, peak, baselineY } = useMemo(() => buildPkPaths(dose), [dose]);
  const progress = (dose - PK_MIN_DOSE) / (PK_MAX_DOSE - PK_MIN_DOSE);

  return (
    <div className="pk-demo">
      <svg viewBox={`0 0 ${PK_VIEW_W} ${PK_VIEW_H}`} className="pk-chart" preserveAspectRatio="none">
        <defs>
          <linearGradient id="pkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(34, 211, 238, 0.38)" />
            <stop offset="100%" stopColor="rgba(34, 211, 238, 0)" />
          </linearGradient>
        </defs>
        <line x1={PK_PAD.left} y1={baselineY} x2={PK_VIEW_W - PK_PAD.right} y2={baselineY} className="pk-axis" />
        <path d={area} fill="url(#pkFill)" className="pk-area" />
        <path d={line} className="pk-line" />
        <circle cx={peak[0]} cy={peak[1]} r="3.5" className="pk-cmax-dot" />
        <text x={peak[0]} y={peak[1] - 10} textAnchor="middle" className="pk-cmax-label">Cmax</text>
      </svg>
      <div className="pk-slider-row">
        <span className="pk-slider-tag">Dose</span>
        <div className="pk-slider-track">
          <div className="pk-slider-fill" style={{ width: `${progress * 100}%` }} />
          <div className="pk-slider-thumb" style={{ left: `${progress * 100}%` }} />
        </div>
        <span className="pk-slider-value">{Math.round(dose)} mg</span>
      </div>
    </div>
  );
}

// Observa quando a seção entra/sai da viewport — isVisible reflete o estado atual
// em ambas as direções, o que produz o fade-in/fade-out ao rolar a página.
function useReveal(threshold = 0.15) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold });
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return [ref, inView];
}

// Conta de 0 até `value` toda vez que `active` vira true (ex.: seção reentra na viewport)
function AnimatedNumber({ value, active, duration = 800, delay = 0 }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!active) {
      setDisplay(0);
      return undefined;
    }
    let frameId;
    const startTimer = setTimeout(() => {
      const startTime = performance.now();
      const tick = (now) => {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplay(Math.round(value * eased));
        if (progress < 1) frameId = requestAnimationFrame(tick);
      };
      frameId = requestAnimationFrame(tick);
    }, delay);

    return () => {
      clearTimeout(startTimer);
      cancelAnimationFrame(frameId);
    };
  }, [active, value, duration, delay]);

  return display;
}

// Roda por ~3 rodadas de números aleatórios ("caça-níquel") e só então trava no valor
// real, avisando o pai via onSettle para disparar o piscar 2x do card.
function RollingNumber({ value, active, onSettle }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!active) {
      setDisplay(0);
      return undefined;
    }
    const rollStep = 130;
    const spread = Math.max(value * 3, 9);
    const timers = [];

    for (let round = 0; round < 3; round++) {
      timers.push(setTimeout(() => {
        setDisplay(1 + Math.floor(Math.random() * spread));
      }, round * rollStep));
    }

    timers.push(setTimeout(() => {
      setDisplay(value);
      onSettle?.();
    }, 3 * rollStep));

    return () => timers.forEach(clearTimeout);
  }, [active, value]);

  return display;
}

function StatTile({ stat, active }) {
  const [flash, setFlash] = useState(false);

  const handleSettle = () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 560);
  };

  return (
    <div className={`glass-panel-interactive stat-tile ${stat.highlight ? 'highlight' : ''} ${flash ? 'flash-twice' : ''}`}>
      <div className="stat-tile-icon"><stat.icon size={17} /></div>
      <div className="stat-value"><RollingNumber value={stat.value} active={active} onSettle={handleSettle} /></div>
      <div className="stat-label">{stat.label}</div>
    </div>
  );
}

export default function Login() {
  const { login } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [statsRef, statsInView] = useReveal(0.3);
  const [stepsRef, stepsInView] = useReveal(0.2);
  const [featuresRef, featuresInView] = useReveal(0.15);
  const [chartRef, chartInView] = useReveal(0.3);
  const [pkRef, pkInView] = useReveal(0.3);
  const [ctaRef, ctaInView] = useReveal(0.15);

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await login();
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError('Não foi possível entrar com essa conta Google.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="landing-page">
      <nav className="landing-nav">
        <div className="landing-nav-brand">
          <Presentation size={22} color="var(--accent-primary)" />
          Posologia Slides
        </div>
        <button className="btn-primary" onClick={handleLogin} disabled={loading}>
          <LogIn size={16} /> {loading ? 'Entrando...' : 'Entrar com Google'}
        </button>
      </nav>

      <section className="landing-hero">
        <div className="ambient-glow" />

        <div className="landing-hero-copy">
          <div className="landing-badge"><Sparkles size={13} /> Slides gerados por IA</div>
          <h1>Crie apresentações interativas com IA em minutos</h1>
          <p>
            Descreva um tema, anexe um PDF ou um link — a IA monta o deck completo.
            Depois, apresente ao vivo e engaje a turma com quiz, nuvem de palavras e muito mais.
          </p>
          <div className="landing-hero-actions">
            <button className="btn-primary" onClick={handleLogin} disabled={loading}>
              <LogIn size={18} /> {loading ? 'Entrando...' : 'Entrar com Google'}
            </button>
          </div>
          {error && <p style={{ color: '#f87171', fontSize: '0.85rem', marginTop: '1rem' }}>{error}</p>}
        </div>

        <div className="glass-panel landing-mockup-card">
          <div className="landing-mockup-header">
            <span className="landing-mockup-dot" />
            <span className="landing-mockup-dot" />
            <span className="landing-mockup-dot" />
          </div>
          <div className="landing-mockup-slide">
            <div className="landing-mockup-shimmer" />
            <div className="landing-mockup-line title loading" />
            <div className="landing-mockup-line w-80 loading" style={{ animationDelay: '0.15s' }} />
            <div className="landing-mockup-line w-60 loading" style={{ animationDelay: '0.3s' }} />
            <div className="landing-mockup-line w-40 loading" style={{ animationDelay: '0.45s' }} />
            <div className="landing-mockup-chip"><Wand2 size={12} /> Gerado com IA</div>
          </div>
        </div>
      </section>

      <section ref={statsRef} className={`landing-section reveal ${statsInView ? 'in-view' : ''}`}>
        <div className="stat-grid">
          {STATS.map((s) => (
            <StatTile key={s.label} stat={s} active={statsInView} />
          ))}
        </div>
      </section>

      <section ref={stepsRef} className={`landing-section reveal ${stepsInView ? 'in-view' : ''}`}>
        <div className="section-eyebrow">Como funciona</div>
        <h2 className="section-title">Do tema ao slide pronto, em 3 passos</h2>
        <p className="section-sub">Sem modelo pra montar do zero — a IA já entrega o deck estruturado.</p>
        <div className="steps-grid">
          {STEPS.map((s, i) => (
            <div key={s.title} className="glass-panel-interactive step-card">
              <div className="step-number">{String(i + 1).padStart(2, '0')}</div>
              <div className="step-title">{s.title}</div>
              <div className="step-desc">{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section ref={featuresRef} className={`landing-section reveal ${featuresInView ? 'in-view' : ''}`}>
        <div className="section-eyebrow">Recursos</div>
        <h2 className="section-title">O que você pode fazer</h2>
        <p className="section-sub">Tudo pensado pra sala de aula: gerar, apresentar e engajar, sem sair do navegador.</p>
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="glass-panel-interactive feature-card">
              <div className="feature-card-icon"><f.icon size={18} /></div>
              <div className="feature-card-title">{f.title}</div>
              <div className="feature-card-desc">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section ref={chartRef} className={`landing-section reveal ${chartInView ? 'in-view' : ''}`}>
        <div className="section-eyebrow">Interatividade ao vivo</div>
        <h2 className="section-title">Engajamento em tempo real</h2>
        <p className="section-sub">
          Prévia ilustrativa: assim que a turma responde pelo celular, as respostas do quiz aparecem aqui na hora.
        </p>
        <div className="glass-panel chart-mock-card">
          <div className="chart-mock-bars">
            {QUIZ_BARS.map((b, i) => (
              <div key={b.label} className="chart-bar-col">
                <div
                  className="chart-bar"
                  style={{
                    height: chartInView ? `${b.value}%` : 0,
                    background: b.color,
                    transitionDelay: `${i * 0.15}s`
                  }}
                >
                  <span className="chart-bar-percent">
                    <AnimatedNumber value={b.value} active={chartInView} duration={1600} delay={i * 150} />%
                  </span>
                </div>
                <div className="chart-bar-label">{b.label}</div>
              </div>
            ))}
          </div>
          <div className="chart-mock-legend">
            <div className="chart-legend-value">4 alternativas</div>
            <div className="chart-legend-label">
              Quiz, nuvem de palavras e relatório de participação — tudo direto na sua tela de apresentador.
            </div>
          </div>
        </div>
      </section>

      <section ref={pkRef} className={`landing-section reveal ${pkInView ? 'in-view' : ''}`}>
        <div className="section-eyebrow">Diagramas dinâmicos</div>
        <h2 className="section-title">Gráficos que reagem aos parâmetros</h2>
        <p className="section-sub">
          Prévia ilustrativa: em disciplinas como farmacologia, os diagramas gerados podem responder a um
          slider ao vivo — aqui, a curva de concentração plasmática muda conforme a dose.
        </p>
        <div className="glass-panel pk-demo-card">
          <PkDemo active={pkInView} />
        </div>
      </section>

      <section ref={ctaRef} className={`landing-cta-section reveal ${ctaInView ? 'in-view' : ''}`}>
        <div className="glass-panel" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', maxWidth: '360px', textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 600 }}>Entre para acessar suas apresentações</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Suas pastas e apresentações ficam salvas na sua conta e isoladas de outros professores.
          </p>
          <button className="btn-primary" onClick={handleLogin} disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
            <LogIn size={18} /> {loading ? 'Entrando...' : 'Entrar com Google'}
          </button>
        </div>
      </section>
    </div>
  );
}
