import React, { useState } from 'react';
import { Wand2, X, Loader2, Upload, Copy, Check, ImageOff } from 'lucide-react';
import { apiFetch } from '../lib/api';

// Sobe uma imagem, manda pra IA (Gemini Vision) e devolve um prompt PRONTO e
// específico pro conteúdo dessa imagem, pra colar no Gemini Canvas (fora do
// sistema — não existe API pública dele pra chamar direto). Mesmo padrão de
// upload de imagem de AISingleSlideModal.jsx (/api/materials/upload-file →
// base64 + mimeType) e mesmo padrão de "copiar" de ShareLinkModal.jsx.
export default function PromptGeneratorModal({ isOpen, onClose }) {
  const [image, setImage] = useState(null); // { name, mimeType, data, previewUrl }
  const [uploadLoading, setUploadLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [prompt, setPrompt] = useState('');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const reset = () => {
    setImage(null);
    setError('');
    setWarning('');
    setPrompt('');
    setCopied(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleAttachImage = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    setUploadLoading(true);
    setError('');
    setPrompt('');
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await apiFetch('/api/materials/upload-file', { method: 'POST', body: formData });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Falha ao enviar a imagem.');
      if (!data.mimeType || !data.mimeType.startsWith('image/')) {
        throw new Error('Envie um arquivo de imagem (PNG, JPG...).');
      }
      setImage({ name: data.filename, mimeType: data.mimeType, data: data.base64, previewUrl: URL.createObjectURL(file) });
    } catch (err) {
      setError(err.message || 'Falha ao enviar a imagem.');
    } finally {
      setUploadLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!image || loading) return;
    setLoading(true);
    setError('');
    setWarning('');
    setPrompt('');

    try {
      const res = await apiFetch('/api/ai/generate-canvas-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: image.data, mimeType: image.mimeType })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.warning || data.error || 'Falha ao gerar o prompt.');
      setPrompt(data.prompt);
      if (data.warning) setWarning(data.warning);
    } catch (err) {
      setError(err.message || 'Falha ao gerar o prompt.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '620px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'linear-gradient(135deg, #a855f7, #6366f1)', padding: '0.5rem', borderRadius: '0.5rem' }}>
              <Wand2 size={24} color="#fff" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Gerador de Prompt (Gemini Canvas)</h2>
              <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 0 }}>Suba uma imagem e receba um prompt específico pra colar no Gemini Canvas</p>
            </div>
          </div>
          <button className="btn-icon" onClick={handleClose}>
            <X size={20} />
          </button>
        </div>

        {!image ? (
          <label
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
              border: '2px dashed rgba(255,255,255,0.2)', borderRadius: '0.9rem', padding: '2.5rem 1rem', cursor: 'pointer', color: '#9ca3af'
            }}
          >
            {uploadLoading ? <Loader2 size={28} className="animate-spin" /> : <Upload size={28} />}
            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{uploadLoading ? 'Enviando imagem...' : 'Clique para escolher uma imagem'}</span>
            <input type="file" accept="image/*" onChange={handleAttachImage} disabled={uploadLoading} style={{ display: 'none' }} />
          </label>
        ) : (
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
            <img src={image.previewUrl} alt={image.name} style={{ width: '110px', height: '110px', objectFit: 'cover', borderRadius: '0.6rem', border: '1px solid rgba(255,255,255,0.15)' }} />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '0.85rem', color: '#e5e7eb', fontWeight: 600, marginBottom: '0.5rem', wordBreak: 'break-all' }}>{image.name}</p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn-primary" onClick={handleGenerate} disabled={loading} style={{ fontSize: '0.85rem' }}>
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />} {loading ? 'Gerando...' : 'Gerar Prompt'}
                </button>
                <button className="btn-secondary" onClick={reset} disabled={loading} style={{ fontSize: '0.85rem', gap: '0.4rem' }}>
                  <ImageOff size={16} /> Trocar imagem
                </button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div style={{ color: '#f87171', fontSize: '0.85rem', padding: '0.75rem 0' }}>{error}</div>
        )}
        {warning && !error && (
          <div style={{ color: '#fbbf24', fontSize: '0.8rem', padding: '0.5rem 0' }}>{warning}</div>
        )}

        {prompt && (
          <div style={{ marginTop: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e5e7eb' }}>Prompt gerado</label>
              <button className="btn-icon" onClick={handleCopy} style={{ background: 'rgba(255,255,255,0.1)' }} title="Copiar prompt">
                {copied ? <Check size={16} color="#34d399" /> : <Copy size={16} />}
              </button>
            </div>
            <textarea
              readOnly
              className="chat-input"
              value={prompt}
              onFocus={(e) => e.target.select()}
              style={{ width: '100%', minHeight: '220px', fontSize: '0.85rem', lineHeight: 1.5, resize: 'vertical' }}
            />
            <p style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '0.5rem' }}>
              Copie o prompt acima e cole no Gemini Canvas junto com esta mesma imagem. Quando o HTML voltar de lá, use o botão "Código" da lista de slides pra trazê-lo pra esta apresentação.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
