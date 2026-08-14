import React, { useState } from 'react';
import { X, Archive, RotateCcw, Trash2 } from 'lucide-react';
import SlideThumbnail from './SlideThumbnail';
import ConfirmDialog from './ConfirmDialog';

function formatRelativeTime(timestamp) {
  if (!timestamp) return '';
  const diffMinutes = Math.round((Date.now() - timestamp) / 60000);
  if (diffMinutes < 1) return 'agora mesmo';
  if (diffMinutes < 60) return `há ${diffMinutes} min`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `há ${diffHours}h`;
  const diffDays = Math.round(diffHours / 24);
  return `há ${diffDays} dia${diffDays > 1 ? 's' : ''}`;
}

// Lixeira dos slides desta apresentação — os slides apagados ficam guardados
// em `presentation.trashedSlides` (mesmo documento, ver PresentationEditor)
// até serem restaurados ou apagados de vez daqui.
export default function SlideTrashModal({ isOpen, trashedSlides, onClose, onRestore, onDeleteForever, onEmpty }) {
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [confirmIndex, setConfirmIndex] = useState(null);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Archive size={20} /> Lixeira de slides
          </h2>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        {trashedSlides.length === 0 ? (
          <p style={{ color: '#9ca3af', fontSize: '0.88rem' }}>Nenhum slide excluído nesta apresentação.</p>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '50vh', overflowY: 'auto', marginBottom: '1.25rem' }}>
              {trashedSlides.map((slide, idx) => (
                <div key={`${slide.id}-${slide.trashedAt}`} style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-glass)',
                  borderRadius: '0.6rem', padding: '0.5rem'
                }}>
                  <div style={{ width: '90px', height: '50px', flexShrink: 0, borderRadius: '0.4rem', overflow: 'hidden' }}>
                    <SlideThumbnail html={slide.html} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {slide.title || 'Slide sem título'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Excluído {formatRelativeTime(slide.trashedAt)}</div>
                  </div>
                  <button className="btn-icon" title="Restaurar" onClick={() => onRestore(idx)} style={{ width: '30px', height: '30px' }}>
                    <RotateCcw size={15} />
                  </button>
                  <button className="btn-icon danger" title="Excluir definitivamente" onClick={() => setConfirmIndex(idx)} style={{ width: '30px', height: '30px' }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>

            <button className="btn-secondary" onClick={() => setConfirmEmpty(true)} style={{ color: '#f87171' }}>
              <Trash2 size={15} /> Esvaziar lixeira
            </button>
          </>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmIndex !== null}
        title="Excluir definitivamente?"
        message="Este slide não pode mais ser restaurado depois disso."
        confirmLabel="Excluir de vez"
        danger
        onCancel={() => setConfirmIndex(null)}
        onConfirm={() => { onDeleteForever(confirmIndex); setConfirmIndex(null); }}
      />

      <ConfirmDialog
        isOpen={confirmEmpty}
        title="Esvaziar a lixeira?"
        message={`Todos os ${trashedSlides.length} slides serão excluídos definitivamente e não poderão ser restaurados.`}
        confirmLabel="Esvaziar"
        danger
        onCancel={() => setConfirmEmpty(false)}
        onConfirm={() => { onEmpty(); setConfirmEmpty(false); }}
      />
    </div>
  );
}
