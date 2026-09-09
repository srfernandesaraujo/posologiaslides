import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize, Minimize, Lightbulb, ZoomIn, ZoomOut } from 'lucide-react';

// Versão enxuta de PresentationControls.jsx pro visualizador público
// (PublicPresentationView.jsx) — navegação, destaque, zoom manual e tela
// cheia. Sem as ferramentas de desenho (pen/highlighter/laser/eraser), que
// não fazem sentido pro aluno sozinho revendo o conteúdo.
export default function PublicViewerControls({
  currentIndex,
  totalSlides,
  onPrev,
  onNext,
  isFullscreen,
  toggleFullscreen,
  spotlightOn,
  onToggleSpotlight,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset
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
      } else if (e.key === '+' || e.key === '=') {
        // Sem Ctrl (o navegador reserva Ctrl+/Ctrl- pro próprio zoom da
        // página) — mesma convenção sem modificador dos outros atalhos.
        e.preventDefault();
        onZoomIn();
      } else if (e.key === '-') {
        e.preventDefault();
        onZoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        onZoomReset();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onPrev, onNext, toggleFullscreen, onZoomIn, onZoomOut, onZoomReset]);

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

      {/* Zoom manual — pra ampliar slides densos (ex. dashboards/diagramas)
          enquanto estuda sozinho. "-"/"+" mudam o nível; clicar na
          porcentagem reseta pra 100%. Mesmo padrão de PresentationControls.jsx
          (barra do editor), sem "Ajustar tamanho" nem controle remoto aqui —
          só controle manual, decisão do próprio aluno. */}
      <button className="btn-icon" onClick={onZoomOut} title="Reduzir Zoom (Atalho -)">
        <ZoomOut size={18} />
      </button>
      <button
        onClick={onZoomReset}
        title="Redefinir Zoom para 100% (Atalho 0)"
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, color: '#9ca3af', padding: '0 0.3rem', minWidth: '3rem' }}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button className="btn-icon" onClick={onZoomIn} title="Aumentar Zoom (Atalho +)">
        <ZoomIn size={18} />
      </button>

      <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.15)', margin: '0 0.4rem' }} />

      <button className="btn-icon" onClick={toggleFullscreen} title="Tela Cheia (Atalho F)">
        {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
      </button>
    </div>
  );
}
