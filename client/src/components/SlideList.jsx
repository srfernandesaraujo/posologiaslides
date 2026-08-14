import React, { useRef, useState, useEffect } from 'react';
import { Plus, Trash2, X, GripVertical, LayoutTemplate, Copy, Sparkles, Code, Eye, EyeOff, Wand2, Archive } from 'lucide-react';
import SlideThumbnail from './SlideThumbnail';
import ConfirmDialog from './ConfirmDialog';

// Só monta a prévia real (iframe sandboxed com fontes/Chart.js, ver
// PresentationViewer.jsx) quando o cartão entra na viewport, e mantém montada
// depois disso (a flag nunca volta a false) — com dezenas de slides, renderizar
// todas as prévias de uma vez seria pesado; carregar sob demanda enquanto o
// professor rola a lista resolve isso sem precisar desmontar/remontar à toa.
function LazySlidePreview({ html }) {
  const ref = useRef(null);
  const [hasBeenVisible, setHasBeenVisible] = useState(false);

  useEffect(() => {
    if (hasBeenVisible || !ref.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setHasBeenVisible(true);
      },
      { rootMargin: '400px' }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [hasBeenVisible]);

  return (
    <div ref={ref} style={{ width: '100%', height: '100%' }}>
      {hasBeenVisible && <SlideThumbnail html={html} />}
    </div>
  );
}

export default function SlideList({ slides, activeIndex, onSelectSlide, onAddSlide, onAddTemplate, onAddSlideWithAI, onAddSlideWithCode, onOpenPromptGenerator, onInsertSlideAfter, onDeleteSlide, onDuplicateSlide, onToggleHideSlide, onReorderSlides, trashedSlidesCount = 0, onOpenSlideTrash, className = '', onClose, style }) {
  const listRef = useRef(null);
  // Índice sendo arrastado e índice "bruto" (antes do ajuste de deslocamento,
  // ver handlePointerUp) sobre o qual o ponteiro está no momento — null
  // quando não há arrasto em andamento.
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  // Índice do slide pendente de confirmação de exclusão, ou null — apagar
  // slide não é mais instantâneo (ver ConfirmDialog abaixo), mas o slide vai
  // pra lixeira desta apresentação (PresentationEditor#onDeleteSlide), não
  // some de vez.
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState(null);

  // Acha, pela posição vertical do ponteiro, onde o slide arrastado cairia —
  // comparando com o retângulo real de cada miniatura (via getBoundingClientRect,
  // não algum cálculo de layout assumido), o que funciona igual na lista fixa
  // do desktop e na gaveta off-canvas do mobile (só transladada via CSS).
  const findOverIndex = (clientY) => {
    const items = listRef.current?.querySelectorAll('[data-slide-index]');
    if (!items || items.length === 0) return null;
    for (const item of items) {
      const rect = item.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        return Number(item.dataset.slideIndex);
      }
    }
    return items.length; // depois do último slide
  };

  const handleGripPointerDown = (e, idx) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragIndex(idx);
    setOverIndex(idx);
  };

  const handleGripPointerMove = (e) => {
    if (dragIndex === null) return;
    const next = findOverIndex(e.clientY);
    if (next !== null) setOverIndex(next);
  };

  const endDrag = (e) => {
    if (dragIndex === null) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (overIndex !== null && overIndex !== dragIndex) {
      // `overIndex` foi calculated contra a lista ainda intacta ("insira antes
      // deste índice"); ao remover o slide arrastado, tudo que vinha depois
      // dele desloca uma posição pra trás — por isso o -1 quando o destino é
      // depois da origem, pra `onReorderSlides` receber a posição final real.
      const toIndex = overIndex > dragIndex ? overIndex - 1 : overIndex;
      onReorderSlides(dragIndex, toIndex);
    }
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <div className={`sidebar-slides ${className}`.trim()} ref={listRef} style={style}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', tracking: '0.05em' }}>
          Slides ({slides.length})
        </span>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            className="btn-icon"
            onClick={onAddSlide}
            title="Adicionar Novo Slide Vazio"
            style={{ width: '28px', height: '28px', background: 'rgba(255,255,255,0.08)' }}
          >
            <Plus size={16} />
          </button>
          {onAddTemplate && (
            <button
              className="btn-icon"
              onClick={onAddTemplate}
              title="Adicionar Slide a partir de um Template"
              style={{ width: '28px', height: '28px', background: 'rgba(255,255,255,0.08)' }}
            >
              <LayoutTemplate size={16} />
            </button>
          )}
          {onAddSlideWithAI && (
            <button
              className="btn-icon"
              onClick={onAddSlideWithAI}
              title="Adicionar Slide com IA (prompt + arquivo de referência)"
              style={{ width: '28px', height: '28px', background: 'rgba(255,255,255,0.08)' }}
            >
              <Sparkles size={16} />
            </button>
          )}
          {onAddSlideWithCode && (
            <button
              className="btn-icon"
              onClick={onAddSlideWithCode}
              title="Criar / Inserir Slide por Código (HTML/JSON/Markdown)"
              style={{ width: '28px', height: '28px', background: 'rgba(255,255,255,0.08)' }}
            >
              <Code size={16} />
            </button>
          )}
          {onOpenPromptGenerator && (
            <button
              className="btn-icon"
              onClick={onOpenPromptGenerator}
              title="Gerar Prompt pro Gemini Canvas (a partir de uma imagem)"
              style={{ width: '28px', height: '28px', background: 'rgba(255,255,255,0.08)' }}
            >
              <Wand2 size={16} />
            </button>
          )}
          {onOpenSlideTrash && (
            <button
              className="btn-icon"
              onClick={onOpenSlideTrash}
              title="Lixeira de slides desta apresentação"
              style={{ width: '28px', height: '28px', background: 'rgba(255,255,255,0.08)', position: 'relative' }}
            >
              <Archive size={16} />
              {trashedSlidesCount > 0 && (
                <span style={{
                  position: 'absolute', top: '-4px', right: '-4px', background: '#ef4444', color: '#fff',
                  borderRadius: '50%', minWidth: '15px', height: '15px', padding: '0 3px', fontSize: '0.6rem', fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {trashedSlidesCount}
                </span>
              )}
            </button>
          )}
          {onClose && (
            <button
              className="btn-icon mobile-toggle-btn"
              onClick={onClose}
              title="Fechar"
              style={{ width: '28px', height: '28px' }}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {slides.map((slide, idx) => (
        <div
          key={slide.id || idx}
          data-slide-index={idx}
          className={[
            'slide-thumbnail',
            activeIndex === idx ? 'active' : '',
            slide.hidden ? 'is-hidden-slide' : '',
            dragIndex === idx ? 'dragging' : '',
            dragIndex !== null && dragIndex !== idx && overIndex === idx ? 'drop-before' : '',
            dragIndex !== null && dragIndex !== idx && overIndex === idx + 1 && idx === slides.length - 1 ? 'drop-after' : ''
          ].filter(Boolean).join(' ')}
          style={slide.hidden ? { opacity: 0.75 } : {}}
          onClick={() => onSelectSlide(idx)}
        >
          <div className="slide-thumb-preview" style={{ position: 'relative' }}>
            <LazySlidePreview html={slide.html} />

            {slide.hidden && (
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.75)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.2rem',
                color: '#f87171',
                pointerEvents: 'none',
                zIndex: 2
              }}>
                <EyeOff size={22} />
                <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Oculto</span>
              </div>
            )}

            <span className="slide-thumb-num">#{idx + 1}</span>

            <button
              type="button"
              className="slide-thumb-handle"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => handleGripPointerDown(e, idx)}
              onPointerMove={handleGripPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              title="Arrastar para reordenar"
            >
              <GripVertical size={18} />
            </button>

            {onToggleHideSlide && (
              <button
                type="button"
                className="btn-icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleHideSlide(idx);
                }}
                style={{
                  position: 'absolute',
                  bottom: '4px',
                  left: '4px',
                  width: '22px',
                  height: '22px',
                  opacity: slide.hidden ? 1 : 0.6,
                  background: slide.hidden ? 'rgba(239, 68, 68, 0.4)' : 'rgba(0, 0, 0, 0.5)',
                  color: slide.hidden ? '#f87171' : '#fff',
                  zIndex: 3
                }}
                title={slide.hidden ? "Slide oculto — Clicar para exibir na apresentação" : "Ocultar slide na apresentação"}
              >
                {slide.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            )}

            {onDuplicateSlide && (
              <button
                className="btn-icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onDuplicateSlide(idx);
                }}
                style={{
                  position: 'absolute',
                  bottom: '4px',
                  right: slides.length > 1 ? '30px' : '4px',
                  width: '22px',
                  height: '22px',
                  opacity: 0.6,
                  zIndex: 3
                }}
                title="Duplicar Slide"
              >
                <Copy size={12} />
              </button>
            )}

            {slides.length > 1 && (
              <button
                className="btn-icon"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDeleteIndex(idx);
                }}
                style={{
                  position: 'absolute',
                  bottom: '4px',
                  right: '4px',
                  width: '22px',
                  height: '22px',
                  opacity: 0.6,
                  zIndex: 3
                }}
                title="Excluir Slide"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>

          <div className="slide-thumb-caption" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>{slide.title || `Slide ${idx + 1}`}</span>
            {slide.hidden && <span style={{ color: '#f87171', fontSize: '0.7rem', fontWeight: 700 }}>(Oculto)</span>}
          </div>

          {onInsertSlideAfter && (
            <button
              type="button"
              className="slide-insert-btn"
              onClick={(e) => {
                e.stopPropagation();
                onInsertSlideAfter(idx);
              }}
              title="Inserir slide depois deste"
            >
              <Plus size={14} />
            </button>
          )}
        </div>
      ))}

      <ConfirmDialog
        isOpen={confirmDeleteIndex !== null}
        title="Excluir slide?"
        message={`"${slides[confirmDeleteIndex]?.title || `Slide ${(confirmDeleteIndex ?? 0) + 1}`}" vai para a lixeira desta apresentação — dá pra restaurar depois.`}
        confirmLabel="Excluir"
        danger
        onCancel={() => setConfirmDeleteIndex(null)}
        onConfirm={() => {
          onDeleteSlide(confirmDeleteIndex);
          setConfirmDeleteIndex(null);
        }}
      />
    </div>
  );
}
