import React, { useState, useEffect } from 'react';
import PresentationViewer from './PresentationViewer';
import { Clock, Eye, Sparkles, Search, ChevronRight, ChevronLeft, Lightbulb, MessageSquare } from 'lucide-react';

export default function PresenterWindow({
  slides,
  currentIndex,
  onSelectSlide,
  speakerNotes = ''
}) {
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(true);
  const [webQuery, setWebQuery] = useState('');
  const [webResults, setWebResults] = useState(null);
  const [webLoading, setWebLoading] = useState(false);

  // Copiloto IA: Sugestões de perguntas instigantes baseadas no slide
  const [aiSuggestions, setAiSuggestions] = useState([]);

  const currentSlide = slides[currentIndex] || { title: 'Slide Atual', html: '' };
  const nextSlide = slides[currentIndex + 1] || null;

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

  // Gera sugestões de perguntas do Copiloto quando o slide muda
  useEffect(() => {
    if (!currentSlide) return;
    generateAiQuestionsForSlide(currentSlide);
  }, [currentIndex]);

  const generateAiQuestionsForSlide = (slide) => {
    const title = slide.title || 'Slide';
    // Sugestões inteligentes de perguntas instigantes
    setAiSuggestions([
      `"Qual seria a primeira conduta clínica que vocês tomariam diante dos dados deste slide?"`,
      `"Alguém saberia me dizer qual a principal complicação se não seguirmos este protocolo?"`,
      `"Como essa evidência se relaciona com o caso clínico discutido na aula anterior?"`
    ]);
  };

  const formatTime = (totalSeconds) => {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleWebSearch = async (e) => {
    e.preventDefault();
    if (!webQuery.trim()) return;
    setWebLoading(true);

    try {
      // Simula busca rápida de artigos/evidências científicas
      setTimeout(() => {
        setWebResults([
          { title: `Diretrizes Atualizadas 2026: ${webQuery}`, snippet: `Estudos clínicos recentes indicam uma taxa de eficácia de 89% no tratamento primário.` },
          { title: `Revisão Farmacológica: ${webQuery}`, snippet: `Mecanismo de ação envolve inibição seletiva de receptores específicos com meia-vida prolongada.` }
        ]);
        setWebLoading(false);
      }, 800);
    } catch (err) {
      setWebLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#090d16', color: '#fff', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Barra de Topo do Apresentador */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.04)', padding: '0.8rem 1.2rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '1rem', fontWeight: 800, color: '#a855f7' }}>
            🎙️ VISÃO DO APRESENTADOR (PRESENTER VIEW)
          </span>
          <span style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
            Slide {currentIndex + 1} de {slides.length}
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
            <button className="btn-icon" onClick={() => onSelectSlide(currentIndex - 1)} disabled={currentIndex <= 0}>
              <ChevronLeft size={20} />
            </button>
            <button className="btn-icon" onClick={() => onSelectSlide(currentIndex + 1)} disabled={currentIndex >= slides.length - 1}>
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Grid Principal da Visão do Apresentador */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1.5rem', flex: 1 }}>
        {/* Coluna Esquerda: Slide Atual em Grande Escala */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ flex: 1, aspectRatio: '16/9', borderRadius: '0.75rem', overflow: 'hidden', border: '2px solid #a855f7', position: 'relative' }}>
            <PresentationViewer htmlContent={currentSlide.html} />
            <div style={{ position: 'absolute', top: '10px', left: '10px', background: 'rgba(168,85,247,0.9)', color: '#fff', padding: '0.3rem 0.6rem', borderRadius: '0.4rem', fontSize: '0.75rem', fontWeight: 800 }}>
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
              Próximo Slide ({currentIndex + 2}/{slides.length})
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
          <div className="glass-panel" style={{ padding: '1rem', border: '1px solid #a855f7' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#c084fc', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Lightbulb size={16} /> Copiloto IA: Perguntas para a Plateia
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {aiSuggestions.map((q, idx) => (
                <div key={idx} style={{ background: 'rgba(168,85,247,0.1)', padding: '0.6rem 0.8rem', borderRadius: '0.5rem', fontSize: '0.82rem', color: '#e9d5ff', borderLeft: '3px solid #a855f7' }}>
                  {q}
                </div>
              ))}
            </div>
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
              <button type="submit" className="btn-primary" style={{ padding: '0.4rem 0.7rem' }}>
                <Search size={14} />
              </button>
            </form>

            {webLoading && <div style={{ fontSize: '0.78rem', color: '#38bdf8' }}>Buscando evidências na web...</div>}

            {webResults && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '120px', overflowY: 'auto' }}>
                {webResults.map((r, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.03)', padding: '0.5rem', borderRadius: '0.4rem', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f3f4f6' }}>{r.title}</div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{r.snippet}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
