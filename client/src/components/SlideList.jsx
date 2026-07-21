import React from 'react';
import { Plus, Trash2 } from 'lucide-react';

export default function SlideList({ slides, activeIndex, onSelectSlide, onAddSlide, onDeleteSlide }) {
  return (
    <div className="sidebar-slides">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', tracking: '0.05em' }}>
          Slides ({slides.length})
        </span>
        <button 
          className="btn-icon" 
          onClick={onAddSlide}
          title="Adicionar Novo Slide Vazio"
          style={{ width: '28px', height: '28px', background: 'rgba(255,255,255,0.08)' }}
        >
          <Plus size={16} />
        </button>
      </div>

      {slides.map((slide, idx) => (
        <div
          key={slide.id || idx}
          className={`slide-thumbnail ${activeIndex === idx ? 'active' : ''}`}
          onClick={() => onSelectSlide(idx)}
        >
          <span className="slide-thumb-num">#{idx + 1}</span>
          
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
