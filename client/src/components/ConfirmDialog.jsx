import React from 'react';
import { AlertTriangle } from 'lucide-react';

// Substitui window.confirm() nas exclusões (apresentação, pasta, slide) pelo
// mesmo padrão visual dos outros modais do app (.modal-overlay/.modal-card,
// ver ConflictModal.jsx) — mais consistente e permite mensagem/label por
// contexto (ex.: avisar que o item vai pra lixeira, não que é apagado já).
export default function ConfirmDialog({
  isOpen, title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false, onConfirm, onCancel
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{
            background: danger ? 'linear-gradient(135deg, #f59e0b, #ef4444)' : 'rgba(255,255,255,0.08)',
            padding: '0.5rem', borderRadius: '0.5rem', display: 'flex'
          }}>
            <AlertTriangle size={22} color={danger ? '#fff' : 'var(--text-main)'} />
          </div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>{title}</h2>
        </div>

        {message && (
          <p style={{ fontSize: '0.88rem', color: '#9ca3af', marginBottom: '1.5rem', lineHeight: 1.5 }}>{message}</p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
          <button className="btn-secondary" onClick={onCancel}>{cancelLabel}</button>
          <button
            className="btn-primary"
            onClick={onConfirm}
            style={danger ? { background: 'linear-gradient(135deg, #f87171, #ef4444)' } : undefined}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
