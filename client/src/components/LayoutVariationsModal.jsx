import React, { useState, useEffect } from 'react';
import { Shuffle, X, Loader2, Check } from 'lucide-react';
import { apiFetch } from '../lib/api';

// Galeria de variações de layout do elemento selecionado, geradas por IA
// (rota /api/ai/layout-variations) — mesmo conteúdo/cores/animação do
// elemento original, só a estrutura/arranjo visual muda entre as opções.
// Sempre gera assim que abre (ver useEffect abaixo), igual à Galeria de
// Templates não precisar de um botão extra "Buscar".
export default function LayoutVariationsModal({ isOpen, elementHtml, onClose, onSelect }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [variations, setVariations] = useState([]);

  const generate = async () => {
    if (!elementHtml) return;
    setLoading(true);
    setError('');
    setWarning('');
    setVariations([]);
    try {
      const res = await apiFetch('/api/ai/layout-variations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elementHtml, count: 3 })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Falha ao gerar variações de layout.');
      setVariations(data.variations || []);
      if (data.warning) setWarning(data.warning);
    } catch (err) {
      setError(err.message || 'Falha ao gerar variações de layout.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePick = (html) => {
    onSelect(html);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '980px', width: '95%' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'linear-gradient(135deg, #22d3ee, #a78bfa)', padding: '0.5rem', borderRadius: '0.5rem' }}>
              <Shuffle size={24} color="#071019" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>Trocar Layout</h2>
              <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 0 }}>Mesmo conteúdo, cores e animação — só muda o arranjo</p>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {error && (
          <div style={{ fontSize: '0.8rem', color: '#f87171', background: 'rgba(248,113,113,0.1)', padding: '0.6rem 0.75rem', borderRadius: '0.4rem', marginBottom: '1rem' }}>
            {error}
          </div>
        )}
        {warning && (
          <div style={{ fontSize: '0.78rem', color: '#fbbf24', background: 'rgba(251,191,36,0.08)', padding: '0.6rem 0.75rem', borderRadius: '0.4rem', marginBottom: '1rem' }}>
            {warning}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '3rem 0', color: '#9ca3af' }}>
            <Loader2 size={28} className="animate-spin" />
            <span style={{ fontSize: '0.85rem' }}>Gerando alternativas de layout...</span>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            {variations.map((html, i) => (
              <div key={i} style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.6rem', overflow: 'hidden', background: 'rgba(255,255,255,0.02)' }}>
                <iframe
                  title={`Variação de layout ${i + 1}`}
                  sandbox=""
                  srcDoc={`<!DOCTYPE html><html><head><style>body{margin:0;padding:1.2rem;background:#0b1220;font-family:'Plus Jakarta Sans',sans-serif;display:flex;align-items:center;justify-content:center;min-height:220px;box-sizing:border-box;}</style></head><body>${html}</body></html>`}
                  style={{ width: '100%', height: '220px', border: 'none', background: '#0b1220', pointerEvents: 'none' }}
                />
                <button
                  className="btn-primary"
                  style={{ width: '100%', justifyContent: 'center', fontSize: '0.82rem', borderRadius: 0 }}
                  onClick={() => handlePick(html)}
                >
                  <Check size={15} /> Usar esta versão
                </button>
              </div>
            ))}
          </div>
        )}

        {!loading && variations.length > 0 && (
          <button
            className="btn-icon"
            style={{ width: '100%', marginTop: '1rem', justifyContent: 'center', fontSize: '0.82rem', gap: '0.4rem' }}
            onClick={generate}
          >
            <Shuffle size={14} /> Gerar outras opções
          </button>
        )}
      </div>
    </div>
  );
}
