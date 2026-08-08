import React from 'react';
import { createRoot } from 'react-dom/client';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import PptxGenJS from 'pptxgenjs';
import PresentationViewer from '../components/PresentationViewer';
import { SLIDE_NATIVE_WIDTH, SLIDE_NATIVE_HEIGHT } from './canvasConstants';

// Todo slide é HTML/CSS/JS livre gerado por IA (gráficos Chart.js, diagramas
// Mermaid, fontes, animações, embeds) — não dá pra reconstruir isso como
// formas nativas editáveis de PDF/PPTX. A abordagem aqui é tirar um "print"
// de cada slide no tamanho nativo (1920x1080) e montar o arquivo com uma
// imagem cheia por página/slide (confirmado com o usuário, ver plano).

const RENDER_TIMEOUT_MS = 15000; // segurança: um slide com JS quebrado nunca deveria travar o export inteiro
const JPEG_QUALITY = 0.92;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createHiddenContainer() {
  const container = document.createElement('div');
  // Fora da área visível (não é display:none — um elemento sem layout não
  // deixa o iframe interno medir tamanho de verdade, e o script do slide
  // conta com getBoundingClientRect() real pra várias coisas).
  container.style.cssText = `position:fixed; top:0; left:-99999px; width:${SLIDE_NATIVE_WIDTH}px; height:${SLIDE_NATIVE_HEIGHT}px; overflow:hidden; pointer-events:none;`;
  document.body.appendChild(container);
  return container;
}

// Monta um PresentationViewer sozinho no container escondido, espera ele
// terminar de carregar (onReady, ver PresentationViewer.jsx — inclui webfonts
// + um delay pra Chart.js/Mermaid desenharem) e captura o documento interno
// do iframe como imagem via html2canvas. `useCORS:true` deixa passar imagens
// de hosts que liberam CORS pra leitura pública (ex. Firebase Storage) — uma
// imagem de um host que NÃO libera CORS "tainta" o canvas e a captura falha
// (ver catch em renderSlidesToImages, que cai num placeholder pra esse slide
// específico em vez de derrubar o export inteiro).
function renderOneSlide(container, htmlContent) {
  return new Promise((resolve, reject) => {
    const root = createRoot(container);
    const iframeRef = React.createRef();
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
      // Desmontar aqui (fora do ciclo de render do React, já que onReady é
      // chamado de um setTimeout comum) libera o iframe/scripts do slide
      // anterior antes do próximo montar — sem isso a memória cresceria a
      // cada slide capturado num deck grande.
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
          scale: 1,
          useCORS: true,
          backgroundColor: '#090d16'
        });
        finish(resolve, canvas.toDataURL('image/jpeg', JPEG_QUALITY));
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

async function renderOneSlideWithTimeout(container, htmlContent) {
  return Promise.race([
    renderOneSlide(container, htmlContent),
    sleep(RENDER_TIMEOUT_MS).then(() => { throw new Error('Tempo esgotado ao renderizar o slide.'); })
  ]);
}

// Renderiza cada slide NÃO-oculto da apresentação (mesmo filtro usado pela
// navegação real, ver handleNext/handlePrev em PresentationEditor.jsx) numa
// imagem JPEG em 1920x1080, um de cada vez (sequencial — mais leve que
// paralelo e evita competir por CPU/memória num deck grande). `onProgress(i,
// total)` é chamado antes de cada slide começar a renderizar. Um slide que
// falhar (ex. canvas tainted por imagem sem CORS) vira `null` no array em vez
// de derrubar o export inteiro — quem monta o PDF/PPTX decide o que fazer com
// isso (ver buildPdf/buildPptx abaixo).
export async function renderSlidesToImages(slides, { onProgress } = {}) {
  const visibleSlides = (slides || []).filter((s) => !s.hidden);
  const container = createHiddenContainer();
  const images = [];

  try {
    for (let i = 0; i < visibleSlides.length; i++) {
      onProgress?.(i + 1, visibleSlides.length);
      try {
        const dataUrl = await renderOneSlideWithTimeout(container, visibleSlides[i].html);
        images.push(dataUrl);
      } catch (err) {
        console.error(`Falha ao capturar o slide ${i + 1}:`, err);
        images.push(null);
      }
    }
  } finally {
    document.body.removeChild(container);
  }

  return images;
}

// ̀-ͯ são os acentos combinantes que sobram depois do
// normalize('NFD') (ex.: "ç" -> "c" + combining cedilla) — removê-los antes
// do filtro de a-z0-9 é o que transforma "Dor Neuropática" em "dor-neuropatica"
// em vez de derrubar o "a" acentuado inteiro.
const COMBINING_MARKS_REGEX = /[̀-ͯ]/g;

function slugify(text) {
  return (text || 'apresentacao')
    .toLowerCase()
    .normalize('NFD').replace(COMBINING_MARKS_REGEX, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'apresentacao';
}

export function buildPdf(images, presentationTitle) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'px', format: [SLIDE_NATIVE_WIDTH, SLIDE_NATIVE_HEIGHT] });

  images.forEach((dataUrl, i) => {
    if (i > 0) doc.addPage([SLIDE_NATIVE_WIDTH, SLIDE_NATIVE_HEIGHT], 'landscape');
    if (dataUrl) {
      doc.addImage(dataUrl, 'JPEG', 0, 0, SLIDE_NATIVE_WIDTH, SLIDE_NATIVE_HEIGHT);
    } else {
      doc.setFillColor(9, 13, 22);
      doc.rect(0, 0, SLIDE_NATIVE_WIDTH, SLIDE_NATIVE_HEIGHT, 'F');
      doc.setTextColor(248, 113, 113);
      doc.setFontSize(32);
      doc.text('Captura indisponível para este slide', SLIDE_NATIVE_WIDTH / 2, SLIDE_NATIVE_HEIGHT / 2, { align: 'center' });
    }
  });

  doc.save(`${slugify(presentationTitle)}.pdf`);
}

export async function buildPptx(images, presentationTitle) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'POS_16_9', width: 13.333, height: 7.5 });
  pptx.layout = 'POS_16_9';

  images.forEach((dataUrl) => {
    const slide = pptx.addSlide();
    if (dataUrl) {
      slide.addImage({ data: dataUrl, x: 0, y: 0, w: 13.333, h: 7.5 });
    } else {
      slide.background = { color: '090D16' };
      slide.addText('Captura indisponível para este slide', {
        x: 0.5, y: 3.4, w: 12.333, h: 0.7, align: 'center', color: 'F87171', fontSize: 20, bold: true
      });
    }
  });

  await pptx.writeFile({ fileName: `${slugify(presentationTitle)}.pptx` });
}
