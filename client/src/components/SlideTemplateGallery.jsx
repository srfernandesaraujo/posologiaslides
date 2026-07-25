import React, { useRef, useState, useEffect } from 'react';
import {
  X, LayoutTemplate, Type, Heading1, Image, BarChart3, Activity, LayoutGrid,
  StickyNote, Columns2, Hash, Workflow, History, Layers, Quote, CheckCircle2, Stethoscope
} from 'lucide-react';
import SlideThumbnail from './SlideThumbnail';
import { SLIDE_TEMPLATE_CATALOG } from '../lib/slideTemplateCatalog';

const ICONS = {
  Type, Heading1, Image, BarChart3, Activity, LayoutGrid,
  StickyNote, Columns2, Hash, Workflow, History, Layers, Quote, CheckCircle2, Stethoscope
};

// Só monta a prévia real (iframe sandboxed, ver PresentationViewer.jsx) quando
// o card entra na viewport — mesma técnica de LazySlidePreview em
// SlideList.jsx, necessária aqui pelo mesmo motivo: montar as ~14 prévias de
// uma vez (cada uma carregando fonte + Chart.js) de cara seria pesado.
function LazyTemplatePreview({ html }) {
  const ref = useRef(null);
  const [hasBeenVisible, setHasBeenVisible] = useState(false);

  useEffect(() => {
    if (hasBeenVisible || !ref.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setHasBeenVisible(true);
      },
      { rootMargin: '300px' }
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

export default function SlideTemplateGallery({ isOpen, onClose, onSelectTemplate }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        style={{ maxWidth: '1040px', width: '95%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'linear-gradient(135deg, #22d3ee, #a78bfa)', padding: '0.5rem', borderRadius: '0.5rem' }}>
              <LayoutTemplate size={24} color="#071019" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>Templates de Slide</h2>
              <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 0 }}>Escolha um layout pronto e só preencha o conteúdo</p>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '1rem'
          }}
        >
          {SLIDE_TEMPLATE_CATALOG.map((tpl) => {
            const Icon = ICONS[tpl.iconName] || LayoutTemplate;
            const html = tpl.buildHtml();
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => onSelectTemplate(html, tpl.title)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  textAlign: 'left',
                  padding: 0,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '0.6rem',
                  overflow: 'hidden',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent-primary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
              >
                <LazyTemplatePreview html={html} />
                <div style={{ padding: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.25rem' }}>
                    <Icon size={15} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e5e7eb' }}>{tpl.title}</span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#9ca3af', lineHeight: 1.4 }}>{tpl.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
