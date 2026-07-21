import React, { useState, useEffect } from 'react';
import { Sparkles, Upload, Link, FileText, X, Loader2, Image as ImageIcon } from 'lucide-react';
import { apiFetch, getGeminiKey } from '../lib/api';

export default function AIModalGenerator({ isOpen, onClose, onGenerate }) {
  const [prompt, setPrompt] = useState('');
  const [numSlides, setNumSlides] = useState(5);
  const [linkUrl, setLinkUrl] = useState('');
  const [uploadedMaterial, setUploadedMaterial] = useState(null);
  const [uploadedImages, setUploadedImages] = useState([]);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');

  useEffect(() => {
    if (isOpen) setApiKey(getGeminiKey());
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoadingStatus('Extraindo conteúdo do arquivo...');
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await apiFetch('/api/materials/upload-file', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        if (data.mimeType && data.mimeType.startsWith('image/')) {
          setUploadedImages(prev => [...prev, { id: Date.now().toString(), name: data.filename, mimeType: data.mimeType, data: data.base64 }]);
        } else {
          setUploadedMaterial(`[Arquivo: ${data.filename}]\n${data.text}`);
        }
      }
    } catch (err) {
      alert('Erro ao carregar arquivo: ' + err.message);
    } finally {
      setLoadingStatus('');
    }
  };

  const removeUploadedImage = (id) => {
    setUploadedImages(prev => prev.filter(img => img.id !== id));
  };

  const handleParseUrl = async () => {
    if (!linkUrl) return;
    setLoadingStatus('Raspando conteúdo da URL...');
    try {
      const res = await apiFetch('/api/materials/parse-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: linkUrl })
      });
      const data = await res.json();
      if (data.success) {
        setUploadedMaterial(`[Link: ${linkUrl}]\n${data.text}`);
        alert('Conteúdo da URL importado com sucesso!');
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert('Erro ao ler URL: ' + err.message);
    } finally {
      setLoadingStatus('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prompt.trim()) {
      alert('Por favor, digite o tema ou assunto da sua apresentação.');
      return;
    }

    setLoading(true);
    setLoadingStatus('Gerando estrutura e slides interativos com IA...');

    const images = uploadedImages.map(({ mimeType, data }) => ({ mimeType, data }));

    try {
      // 1. Gerar Outline
      const outlineRes = await apiFetch('/api/ai/generate-outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          materials: uploadedMaterial,
          numSlides,
          apiKey,
          images
        })
      });
      const outlineData = await outlineRes.json();

      if (!outlineData.success) {
        throw new Error(outlineData.error || 'Erro ao gerar estrutura.');
      }

      setLoadingStatus('Construindo código HTML e dashboards interativos...');

      // 2. Gerar Slides
      const slidesRes = await apiFetch('/api/ai/generate-slides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outline: outlineData.outline,
          apiKey,
          images
        })
      });
      const slidesData = await slidesRes.json();

      if (!slidesData.success) {
        throw new Error(slidesData.error || 'Erro ao construir slides.');
      }

      const combinedWarning = outlineData.warning || slidesData.warning;
      if (combinedWarning) {
        // alert (não o estado local) porque a modal pode desmontar logo em
        // seguida ao trocar de tela para o editor — precisa ficar visível.
        alert('⚠️ ' + combinedWarning);
      }

      onGenerate(slidesData.presentation);
      onClose();
    } catch (err) {
      alert('Erro na geração: ' + err.message);
    } finally {
      setLoading(false);
      setLoadingStatus('');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'linear-gradient(135deg, #a855f7, #3b82f6)', padding: '0.5rem', borderRadius: '0.5rem' }}>
              <Sparkles size={24} color="#fff" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Nova Apresentação com IA</h2>
              <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 0 }}>Crie slides HTML interativos a partir de temas, arquivos ou links</p>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem', color: '#e5e7eb' }}>
              Tema ou Prompt Principal da Apresentação *
            </label>
            <textarea
              className="chat-input"
              rows={3}
              style={{ width: '100%', resize: 'vertical' }}
              placeholder="Ex: Apresentação para investidores sobre novo produto de inteligência artificial na saúde com comparativo de ROI..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.4rem', color: '#9ca3af' }}>
                Número de Slides
              </label>
              <select
                className="chat-input"
                style={{ width: '100%' }}
                value={numSlides}
                onChange={(e) => setNumSlides(Number(e.target.value))}
              >
                <option value={3}>3 Slides (Apresentação Curta)</option>
                <option value={5}>5 Slides (Padrão Executivo)</option>
                <option value={7}>7 Slides (Detalhado)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.4rem', color: '#9ca3af' }}>
                Chave API Gemini / OpenAI (Opcional)
              </label>
              <input
                type="password"
                className="chat-input"
                style={{ width: '100%' }}
                placeholder="Usar padrão offline se vazio"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
          </div>

          {/* Seção de Materiais (Upload de arquivos e Links) */}
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
              <FileText size={16} /> Materiais de Suporte (Opcional)
            </span>

            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <label className="btn-primary" style={{ background: 'rgba(255,255,255,0.1)', color: '#e5e7eb', fontSize: '0.82rem', padding: '0.4rem 0.8rem', cursor: 'pointer' }}>
                <Upload size={16} /> Anexar PDF / TXT / Imagem
                <input type="file" accept=".pdf,.txt,image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
              </label>

              <div style={{ display: 'flex', flex: 1, gap: '0.4rem' }}>
                <input
                  type="url"
                  className="chat-input"
                  placeholder="https://exemplo.com/artigo"
                  style={{ fontSize: '0.82rem', padding: '0.4rem 0.8rem' }}
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                />
                <button type="button" className="btn-icon" onClick={handleParseUrl} style={{ background: 'rgba(255,255,255,0.1)' }}>
                  <Link size={16} />
                </button>
              </div>
            </div>

            {uploadedMaterial && (
              <div style={{ fontSize: '0.78rem', color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '0.5rem', borderRadius: '0.4rem', marginBottom: uploadedImages.length ? '0.5rem' : 0 }}>
                ✓ Material de base anexado ({uploadedMaterial.substring(0, 60)}...)
              </div>
            )}

            {uploadedImages.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {uploadedImages.map(img => (
                  <div key={img.id} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(56,189,248,0.1)', color: '#38bdf8', fontSize: '0.75rem', padding: '0.3rem 0.5rem', borderRadius: '0.4rem' }}>
                    <ImageIcon size={12} />
                    <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.name}</span>
                    <button type="button" onClick={() => removeUploadedImage(img.id)} style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', display: 'flex' }}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {loadingStatus && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#a855f7', fontSize: '0.85rem' }}>
              <Loader2 className="animate-spin" size={18} />
              <span>{loadingStatus}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn-icon" onClick={onClose} style={{ width: 'auto', padding: '0 1rem' }}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              Gerar Apresentação
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
