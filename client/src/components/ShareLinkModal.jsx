import React, { useEffect, useState } from 'react';
import { Share2, X, Loader2, Copy, Check, Link as LinkIcon, Ban } from 'lucide-react';
import { apiFetch } from '../lib/api';

// Gera/mostra/revoga o link público só-visualização de uma apresentação —
// sem login, os alunos só navegam pelos slides (ver PublicPresentationView.jsx
// e server/routes/publicRoutes.js). Mesmo formato visual/estrutural de
// PresentationReportModal.jsx.
export default function ShareLinkModal({ isOpen, onClose, presentationId, presentationTitle }) {
  const [shareId, setShareId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen || !presentationId) return;
    setError(null);
    setCopied(false);
    setLoading(true);
    apiFetch(`/api/presentations/${presentationId}/share`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setShareId(data.shareId);
        else setError(data.error || 'Não foi possível consultar o link.');
      })
      .catch(() => setError('Não foi possível consultar o link.'))
      .finally(() => setLoading(false));
  }, [isOpen, presentationId]);

  if (!isOpen) return null;

  const shareUrl = shareId ? `${window.location.origin}/view/${shareId}` : '';

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/presentations/${presentationId}/share`, { method: 'POST' });
      const data = await res.json();
      if (data.success) setShareId(data.shareId);
      else setError(data.error || 'Não foi possível gerar o link.');
    } catch {
      setError('Não foi possível gerar o link.');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async () => {
    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/api/presentations/${presentationId}/share`, { method: 'DELETE' });
      setShareId(null);
    } catch {
      setError('Não foi possível revogar o link.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '520px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'linear-gradient(135deg, #22d3ee, #3b82f6)', padding: '0.5rem', borderRadius: '0.5rem' }}>
              <Share2 size={24} color="#fff" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Compartilhar Apresentação</h2>
              <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 0 }}>"{presentationTitle}" — link público, só visualização</p>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)', padding: '2rem', justifyContent: 'center' }}>
            <Loader2 className="animate-spin" size={18} /> Aguarde...
          </div>
        )}

        {!loading && error && (
          <div style={{ color: '#f87171', padding: '1.5rem', textAlign: 'center', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        {!loading && !error && !shareId && (
          <div style={{ textAlign: 'center', padding: '1rem 0 0.5rem' }}>
            <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '1.25rem' }}>
              Gere um link que qualquer aluno pode abrir sem precisar de conta — eles só navegam pelos slides, sem editar.
            </p>
            <button className="btn-primary" onClick={handleGenerate} style={{ margin: '0 auto' }}>
              <LinkIcon size={16} /> Gerar link
            </button>
          </div>
        )}

        {!loading && !error && shareId && (
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem', color: '#e5e7eb' }}>
              Link para compartilhar
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <input
                type="text"
                className="chat-input"
                readOnly
                value={shareUrl}
                style={{ flex: 1, fontSize: '0.82rem' }}
                onFocus={(e) => e.target.select()}
              />
              <button className="btn-icon" onClick={handleCopy} style={{ background: 'rgba(255,255,255,0.1)' }} title="Copiar link">
                {copied ? <Check size={16} color="#34d399" /> : <Copy size={16} />}
              </button>
            </div>
            <button
              className="btn-icon"
              onClick={handleRevoke}
              style={{ width: 'auto', padding: '0.5rem 0.9rem', gap: '0.4rem', color: '#f87171', fontSize: '0.82rem' }}
            >
              <Ban size={15} /> Revogar link
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
