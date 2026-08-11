import React, { useState } from 'react';
import { Download, X, FileText, Presentation as PresentationIcon, Loader2, Globe } from 'lucide-react';

// Rótulo de progresso do export HTML — cada fase de buildStandaloneHtml
// (ver client/src/lib/exportStandalone.js) baixa e embute um tipo de recurso
// diferente (imagens, fontes, Chart.js/Mermaid, por fim monta o doc de cada
// slide), então a barra de progresso do PDF/PPTX (um contador "slide N/total"
// só) não serve aqui — precisa dizer qual fase está rodando.
const HTML_PHASE_LABELS = {
  images: 'Baixando imagens',
  fonts: 'Preparando fontes',
  scripts: 'Preparando gráficos (Chart.js/Mermaid)',
  slides: 'Montando slide'
};

// Baixa o deck inteiro em PDF, PPTX ou HTML autocontido. PDF/PPTX capturam
// cada slide como imagem em alta resolução (única forma confiável pra
// HTML/CSS/JS livre gerado por IA — ver client/src/lib/exportDeck.js). O
// HTML standalone é diferente: mantém o slide como HTML/CSS/JS de verdade
// (gráficos, animações, zoom, holofote continuam funcionando), só que num
// único arquivo que roda sozinho no navegador, sem backend/internet — ver
// client/src/lib/exportStandalone.js pro que fica de fora (interatividade ao
// vivo com a turma, que depende de servidor).
export default function ExportModal({ isOpen, onClose, presentation }) {
  const [format, setFormat] = useState(null); // 'pdf' | 'pptx' | 'html' | null (enquanto roda)
  const [progress, setProgress] = useState(null); // { current, total } ou { phase, current, total }
  const [error, setError] = useState('');
  // Preenchido só depois de um export HTML terminar com alguma imagem que o
  // fetch() não conseguiu baixar pra embutir (bucket sem CORS liberado pra
  // leitura via JS, link quebrado, etc. — ver buildImageDataUriMap em
  // exportStandalone.js). O arquivo ainda baixa normalmente (o slide mantém
  // a URL remota original), só deixa de ser 100% offline pra essas imagens
  // específicas — sem este aviso o usuário só percebe abrindo sem internet.
  const [imageWarning, setImageWarning] = useState(null);

  if (!isOpen) return null;

  const busy = format !== null;

  const handleExport = async (targetFormat) => {
    setError('');
    setImageWarning(null);
    setFormat(targetFormat);
    setProgress({ current: 0, total: presentation.slides?.filter((s) => !s.hidden).length || 0 });

    try {
      if (targetFormat === 'html') {
        const { buildStandaloneHtml, standaloneHtmlFileName, downloadHtmlFile } = await import('../lib/exportStandalone');
        const { html, failedImageUrls } = await buildStandaloneHtml(presentation, { onProgress: setProgress });
        downloadHtmlFile(html, standaloneHtmlFileName(presentation.title));
        if (failedImageUrls.length > 0) {
          setImageWarning(
            `${failedImageUrls.length} imagem${failedImageUrls.length > 1 ? 'ns' : ''} não pôde${failedImageUrls.length > 1 ? 'ram' : ''} ser baixada${failedImageUrls.length > 1 ? 's' : ''} pra dentro do arquivo — ele vai continuar exigindo internet pra mostrar essa${failedImageUrls.length > 1 ? 's' : ''} imagem${failedImageUrls.length > 1 ? 'ns' : ''} específica${failedImageUrls.length > 1 ? 's' : ''}.`
          );
        }
        return;
      }

      // Import dinâmico: jspdf/pptxgenjs/html2canvas só entram no bundle
      // quando o usuário de fato exporta — sem isto, toda carga do app
      // (inclusive as páginas mobile /join e /remote, que nunca exportam
      // nada) baixaria ~300KB a mais (gzip) só por essas libs existirem no
      // bundle principal.
      const { renderSlidesToImages, buildPdf, buildPptx } = await import('../lib/exportDeck');
      const images = await renderSlidesToImages(presentation.slides || [], {
        onProgress: (current, total) => setProgress({ current, total })
      });

      if (targetFormat === 'pdf') {
        buildPdf(images, presentation.title);
      } else {
        await buildPptx(images, presentation.title);
      }
    } catch (err) {
      console.error('Falha ao exportar apresentação:', err);
      setError('Não foi possível gerar o arquivo. Tente novamente.');
    } finally {
      setFormat(null);
      setProgress(null);
    }
  };

  const progressText = format === 'html' && progress?.phase
    ? `${HTML_PHASE_LABELS[progress.phase] || 'Preparando'}${progress.total ? ` (${progress.current}/${progress.total})` : '...'}`
    : (progress?.total ? `Renderizando slide ${progress.current}/${progress.total}...` : 'Preparando...');

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '460px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'linear-gradient(135deg, #22d3ee, #3b82f6)', padding: '0.5rem', borderRadius: '0.5rem' }}>
              <Download size={24} color="#fff" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Exportar Apresentação</h2>
              <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 0 }}>"{presentation.title}"</p>
            </div>
          </div>
          {!busy && (
            <button className="btn-icon" onClick={onClose}>
              <X size={20} />
            </button>
          )}
        </div>

        {busy ? (
          <div style={{ padding: '1.5rem 0', textAlign: 'center' }}>
            <Loader2 size={28} className="animate-spin" style={{ marginBottom: '1rem', color: 'var(--accent-primary)' }} />
            <p style={{ fontSize: '0.9rem', color: '#e5e7eb', fontWeight: 600 }}>
              {progressText}
            </p>
            <p style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '0.4rem' }}>
              {format === 'html'
                ? 'Baixando e embutindo imagens/fontes no arquivo — pode levar um pouco mais que o PDF/PPTX.'
                : 'Isso pode levar alguns segundos por slide — não feche esta janela.'}
            </p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '1.25rem' }}>
              PDF/PPTX capturam cada slide como imagem em alta resolução (texto não editável). O HTML autocontido mantém gráficos, animações e zoom funcionando — um único arquivo que abre em qualquer navegador, offline. Em todos os formatos, recursos ao vivo com a turma (quiz, nuvem de palavras, controle remoto) não são incluídos.
            </p>

            {error && (
              <div style={{ color: '#f87171', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</div>
            )}

            {imageWarning && (
              <div style={{ color: '#fbbf24', fontSize: '0.8rem', marginBottom: '1rem', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '0.5rem', padding: '0.6rem 0.75rem' }}>
                Arquivo baixado, mas: {imageWarning}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <button className="btn-primary" onClick={() => handleExport('pdf')} style={{ flex: 1, justifyContent: 'center', padding: '0.8rem' }}>
                <FileText size={18} /> Baixar PDF
              </button>
              <button className="btn-primary" onClick={() => handleExport('pptx')} style={{ flex: 1, justifyContent: 'center', padding: '0.8rem' }}>
                <PresentationIcon size={18} /> Baixar PPTX
              </button>
            </div>
            <button className="btn-primary" onClick={() => handleExport('html')} style={{ width: '100%', justifyContent: 'center', padding: '0.8rem' }}>
              <Globe size={18} /> Baixar HTML autocontido
            </button>
          </>
        )}
      </div>
    </div>
  );
}
