import React from 'react';
import { AlertTriangle, Download, CloudDownload, Save } from 'lucide-react';

// Mostrado quando o autosave (App.jsx) recebe 409 do POST /api/presentations —
// esta apresentação foi salva em outro dispositivo/aba depois que este cliente
// a carregou (ver expectedUpdatedAt em store.js#savePresentation). Modal
// bloqueante (sem X/fechar): o usuário precisa decidir antes de continuar
// editando, senão a edição local segue divergindo ainda mais da do servidor.
// Mesmo padrão visual de ShareLinkModal.jsx (.modal-overlay/.modal-card).
export default function ConflictModal({ isOpen, localPresentation, serverPresentation, onKeepLocal, onLoadServer, onDownloadLocal }) {
  if (!isOpen || !localPresentation || !serverPresentation) return null;

  const formatTime = (ts) => (ts ? new Date(ts).toLocaleString('pt-BR') : '—');

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '560px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <div style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)', padding: '0.5rem', borderRadius: '0.5rem' }}>
            <AlertTriangle size={24} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Conflito de edição</h2>
            <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 0 }}>"{localPresentation.title}" foi salva em outro dispositivo ou aba enquanto você editava aqui.</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '0.6rem', padding: '0.9rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', marginBottom: '0.4rem' }}>SUA VERSÃO AQUI</div>
            <div style={{ fontSize: '0.85rem' }}>{localPresentation.slides.length} slides</div>
            <div style={{ fontSize: '0.78rem', color: '#9ca3af' }}>edição em andamento</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '0.6rem', padding: '0.9rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', marginBottom: '0.4rem' }}>VERSÃO NO SERVIDOR</div>
            <div style={{ fontSize: '0.85rem' }}>{serverPresentation.slides.length} slides</div>
            <div style={{ fontSize: '0.78rem', color: '#9ca3af' }}>salva {formatTime(serverPresentation.updatedAt)}</div>
          </div>
        </div>

        <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '1.25rem' }}>
          Escolha o que fazer. Se não tiver certeza, baixe suas alterações daqui primeiro — assim nada se perde de qualquer jeito.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <button
            className="btn-icon"
            onClick={onDownloadLocal}
            style={{ width: '100%', justifyContent: 'center', padding: '0.65rem', gap: '0.5rem', background: 'rgba(255,255,255,0.08)' }}
          >
            <Download size={16} /> Baixar minhas alterações daqui (.json)
          </button>
          <button
            className="btn-icon"
            onClick={onLoadServer}
            style={{ width: '100%', justifyContent: 'center', padding: '0.65rem', gap: '0.5rem', color: '#f87171', background: 'rgba(255,255,255,0.08)' }}
          >
            <CloudDownload size={16} /> Descartar edições daqui e carregar a versão mais recente
          </button>
          <button className="btn-primary" onClick={onKeepLocal} style={{ width: '100%', justifyContent: 'center' }}>
            <Save size={16} /> Manter minhas alterações daqui (sobrescreve a outra versão)
          </button>
        </div>
      </div>
    </div>
  );
}
