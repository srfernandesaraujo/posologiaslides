// Processo FILHO (ver child_process.fork em materialsRoutes.js) que faz o
// trabalho pesado da importação de PDF "idêntica" — renderizar cada página
// como imagem via pdfjs-dist + @napi-rs/canvas e subir pro Cloud Storage.
//
// Por que um processo separado: a primeira versão fazia isso dentro do
// processo principal do servidor, e num PDF real de 31 páginas (com fotos/
// diagramas embutidos, ao contrário do PDF sintético de teste) o processo
// inteiro morria no meio do trabalho — provável estouro de memória (a
// instância grátis do Render tem só 512 MiB, e cada canvas renderizado +
// cache interno do pdfjs por página vai acumulando). Como derrubava o
// processo INTEIRO, toda a API ficava fora do ar até o Render reiniciar a
// instância, e até o polling de progresso (ver /upload-presentation/:jobId)
// passava a falhar com "Failed to fetch". Isolando aqui: se ESTE processo
// morrer (OOM ou qualquer outro crash), só ele morre — o servidor principal
// continua respondendo normalmente e reporta o erro de forma limpa (ver
// listener 'exit' em materialsRoutes.js) em vez de cair junto.
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { getBucket } from './firebaseAdmin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDFJS_DIST_DIR = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist');
// Ver comentário equivalente que existia em materialsRoutes.js: precisa ser
// caminho de sistema de arquivos puro terminado em "/", não um file:// URL
// (pdfjs repassa direto pra fs.readFile, que não entende a string file://).
const PDFJS_STANDARD_FONTS_URL = path.join(PDFJS_DIST_DIR, 'standard_fonts') + '/';
const PDFJS_CMAPS_URL = path.join(PDFJS_DIST_DIR, 'cmaps') + '/';

async function renderPdfPageToJpeg(pdfDoc, pageNumber, targetWidth = 1400) {
  const page = await pdfDoc.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(3, Math.max(1, targetWidth / baseViewport.width));
  const viewport = page.getViewport({ scale });

  const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport }).promise;
  const buffer = await canvas.encode('jpeg', 82);

  // Libera os caches internos do pdfjs pra esta página (fontes/glifos/
  // imagens decodificadas) — sem isto, memória cresce cumulativamente a
  // cada página processada dentro do mesmo documento, mesmo já tendo subido
  // e descartado o buffer JPEG anterior.
  page.cleanup();
  return buffer;
}

async function main() {
  const [jobId, pdfPath, userId] = process.argv.slice(2);
  if (!jobId || !pdfPath || !userId) {
    throw new Error('Uso: pdfImportWorker.js <jobId> <pdfPath> <userId>');
  }

  const bucket = getBucket();
  const data = new Uint8Array(await fs.readFile(pdfPath));

  const loadingTask = pdfjsLib.getDocument({
    data,
    standardFontDataUrl: PDFJS_STANDARD_FONTS_URL,
    cMapUrl: PDFJS_CMAPS_URL,
    cMapPacked: true,
    disableFontFace: true,
    isEvalSupported: false
  });
  const pdfDoc = await loadingTask.promise;

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    let url = null;
    try {
      const jpegBuffer = await renderPdfPageToJpeg(pdfDoc, i);
      const objectPath = `imports/${userId}/${jobId}/page-${String(i).padStart(3, '0')}.jpg`;
      const file = bucket.file(objectPath);
      await file.save(jpegBuffer, { metadata: { contentType: 'image/jpeg' }, resumable: false });
      await file.makePublic();
      url = `https://storage.googleapis.com/${bucket.name}/${objectPath}`;
    } catch (pageError) {
      console.error(`[pdfImportWorker ${jobId}] Erro ao renderizar página ${i}:`, pageError);
    }
    // Manda uma mensagem por página (não só no final) — o processo pai
    // atualiza o progresso do job incrementalmente, e se ESTE processo
    // morrer no meio, o pai já sabe quantas páginas tinham sido concluídas.
    process.send({ type: 'page', index: i, url });
  }

  process.send({ type: 'done' });
  await fs.unlink(pdfPath).catch(() => {});
  process.exit(0);
}

main().catch(async (err) => {
  console.error('[pdfImportWorker] Erro fatal:', err);
  try {
    process.send({ type: 'error', message: err.message || 'Falha ao processar o PDF.' });
  } catch {
    // Canal IPC já pode ter fechado — o listener 'exit' do pai cobre esse caso.
  }
  process.exit(1);
});
