import React, { useState } from 'react';
import { Sparkles, X, Loader2, Paperclip, RefreshCw, Plus } from 'lucide-react';
import { apiFetch } from '../lib/api';
import SlideThumbnail from './SlideThumbnail';

// Cria UM slide avulso via IA (prompt + arquivo de referência opcional) pra
// inserir dentro de uma apresentação já em construção — mesmo espírito do
// modo "Gerar" do AIModalGenerator (criação de apresentação inteira), só que
// aqui é sempre 1 slide só, direto na posição escolhida (ver
// handleOpenAISingleSlide em PresentationEditor.jsx), sem passar pela tela de
// outline/número de slides.
export default function AISingleSlideModal({ isOpen, onClose, onInsert }) {
  const [prompt, setPrompt] = useState('');
  const [attachment, setAttachment] = useState(null); // { kind: 'text'|'image', name, content?, mimeType?, data? }
  const [attachLoading, setAttachLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [result, setResult] = useState(null); // { title, html }

  if (!isOpen) return null;

  const reset = () => {
    setPrompt('');
    setAttachment(null);
    setError('');
    setWarning('');
    setResult(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleAttachFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    setAttachLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await apiFetch('/api/materials/upload-file', { method: 'POST', body: formData });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Falha ao anexar arquivo.');

      if (data.mimeType && data.mimeType.startsWith('image/')) {
        setAttachment({ kind: 'image', name: data.filename, mimeType: data.mimeType, data: data.base64 });
      } else {
        setAttachment({ kind: 'text', name: data.filename, content: data.text });
      }
    } catch (err) {
      alert('Erro ao anexar arquivo: ' + err.message);
    } finally {
      setAttachLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError('');
    setWarning('');
    setResult(null);

    try {
      const res = await apiFetch('/api/ai/generate-single-slide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          materials: attachment?.kind === 'text' ? attachment.content : undefined,
          images: attachment?.kind === 'image' ? [{ mimeType: attachment.mimeType, data: attachment.data }] : undefined
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Falha ao gerar o slide.');
      setResult({ title: data.title, html: data.html });
      if (data.warning) setWarning(data.warning);
    } catch (err) {
      setError(err.message || 'Falha ao gerar o slide.');
    } finally {
      setLoading(false);
    }
  };

  const handleInsert = () => {
    if (!result) return;
    onInsert(result.title, result.html);
    reset();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-card" style={{ maxWidth: '640px', width: '95%' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'linear-gradient(135deg, #22d3ee, #a78bfa)', padding: '0.5rem', borderRadius: '0.5rem' }}>
              <Sparkles size={24} color="#071019" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>Novo Slide com IA</h2>
              <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 0 }}>Descreva o slide e, se quiser, anexe um material de referência</p>
            </div>
          </div>
          <button className="btn-icon" onClick={handleClose}>
            <X size={20} />
          </button>
        </div>

        {!result ? (
          <>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#9ca3af', marginBottom: '0.4rem' }}>
              O que este slide deve conter?
            </label>
            <textarea
              className="chat-input"
              rows={4}
              placeholder="Ex.: Um slide comparando os efeitos adversos de dois anti-hipertensivos, em duelo lado a lado."
              style={{ fontSize: '0.9rem', width: '100%', boxSizing: 'border-box', resize: 'vertical', marginBottom: '0.75rem' }}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              autoFocus
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
              <label className="btn-icon" style={{ width: 'auto', fontSize: '0.78rem', gap: '0.35rem', padding: '0.4rem 0.7rem', cursor: 'pointer' }}>
                {attachLoading ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
                Anexar arquivo de referência (opcional)
                <input type="file" accept=".pdf,.txt,image/*" style={{ display: 'none' }} onChange={handleAttachFile} disabled={attachLoading} />
              </label>
              {attachment && (
                <span style={{ fontSize: '0.75rem', color: '#67e8f9', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  {attachment.name}
                  <button className="btn-icon" style={{ width: '18px', height: '18px' }} onClick={() => setAttachment(null)}>
                    <X size={11} />
                  </button>
                </span>
              )}
            </div>

            {error && (
              <div style={{ fontSize: '0.8rem', color: '#f87171', background: 'rgba(248,113,113,0.1)', padding: '0.6rem 0.75rem', borderRadius: '0.4rem', marginBottom: '1rem' }}>
                {error}
              </div>
            )}

            <button
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', fontSize: '0.9rem' }}
              onClick={handleGenerate}
              disabled={loading || !prompt.trim()}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {loading ? 'Gerando slide...' : 'Gerar Slide'}
            </button>
          </>
        ) : (
          <>
            {warning && (
              <div style={{ fontSize: '0.78rem', color: '#fbbf24', background: 'rgba(251,191,36,0.08)', padding: '0.6rem 0.75rem', borderRadius: '0.4rem', marginBottom: '0.75rem' }}>
                {warning}
              </div>
            )}
            <div style={{ aspectRatio: '16/9', borderRadius: '0.6rem', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '1rem' }}>
              <SlideThumbnail html={result.html} />
            </div>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button
                className="btn-icon"
                style={{ flex: 1, width: 'auto', justifyContent: 'center', fontSize: '0.85rem', gap: '0.4rem' }}
                onClick={handleGenerate}
                disabled={loading}
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                Gerar Outra Versão
              </button>
              <button
                className="btn-primary"
                style={{ flex: 1, justifyContent: 'center', fontSize: '0.85rem' }}
                onClick={handleInsert}
              >
                <Plus size={15} /> Inserir no Slide
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
