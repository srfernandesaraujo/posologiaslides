import React, { useState } from 'react';
import { Download, X, FileText, Presentation as PresentationIcon, Loader2 } from 'lucide-react';

// Baixa o deck inteiro em PDF ou PPTX — como todo slide é HTML/CSS/JS livre
// gerado por IA (gráficos, diagramas, animações, embeds), a única forma
// confiável de exportar é capturar cada slide como imagem em alta resolução
// e montar um arquivo com uma imagem cheia por página/slide (ver
// client/src/lib/exportDeck.js; decisão confirmada com o usuário — sem texto
// editável no PPTX gerado).
export default function ExportModal({ isOpen, onClose, presentation }) {
  const [format, setFormat] = useState(null); // 'pdf' | 'pptx' | null (enquanto roda)
  const [progress, setProgress] = useState(null); // { current, total }
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const busy = format !== null;

  const handleExport = async (targetFormat) => {
    setError('');
    setFormat(targetFormat);
    setProgress({ current: 0, total: presentation.slides?.filter((s) => !s.hidden).length || 0 });

    try {
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
              {progress?.total ? `Renderizando slide ${progress.current}/${progress.total}...` : 'Preparando...'}
            </p>
            <p style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '0.4rem' }}>
              Isso pode levar alguns segundos por slide — não feche esta janela.
            </p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '1.25rem' }}>
              Cada slide é capturado como imagem em alta resolução, mantendo o visual exato (gráficos, animações no estado final, fontes). O texto não fica editável no arquivo gerado.
            </p>

            {error && (
              <div style={{ color: '#f87171', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn-primary" onClick={() => handleExport('pdf')} style={{ flex: 1, justifyContent: 'center', padding: '0.8rem' }}>
                <FileText size={18} /> Baixar PDF
              </button>
              <button className="btn-primary" onClick={() => handleExport('pptx')} style={{ flex: 1, justifyContent: 'center', padding: '0.8rem' }}>
                <PresentationIcon size={18} /> Baixar PPTX
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
