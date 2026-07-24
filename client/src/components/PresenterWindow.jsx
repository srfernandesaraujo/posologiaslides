import React, { useState, useEffect } from 'react';
import PresentationViewer from './PresentationViewer';
import { TRANSITION_DEFAULTS, resolveTransition } from '../lib/transitionCatalog';
import { apiFetch } from '../lib/api';
import { Clock, Eye, Sparkles, Search, ChevronRight, ChevronLeft, Lightbulb, MessageSquare, X, Loader2, ExternalLink } from 'lucide-react';

// Extrai só o texto legível do HTML do slide (sem tags/CSS/JS) — usado como
// contexto pro Copiloto de perguntas e pra pesquisa web, pra não gastar tokens
// (nem confundir o modelo) com marcação/estilo/script embutidos no slide.
function extractSlideText(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style').forEach((el) => el.remove());
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

export default function PresenterWindow({
  slides,
  currentIndex,
  atClosingSlide = false,
  closingSlide = null,
  onNext,
  onPrev,
  onClose,
  speakerNotes = ''
}) {
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(true);
  const [webQuery, setWebQuery] = useState('');
  const [webResult, setWebResult] = useState(null);
  const [webWarning, setWebWarning] = useState(null);
  const [webLoading, setWebLoading] = useState(false);

  // Copiloto IA: Sugestões de perguntas instigantes baseadas no slide
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);

  const currentSlide = atClosingSlide ? closingSlide : (slides[currentIndex] || { title: 'Slide Atual', html: '' });
  const nextSlide = atClosingSlide ? null : (slides[currentIndex + 1] || null);
  const activeTransition = atClosingSlide ? TRANSITION_DEFAULTS : resolveTransition(currentSlide?.transition);

  // Timer da Apresentação
  useEffect(() => {
    let interval = null;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setSecondsElapsed(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  // Gera sugestões de perguntas do Copiloto quando o slide muda — pede pra IA
  // perguntas ancoradas no CONTEÚDO REAL deste slide específico (título + texto
  // extraído do HTML), não mais as mesmas 3 perguntas genéricas fixas de sempre.
  useEffect(() => {
    if (!currentSlide) return;
    let cancelled = false;
    setAiLoading(true);

    (async () => {
      try {
        const res = await apiFetch('/api/ai/generate-questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slideTitle: currentSlide.title,
            slideText: extractSlideText(currentSlide.html)
          })
        });
        const data = await res.json();
        if (!cancelled) setAiSuggestions(data.questions || []);
      } catch {
        if (!cancelled) setAiSuggestions([]);
      } finally {
        if (!cancelled) setAiLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [currentIndex]);

  const formatTime = (totalSeconds) => {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Pesquisa real na web (Google Search via grounding do Gemini, ver
  // searchWebForPresenter em aiService.js) — antes era um mock com setTimeout
  // que sempre devolvia 2 respostas de template com o termo buscado só
  // interpolado no meio, nenhuma busca de verdade acontecia.
  const handleWebSearch = async (e) => {
    e.preventDefault();
    if (!webQuery.trim()) return;
    setWebLoading(true);
    setWebResult(null);
    setWebWarning(null);

    try {
      const res = await apiFetch('/api/ai/web-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: webQuery.trim(),
          slideContext: extractSlideText(currentSlide?.html)
        })
      });
      const data = await res.json();
      setWebResult(data.result || null);
      setWebWarning(data.warning || (data.result ? null : 'Não foi possível pesquisar agora.'));
    } catch {
      setWebWarning('Não foi possível pesquisar agora — verifique sua conexão.');
    } finally {
      setWebLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#090d16', color: '#fff', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Barra de Topo do Apresentador */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.04)', padding: '0.8rem 1.2rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--accent-primary)' }}>
            🎙️ VISÃO DO APRESENTADOR (PRESENTER VIEW)
          </span>
          <span style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
            {atClosingSlide ? 'Encerramento' : `Slide ${currentIndex + 1} de ${slides.length}`}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          {/* Cronômetro */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,0,0,0.4)', padding: '0.4rem 0.8rem', borderRadius: '2rem', border: '1px solid rgba(255,255,255,0.1)' }}>
            <Clock size={16} color="#34d399" />
            <strong style={{ fontSize: '1.1rem', color: '#34d399', fontFamily: 'var(--font-mono)' }}>{formatTime(secondsElapsed)}</strong>
            <button className="btn-icon" onClick={() => setIsTimerRunning(!isTimerRunning)} style={{ width: '24px', height: '24px' }}>
              {isTimerRunning ? '⏸' : '▶'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button className="btn-icon" onClick={onPrev} disabled={!atClosingSlide && currentIndex <= 0}>
              <ChevronLeft size={20} />
            </button>
            <button className="btn-icon" onClick={onNext} disabled={atClosingSlide}>
              <ChevronRight size={20} />
            </button>
          </div>

          <button className="btn-icon" onClick={onClose} title="Fechar Visão do Apresentador">
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Grid Principal da Visão do Apresentador */}
      <div className="presenter-grid">
        {/* Coluna Esquerda: Slide Atual em Grande Escala */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ flex: 1, aspectRatio: '16/9', borderRadius: '0.75rem', overflow: 'hidden', border: '2px solid var(--accent-primary)', position: 'relative' }}>
            <div
              key={`${atClosingSlide ? 'closing' : currentIndex}`}
              className={`slide-transition-wrapper pos-transition-${activeTransition.type}`}
              style={{ '--pos-transition-duration': `${activeTransition.duration}s` }}
            >
              <PresentationViewer htmlContent={currentSlide.html} />
            </div>
            <div style={{ position: 'absolute', top: '10px', left: '10px', background: 'rgba(34,211,238,0.9)', color: '#071019', padding: '0.3rem 0.6rem', borderRadius: '0.4rem', fontSize: '0.75rem', fontWeight: 800 }}>
              EXIBIDO NO TELÃO
            </div>
          </div>

          {/* Notas do Orador */}
          <div className="glass-panel" style={{ padding: '1rem', flex: 0.6 }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#38bdf8', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <MessageSquare size={16} /> Notas do Orador para este Slide
            </h4>
            <p style={{ fontSize: '0.88rem', color: '#d1d5db', lineHeight: 1.6, margin: 0 }}>
              {speakerNotes || 'Resalte a importância do cálculo posológico. Destaque o ponto em verde no gráfico para a plateia.'}
            </p>
          </div>
        </div>

        {/* Coluna Direita: Próximo Slide + IA Co-Pilot + Busca Web */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Prévia do Próximo Slide */}
          <div className="glass-panel" style={{ padding: '0.8rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
              {atClosingSlide ? 'Próximo Slide' : `Próximo Slide (${currentIndex + 2}/${slides.length})`}
            </div>
            {nextSlide ? (
              <div style={{ aspectRatio: '16/9', borderRadius: '0.5rem', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', opacity: 0.85 }}>
                <PresentationViewer htmlContent={nextSlide.html} />
              </div>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280', fontSize: '0.85rem' }}>Fim da Apresentação</div>
            )}
          </div>

          {/* Copiloto de IA: Sugestão de Perguntas Instigantes */}
          <div className="glass-panel" style={{ padding: '1rem', border: '1px solid var(--accent-primary)' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#67e8f9', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Lightbulb size={16} /> Copiloto IA: Perguntas para a Plateia
            </h4>
            {aiLoading ? (
              <div style={{ fontSize: '0.78rem', color: '#67e8f9', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Loader2 size={13} className="animate-spin" /> Pensando em perguntas para este slide...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {aiSuggestions.map((q, idx) => (
                  <div key={idx} style={{ background: 'rgba(34,211,238,0.1)', padding: '0.6rem 0.8rem', borderRadius: '0.5rem', fontSize: '0.82rem', color: '#cffafe', borderLeft: '3px solid var(--accent-primary)' }}>
                    "{q}"
                  </div>
                ))}
                {aiSuggestions.length === 0 && (
                  <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>Não foi possível gerar perguntas para este slide.</div>
                )}
              </div>
            )}
          </div>

          {/* Busca Rápida na Web para Perguntas Difíceis */}
          <div className="glass-panel" style={{ padding: '1rem' }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#38bdf8', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Search size={16} /> Pesquisa Rápida na Web / Fatos
            </h4>
            <form onSubmit={handleWebSearch} style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem' }}>
              <input
                type="text"
                className="chat-input"
                placeholder="Ex: Meia-vida da amiodarona..."
                style={{ fontSize: '0.82rem', padding: '0.4rem 0.7rem' }}
                value={webQuery}
                onChange={(e) => setWebQuery(e.target.value)}
              />
              <button type="submit" className="btn-primary" style={{ padding: '0.4rem 0.7rem' }} disabled={webLoading}>
                <Search size={14} />
              </button>
            </form>

            {webLoading && (
              <div style={{ fontSize: '0.78rem', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Loader2 size={13} className="animate-spin" /> Pesquisando na web...
              </div>
            )}

            {!webLoading && webWarning && (
              <div style={{ fontSize: '0.78rem', color: '#fbbf24' }}>{webWarning}</div>
            )}

            {!webLoading && webResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '220px', overflowY: 'auto' }}>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.6rem 0.7rem', borderRadius: '0.4rem', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '0.8rem', color: '#f3f4f6', lineHeight: 1.5 }}>{webResult.answer}</div>
                </div>
                {webResult.sources?.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Fontes</div>
                    {webResult.sources.map((s, i) => (
                      <a
                        key={i}
                        href={s.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: '0.75rem', color: '#67e8f9', display: 'flex', alignItems: 'center', gap: '0.3rem', textDecoration: 'none' }}
                      >
                        <ExternalLink size={11} style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
