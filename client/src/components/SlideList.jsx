import React, { useRef, useState } from 'react';
import { Plus, Trash2, X, GripVertical } from 'lucide-react';

export default function SlideList({ slides, activeIndex, onSelectSlide, onAddSlide, onDeleteSlide, onReorderSlides, className = '', onClose }) {
  const listRef = useRef(null);
  // Índice sendo arrastado e índice "bruto" (antes do ajuste de deslocamento,
  // ver handlePointerUp) sobre o qual o ponteiro está no momento — null
  // quando não há arrasto em andamento.
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

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
      // `overIndex` foi calculado contra a lista ainda intacta ("insira antes
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
    <div className={`sidebar-slides ${className}`.trim()} ref={listRef}>
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
            dragIndex === idx ? 'dragging' : '',
            dragIndex !== null && dragIndex !== idx && overIndex === idx ? 'drop-before' : '',
            dragIndex !== null && dragIndex !== idx && overIndex === idx + 1 && idx === slides.length - 1 ? 'drop-after' : ''
          ].filter(Boolean).join(' ')}
          onClick={() => onSelectSlide(idx)}
        >
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

          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#e5e7eb', marginTop: '1.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {slide.title || `Slide ${idx + 1}`}
          </div>

          <div style={{ fontSize: '0.65rem', color: '#6b7280', marginTop: '0.2rem' }}>
            Página HTML Interativa
          </div>

          {slides.length > 1 && (
            <button
              className="btn-icon"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteSlide(idx);
              }}
              style={{
                position: 'absolute',
                bottom: '4px',
                right: '4px',
                width: '22px',
                height: '22px',
                opacity: 0.6
              }}
              title="Excluir Slide"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
