import React from 'react';
import { createRoot } from 'react-dom/client';
import html2canvas from 'html2canvas';
import PresentationViewer from '../components/PresentationViewer';
import { SLIDE_NATIVE_WIDTH, SLIDE_NATIVE_HEIGHT } from './canvasConstants';

// Gera uma miniatura JPEG pequena do primeiro slide pra guardar na listagem
// da biblioteca (ver App.jsx#autosave e computeListingFields em
// server/services/store.js), em vez do HTML bruto do slide inteiro — que
// incluía qualquer imagem colada nele sem compressão nenhuma e era a causa
// real do payload de ~600KB da listagem com poucas apresentações com
// imagem. Mesmo padrão de captura (montar PresentationViewer escondido +
// html2canvas) já usado em exportDeck.js pra exportar PDF/PPTX.
const RENDER_TIMEOUT_MS = 15000;
const THUMBNAIL_WIDTH = 480; // 1/4 do palco nativo (1920x1080), mantém o 16:9
const SIZE_BUDGET_BYTES = 30000; // orçamento por miniatura (ver MAX_THUMBNAIL_BYTES em store.js)
const QUALITY_STEPS = [0.6, 0.45, 0.3];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createHiddenContainer() {
  const container = document.createElement('div');
  container.style.cssText = `position:fixed; top:0; left:-99999px; width:${SLIDE_NATIVE_WIDTH}px; height:${SLIDE_NATIVE_HEIGHT}px; overflow:hidden; pointer-events:none;`;
  document.body.appendChild(container);
  return container;
}

function renderAndCapture(container, htmlContent) {
  return new Promise((resolve, reject) => {
    const root = createRoot(container);
    const iframeRef = React.createRef();
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
      root.unmount();
    };

    const handleReady = async () => {
      try {
        const iframe = iframeRef.current;
        const canvas = await html2canvas(iframe.contentDocument.body, {
          width: SLIDE_NATIVE_WIDTH,
          height: SLIDE_NATIVE_HEIGHT,
          windowWidth: SLIDE_NATIVE_WIDTH,
          windowHeight: SLIDE_NATIVE_HEIGHT,
          // Captura já em resolução reduzida (não em 1920x1080 pra depois
          // reamostrar) — mais barato e é só isso que uma miniatura precisa.
          scale: THUMBNAIL_WIDTH / SLIDE_NATIVE_WIDTH,
          useCORS: true,
          backgroundColor: '#ffffff'
        });
        finish(resolve, canvas);
      } catch (err) {
        finish(reject, err);
      }
    };

    root.render(
      React.createElement(PresentationViewer, {
        ref: iframeRef,
        htmlContent,
        staticPreview: true,
        onReady: handleReady
      })
    );
  });
}

// Retorna uma data URI JPEG pequena, ou `null` se não houver HTML, a captura
// falhar, ou mesmo na pior qualidade o resultado ainda estourar o orçamento
// (slide raro e muito denso — melhor não ter miniatura do que arriscar
// estourar o limite de documento do Firestore).
export async function captureThumbnail(htmlContent) {
  if (!htmlContent) return null;

  const container = createHiddenContainer();
  try {
    const canvas = await Promise.race([
      renderAndCapture(container, htmlContent),
      sleep(RENDER_TIMEOUT_MS).then(() => { throw new Error('Tempo esgotado ao gerar a miniatura.'); })
    ]);

    for (const quality of QUALITY_STEPS) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrl.length <= SIZE_BUDGET_BYTES) return dataUrl;
    }
    return null;
  } catch (err) {
    console.error('Falha ao gerar miniatura da biblioteca:', err);
    return null;
  } finally {
    document.body.removeChild(container);
  }
}
