import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize, Minimize, Lightbulb } from 'lucide-react';

// Versão enxuta de PresentationControls.jsx pro visualizador público
// (PublicPresentationView.jsx) — só navegação, destaque e tela cheia. Sem as
// ferramentas de desenho (pen/highlighter/laser/eraser), que não fazem
// sentido pro aluno sozinho revendo o conteúdo.
export default function PublicViewerControls({
  currentIndex,
  totalSlides,
  onPrev,
  onNext,
  isFullscreen,
  toggleFullscreen,
  spotlightOn,
  onToggleSpotlight
}) {
  const [autohide, setAutohide] = useState(false);

  useEffect(() => {
    let timer;
    const handleMouseMove = () => {
      setAutohide(false);
      clearTimeout(timer);
      if (isFullscreen) {
        timer = setTimeout(() => setAutohide(true), 3500);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      clearTimeout(timer);
    };
  }, [isFullscreen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'ArrowRight' || e.key === 'Space' || e.key === 'PageDown') {
        e.preventDefault();
        onNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        onPrev();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onPrev, onNext, toggleFullscreen]);

  return (
    <div className={`floating-toolbar ${autohide ? 'autohide' : ''}`}>
      <button className="btn-icon" onClick={onPrev} disabled={currentIndex <= 0} title="Slide Anterior (Seta Esquerda)">
        <ChevronLeft size={20} />
      </button>

      <span style={{ fontSize: '0.85rem', fontWeight: 700, padding: '0 0.5rem', color: '#9ca3af', whiteSpace: 'nowrap', flexShrink: 0 }}>
        {currentIndex + 1} / {totalSlides}
      </span>

      <button className="btn-icon" onClick={onNext} disabled={currentIndex >= totalSlides - 1} title="Próximo Slide (Seta Direita / Espaço)">
        <ChevronRight size={20} />
      </button>

      <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.15)', margin: '0 0.4rem' }} />

      <button
        className={`btn-icon ${spotlightOn ? 'active' : ''}`}
        onClick={onToggleSpotlight}
        title="Modo Destaque (escurece os demais elementos ao tocar um)"
      >
        <Lightbulb size={18} />
      </button>

      <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.15)', margin: '0 0.4rem' }} />

      <button className="btn-icon" onClick={toggleFullscreen} title="Tela Cheia (Atalho F)">
        {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
      </button>
    </div>
  );
}
