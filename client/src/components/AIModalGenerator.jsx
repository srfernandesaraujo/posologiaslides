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

  // Reproduz o PDF de forma IDÊNTICA — cada página vira uma imagem (ver
  // /upload-presentation em materialsRoutes.js) usada como fundo de um slide
  // inteiro, sem IA no meio pra "recriar" o conteúdo. Escolhido no lugar da
  // reconstrução criativa antiga (extrair texto + pedir pra IA remontar cada
  // slide) porque essa perdia imagens/gráficos/layout original — o ponto
  // aqui é preservar a aula existente pixel a pixel e só depois usar os
  // recursos do sistema (quiz, hotspot, destaque, anotação) por cima dela.
  //
  // Renderizar 30+ páginas não cabe numa única requisição (timeout de proxy
  // da hospedagem — ver server/routes/materialsRoutes.js): o upload devolve
  // um jobId na hora, e o progresso é acompanhado por polling em
  // /upload-presentation/:jobId até status !== 'processing'.
  const handleSubmitImport = async () => {
    if (!importFile) {
      alert('Selecione um arquivo PDF da apresentação existente.');
      return;
    }

    setLoading(true);

    try {
      setLoadingStatus('Enviando o PDF...');
      const formData = new FormData();
      formData.append('file', importFile);
      const uploadRes = await apiFetch('/api/materials/upload-presentation', { method: 'POST', body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadData.success) {
        throw new Error(uploadData.error || 'Erro ao processar o PDF.');
      }

      const { jobId, pageCount } = uploadData;
      let jobResult;
      // Polling simples (sem websocket): cada consulta também mantém a
      // instância "acordada" na hospedagem, então nunca dorme no meio do job.
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const statusRes = await apiFetch(`/api/materials/upload-presentation/${jobId}`);
        const statusData = await statusRes.json();
        if (!statusData.success) {
          throw new Error(statusData.error || 'Erro ao acompanhar a importação.');
        }
        setLoadingStatus(`Convertendo página ${statusData.pagesDone} de ${pageCount}...`);
        if (statusData.status === 'done' || statusData.status === 'error') {
          jobResult = statusData;
          break;
        }
      }

      if (jobResult.status === 'error') {
        throw new Error(jobResult.error || 'Erro ao processar o PDF.');
      }

      const title = importFile.name.replace(/\.pdf$/i, '');
      const slides = jobResult.pageImages.map((url, idx) => ({
        id: `slide-${Date.now()}-${idx}`,
        title: `${title} — página ${idx + 1}`,
        // Fundo preto (não branco) pra página não preencher o slide inteiro
        // (aspect ratio diferente do PDF original, ex. 4:3) não deixar tarja
        // branca ao redor — combina melhor com o resto do sistema (telão
        // escuro) do que uma borda branca.
        html: url
          ? `<div class="slide-root" style="height:100%; position:relative; background:#0a0a0a;"><img src="${url}" alt="Página ${idx + 1} importada" style="position:absolute; inset:0; width:100%; height:100%; object-fit:contain; display:block;" /></div>`
          : `<div class="slide-root" style="display:flex; align-items:center; justify-content:center; height:100%; padding:2rem; color:#4b5563; font-size:1.05rem; text-align:center;">Não foi possível renderizar a página ${idx + 1} deste PDF.</div>`
      }));

      if (jobResult.warning) {
        alert('⚠️ ' + jobResult.warning);
      }

      onGenerate({ title, slides });
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
          {mode === 'generate' && (
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
          )}

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
                Exporte sua apresentação (PowerPoint, Keynote ou Google Slides) como PDF antes de enviar. Cada página vira um slide idêntico ao original (não passa por IA — nada de texto, imagem ou layout se perde). Depois é só usar os recursos do sistema (quiz, hotspot, destaque, anotações) por cima.
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
