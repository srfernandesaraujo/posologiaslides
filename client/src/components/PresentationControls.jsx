import React, { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  MousePointer,
  PenTool,
  Highlighter,
  Eraser,
  Zap,
  Trash2,
  Maximize,
  Minimize,
  Lightbulb,
  ZoomIn,
  ZoomOut
} from 'lucide-react';

export default function PresentationControls({
  currentIndex,
  totalSlides,
  atClosingSlide = false,
  onPrev,
  onNext,
  activeTool,
  setActiveTool,
  activeColor,
  setActiveColor,
  onClearDrawing,
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

  // Efeito para autohide da barra quando inativo no modo tela cheia
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

  // Navegação por atalhos de teclado (Seta Esquerda/Direita, Espaço, PageUp/PageDown)
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
        // página e pode nem deixar o JS interceptar) — mesma convenção sem
        // modificador já usada pelos outros atalhos desta barra.
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

  const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#ffffff'];

  return (
    <div className={`floating-toolbar ${autohide ? 'autohide' : ''}`}>
      {/* Navegação de Slides */}
      <button className="btn-icon" onClick={onPrev} disabled={!atClosingSlide && currentIndex <= 0} title="Slide Anterior (Seta Esquerda)">
        <ChevronLeft size={20} />
      </button>

      <span style={{ fontSize: '0.85rem', fontWeight: 700, padding: '0 0.5rem', color: '#9ca3af', whiteSpace: 'nowrap', flexShrink: 0 }}>
        {atClosingSlide ? 'Encerramento' : `${currentIndex + 1} / ${totalSlides}`}
      </span>

      <button className="btn-icon" onClick={onNext} disabled={atClosingSlide} title="Próximo Slide (Seta Direita / Espaço)">
        <ChevronRight size={20} />
      </button>

      <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.15)', margin: '0 0.4rem' }} />

      {/* Ferramentas de Desenho / Interatividade */}
      <button 
        className={`btn-icon ${activeTool === 'pointer' ? 'active' : ''}`}
        onClick={() => setActiveTool('pointer')}
        title="Modo Interativo (Clicar no Slide)"
      >
        <MousePointer size={18} />
      </button>

      <button 
        className={`btn-icon ${activeTool === 'pen' ? 'active' : ''}`}
        onClick={() => setActiveTool('pen')}
        title="Caneta de Anotação"
      >
        <PenTool size={18} />
      </button>

      <button 
        className={`btn-icon ${activeTool === 'highlighter' ? 'active' : ''}`}
        onClick={() => setActiveTool('highlighter')}
        title="Marca-texto"
      >
        <Highlighter size={18} />
      </button>

      <button 
        className={`btn-icon ${activeTool === 'laser' ? 'active' : ''}`}
        onClick={() => setActiveTool('laser')}
        title="Apontador Laser"
      >
        <Zap size={18} />
      </button>

      <button 
        className={`btn-icon ${activeTool === 'eraser' ? 'active' : ''}`}
        onClick={() => setActiveTool('eraser')}
        title="Borracha"
      >
        <Eraser size={18} />
      </button>

      <button 
        className="btn-icon"
        onClick={onClearDrawing}
        title="Limpar Anotações da Tela"
      >
        <Trash2 size={18} />
      </button>

      {/* Seletor de Cores quando caneta/marca-texto ativo */}
      {(activeTool === 'pen' || activeTool === 'highlighter') && (
        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', marginLeft: '0.4rem' }}>
          {colors.map((c) => (
            <button
              key={c}
              onClick={() => setActiveColor(c)}
              style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                backgroundColor: c,
                border: activeColor === c ? '2px solid #fff' : 'none',
                cursor: 'pointer',
                boxShadow: activeColor === c ? `0 0 8px ${c}` : 'none'
              }}
            />
          ))}
        </div>
      )}

      {/* Modo Destaque: escurece os demais elementos do slide ao tocar num —
          botão independente (não é um "activeTool"), pra poder ficar ligado
          ao mesmo tempo que o laser/caneta em vez de competir com eles. */}
      <button
        className={`btn-icon ${spotlightOn ? 'active' : ''}`}
        onClick={onToggleSpotlight}
        title="Modo Destaque (escurece os demais elementos ao tocar um)"
      >
        <Lightbulb size={18} />
      </button>

      {/* Zoom manual — funciona nos dois modos (esta barra já é a mesma nos
          dois). "-"/"+" mudam o nível; clicar na porcentagem reseta pra 100%. */}
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

      {/* Botão de Tela Cheia */}
      <button className="btn-icon" onClick={toggleFullscreen} title="Tela Cheia (Atalho F)">
        {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
      </button>
    </div>
  );
}
