import React, { useState, useEffect } from 'react';
import { Sparkles, Upload, Link, FileText, X, Loader2, Image as ImageIcon, FileUp } from 'lucide-react';
import { apiFetch } from '../lib/api';

export default function AIModalGenerator({ isOpen, onClose, onGenerate }) {
  // 'generate' = criar do zero (fluxo original); 'import' = reproduzir um PDF
  // existente (ver handleSubmitImport) — mesma modal, só muda a origem do
  // outline (etapa 1); a etapa 2 (gerar o HTML de cada slide) é idêntica.
  const [mode, setMode] = useState('generate');
  const [prompt, setPrompt] = useState('');
  const [numSlides, setNumSlides] = useState(5);
  const [linkUrl, setLinkUrl] = useState('');
  const [uploadedMaterial, setUploadedMaterial] = useState(null);
  const [uploadedImages, setUploadedImages] = useState([]);
  const [importFile, setImportFile] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  // Prompt + material específicos de cada slide individual (modo "gerar do
  // zero") — além do tema geral acima, cada slide pode ter sua própria
  // instrução e anexo, pra IA ter contexto preciso por slide em vez de só um
  // prompt/material genérico pra apresentação inteira.
  const [slidesConfig, setSlidesConfig] = useState(() =>
    Array.from({ length: numSlides }, () => ({ prompt: '', materialText: null, materialLabel: null, images: [] }))
  );

  // Redimensiona a lista de configs por slide quando o número de slides muda,
  // preservando o que já foi preenchido nos slides que continuam existindo.
  useEffect(() => {
    setSlidesConfig((prev) => {
      const next = prev.slice(0, numSlides);
      while (next.length < numSlides) {
        next.push({ prompt: '', materialText: null, materialLabel: null, images: [] });
      }
      return next;
    });
  }, [numSlides]);

  if (!isOpen) return null;

  const updateSlidePrompt = (index, value) => {
    setSlidesConfig((prev) => prev.map((s, i) => (i === index ? { ...s, prompt: value } : s)));
  };

  const removeSlideMaterial = (index) => {
    setSlidesConfig((prev) => prev.map((s, i) => (i === index ? { ...s, materialText: null, materialLabel: null } : s)));
  };

  const removeSlideImage = (index, imageId) => {
    setSlidesConfig((prev) => prev.map((s, i) => (i === index ? { ...s, images: s.images.filter((img) => img.id !== imageId) } : s)));
  };

  const handleSlideFileUpload = async (index, e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await apiFetch('/api/materials/upload-file', { method: 'POST', body: formData });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || 'Erro ao processar arquivo.');
        return;
      }
      setSlidesConfig((prev) => prev.map((s, i) => {
        if (i !== index) return s;
        if (data.mimeType && data.mimeType.startsWith('image/')) {
          return { ...s, images: [...s.images, { id: Date.now().toString(), name: data.filename, mimeType: data.mimeType, data: data.base64 }] };
        }
        return { ...s, materialText: data.text, materialLabel: data.filename };
      }));
    } catch (err) {
      alert('Erro ao carregar arquivo: ' + err.message);
    }
  };

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
      } else {
        alert(data.error || 'Erro ao processar arquivo.');
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

  // Etapa 2 (gerar o HTML de cada slide a partir de um outline) é IDÊNTICA
  // pros dois modos — outline "do zero" e outline importado têm exatamente o
  // mesmo formato, então esta função é compartilhada.
  const generateSlidesFromOutline = async (outline, images, slidesImagesConfig) => {
    setLoadingStatus('Construindo código HTML e dashboards interativos...');
    const slidesRes = await apiFetch('/api/ai/generate-slides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outline, apiKey, images, slidesConfig: slidesImagesConfig })
    });
    const slidesData = await slidesRes.json();
    if (!slidesData.success) {
      throw new Error(slidesData.error || 'Erro ao construir slides.');
    }
    return slidesData;
  };

  const handleSubmitGenerate = async () => {
    if (!prompt.trim()) {
      alert('Por favor, digite o tema ou assunto da sua apresentação.');
      return;
    }

    setLoading(true);
    setLoadingStatus('Gerando estrutura e slides interativos com IA...');

    const images = uploadedImages.map(({ mimeType, data }) => ({ mimeType, data }));
    const slidesConfigPayload = slidesConfig.map((s) => ({ prompt: s.prompt, materialText: s.materialText }));

    try {
      const outlineRes = await apiFetch('/api/ai/generate-outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, materials: uploadedMaterial, numSlides, apiKey, images, slidesConfig: slidesConfigPayload })
      });
      const outlineData = await outlineRes.json();
      if (!outlineData.success) {
        throw new Error(outlineData.error || 'Erro ao gerar estrutura.');
      }

      const slidesImagesPayload = slidesConfig.map((s) => ({ images: s.images.map(({ mimeType, data }) => ({ mimeType, data })) }));
      const slidesData = await generateSlidesFromOutline(outlineData.outline, images, slidesImagesPayload);

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

  const handleSubmitImport = async () => {
    if (!importFile) {
      alert('Selecione um arquivo PDF da apresentação existente.');
      return;
    }

    setLoading(true);

    try {
      setLoadingStatus('Extraindo o texto de cada página do PDF...');
      const formData = new FormData();
      formData.append('file', importFile);
      const uploadRes = await apiFetch('/api/materials/upload-presentation', { method: 'POST', body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadData.success) {
        throw new Error(uploadData.error || 'Erro ao processar o PDF.');
      }

      setLoadingStatus(`Reconstruindo o roteiro das ${uploadData.pageCount} página(s) importada(s)...`);
      const outlineRes = await apiFetch('/api/ai/import-outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages: uploadData.pages, apiKey })
      });
      const outlineData = await outlineRes.json();
      if (!outlineData.success) {
        throw new Error(outlineData.error || 'Erro ao gerar estrutura a partir do PDF.');
      }

      const slidesData = await generateSlidesFromOutline(outlineData.outline, []);

      const combinedWarning = outlineData.warning || slidesData.warning;
      if (combinedWarning) {
        alert('⚠️ ' + combinedWarning);
      }

      onGenerate(slidesData.presentation);
      onClose();
    } catch (err) {
      alert('Erro na importação: ' + err.message);
    } finally {
      setLoading(false);
      setLoadingStatus('');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (mode === 'import') handleSubmitImport();
    else handleSubmitGenerate();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'linear-gradient(135deg, #22d3ee, #3b82f6)', padding: '0.5rem', borderRadius: '0.5rem' }}>
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

        {/* Alterna entre gerar do zero (fluxo original) e importar um PDF de
            uma apresentação já pronta (ver handleSubmitImport). */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <button
            type="button"
            onClick={() => setMode('generate')}
            style={{
              flex: 1, padding: '0.5rem', borderRadius: '0.5rem', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700,
              background: mode === 'generate' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
              color: mode === 'generate' ? '#071019' : '#9ca3af'
            }}
          >
            Gerar do zero
          </button>
          <button
            type="button"
            onClick={() => setMode('import')}
            style={{
              flex: 1, padding: '0.5rem', borderRadius: '0.5rem', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700,
              background: mode === 'import' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
              color: mode === 'import' ? '#071019' : '#9ca3af'
            }}
          >
            Importar apresentação existente
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem', color: '#e5e7eb' }}>
              {mode === 'import' ? 'Instruções adicionais (Opcional)' : 'Tema ou Prompt Principal da Apresentação *'}
            </label>
            <textarea
              className="chat-input"
              rows={3}
              style={{ width: '100%', resize: 'vertical' }}
              placeholder={mode === 'import'
                ? 'Ex: Dê mais ênfase ao capítulo de farmacocinética...'
                : 'Ex: Apresentação para investidores sobre novo produto de inteligência artificial na saúde com comparativo de ROI...'}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          {mode === 'import' && (
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
                <FileUp size={16} /> Apresentação Existente (PDF) *
              </span>
              <label className="btn-primary" style={{ background: 'rgba(255,255,255,0.1)', color: '#e5e7eb', fontSize: '0.82rem', padding: '0.4rem 0.8rem', cursor: 'pointer', display: 'inline-flex' }}>
                <Upload size={16} /> {importFile ? importFile.name : 'Selecionar PDF'}
                <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={(e) => setImportFile(e.target.files[0] || null)} />
              </label>
              <p style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: '0.6rem', marginBottom: 0 }}>
                Exporte sua apresentação (PowerPoint, Keynote ou Google Slides) como PDF antes de enviar. A IA reproduz a mesma sequência de slides, um por página do PDF, no formato deste sistema.
              </p>
            </div>
          )}

          {mode === 'generate' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
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
                  Sobrescrever Chave Gemini (Opcional)
                </label>
                <input
                  type="password"
                  className="chat-input"
                  style={{ width: '100%' }}
                  placeholder="Deixe vazio para usar a chave salva em Configurações"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Seção de Materiais (Upload de arquivos e Links) — só no modo "gerar do zero" */}
          {mode === 'generate' && (
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
                <FileText size={16} /> Materiais Gerais da Apresentação (Opcional)
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
          )}

          {/* Prompt + material individual de cada slide — dá mais precisão que
              só o tema geral acima, principalmente em apresentações maiores. */}
          {mode === 'generate' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <FileText size={16} /> Prompt e Material por Slide (Opcional)
              </span>

              {slidesConfig.map((slide, idx) => (
                <div key={idx} style={{ background: 'rgba(255,255,255,0.03)', padding: '0.85rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Slide {idx + 1}
                  </span>
                  <textarea
                    className="chat-input"
                    rows={2}
                    style={{ width: '100%', resize: 'vertical', fontSize: '0.85rem' }}
                    placeholder="Ex: Explique o mecanismo de ação com um diagrama passo a passo..."
                    value={slide.prompt}
                    onChange={(e) => updateSlidePrompt(idx, e.target.value)}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <label className="btn-primary" style={{ background: 'rgba(255,255,255,0.1)', color: '#e5e7eb', fontSize: '0.78rem', padding: '0.35rem 0.7rem', cursor: 'pointer', display: 'inline-flex' }}>
                      <Upload size={14} /> Anexar material
                      <input type="file" accept=".pdf,.txt,image/*" style={{ display: 'none' }} onChange={(e) => handleSlideFileUpload(idx, e)} />
                    </label>

                    {slide.materialLabel && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '0.25rem 0.5rem', borderRadius: '0.4rem' }}>
                        {slide.materialLabel}
                        <button type="button" onClick={() => removeSlideMaterial(idx)} style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', display: 'flex' }}>
                          <X size={11} />
                        </button>
                      </span>
                    )}

                    {slide.images.map((img) => (
                      <span key={img.id} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', color: '#38bdf8', background: 'rgba(56,189,248,0.1)', padding: '0.25rem 0.5rem', borderRadius: '0.4rem' }}>
                        <ImageIcon size={11} />
                        <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.name}</span>
                        <button type="button" onClick={() => removeSlideImage(idx, img.id)} style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', display: 'flex' }}>
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {loadingStatus && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)', fontSize: '0.85rem' }}>
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
              {mode === 'import' ? 'Importar Apresentação' : 'Gerar Apresentação'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
