import React, { useState, useEffect, useRef } from 'react';
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
function AnimatedNumber({ value, active }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!active) {
      setDisplay(0);
      return undefined;
    }
    const startTime = performance.now();
    const duration = 800;
    let frameId;

    const tick = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(value * eased));
      if (progress < 1) frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [active, value]);

  return display;
}

export default function Login() {
  const { login } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [statsRef, statsInView] = useReveal(0.3);
  const [stepsRef, stepsInView] = useReveal(0.2);
  const [featuresRef, featuresInView] = useReveal(0.15);
  const [chartRef, chartInView] = useReveal(0.3);
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
            <div className="landing-mockup-line title" />
            <div className="landing-mockup-line w-80" />
            <div className="landing-mockup-line w-60" />
            <div className="landing-mockup-line w-40" />
            <div className="landing-mockup-chip"><Wand2 size={12} /> Gerado com IA</div>
          </div>
        </div>
      </section>

      <section ref={statsRef} className={`landing-section reveal ${statsInView ? 'in-view' : ''}`}>
        <div className="stat-grid">
          {STATS.map((s) => (
            <div key={s.label} className={`glass-panel-interactive stat-tile ${s.highlight ? 'highlight' : ''}`}>
              <div className="stat-tile-icon"><s.icon size={17} /></div>
              <div className="stat-value"><AnimatedNumber value={s.value} active={statsInView} /></div>
              <div className="stat-label">{s.label}</div>
            </div>
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
            {QUIZ_BARS.map((b) => (
              <div key={b.label} className="chart-bar-col">
                <div
                  className="chart-bar"
                  style={{ height: chartInView ? `${b.value}%` : 0, background: b.color }}
                />
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
