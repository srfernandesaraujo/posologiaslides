import express from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { assertSafeUrl } from '../services/urlSafety.js';
import { getBucket } from '../services/firebaseAdmin.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
// Mídia embutida em slide (imagem/vídeo/áudio) vai para o Cloud Storage, não
// para o corpo da requisição de IA — por isso aceita arquivos bem maiores.
const uploadMedia = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
// PDF de uma apresentação existente (importação, ver /upload-presentation) —
// maior que o limite de texto de referência porque decks em PDF costumam
// pesar mais (imagens embutidas) — mesmo teto do upload de mídia bruta.
const uploadPresentationFile = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const MAX_IMPORT_PAGES = 60;

// Fontes/cmaps padrão do PDF.js (usados quando o PDF referencia uma das 14
// fontes-base do PDF, ex. Helvetica, sem embutir o glifo) — sem apontar pra
// eles, o pdfjs lança "Ensure that the standardFontDataUrl API parameter is
// provided" e cai num fallback grosseiro pro texto que usa essas fontes.
// ARMADILHA: apesar do nome "*Url", rodando em Node o pdfjs passa esse valor
// direto pra `fs.readFile()` no processo principal (ver node_utils_fetchData
// em pdf.mjs) — uma STRING "file://..." não é reconhecida como URL por
// fs.readFile (só um objeto URL de verdade seria), então precisa ser um
// caminho de sistema de arquivos puro aqui, não o .href de pathToFileURL.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDFJS_DIST_DIR = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist');
// A validação interna do pdfjs exige barra "/" no fim (não path.sep — no
// Windows seria "\", rejeitado), mesmo passando por fs.readFile depois.
const PDFJS_STANDARD_FONTS_URL = path.join(PDFJS_DIST_DIR, 'standard_fonts') + '/';
const PDFJS_CMAPS_URL = path.join(PDFJS_DIST_DIR, 'cmaps') + '/';

// Renderiza uma página do PDF (já carregado via pdfjsLib.getDocument) pra um
// buffer JPEG — usada pela importação "idêntica" (ver /upload-presentation
// abaixo): em vez de pedir pra IA reconstruir o slide a partir só do texto
// (perdendo imagens/gráficos/layout do original), cada página vira a própria
// imagem de fundo do slide, pixel a pixel igual ao PDF.
async function renderPdfPageToJpeg(pdfDoc, pageNumber, targetWidth = 1920) {
  const page = await pdfDoc.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  // Escala pro alvo de largura, com teto/piso pra páginas muito pequenas ou
  // enormes não gerarem uma imagem ínfima nem estourarem tempo/memória.
  const scale = Math.min(3, Math.max(1, targetWidth / baseViewport.width));
  const viewport = page.getViewport({ scale });

  const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
  const ctx = canvas.getContext('2d');
  // Fundo branco antes de renderizar — páginas PDF quase sempre já são
  // opacas, mas o canvas nasce transparente, e JPEG não tem canal alfa
  // (qualquer área não coberta viraria preta na conversão sem isto).
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport }).promise;

  return canvas.encode('jpeg', 92);
}

const MAX_REDIRECTS = 5;

// Busca a URL manualmente seguindo redirecionamentos um a um, validando
// cada destino contra IPs privados/loopback/link-local antes de segui-lo
// (evita bypass do filtro de SSRF via redirect para endereço interno).
async function fetchSafely(rawUrl) {
  let currentUrl = rawUrl;

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await assertSafeUrl(currentUrl);

    const response = await axios.get(currentUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 8000,
      maxRedirects: 0,
      maxContentLength: 5 * 1024 * 1024,
      maxBodyLength: 5 * 1024 * 1024,
      validateStatus: (status) => (status >= 200 && status < 300) || (status >= 300 && status < 400)
    });

    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      currentUrl = new URL(response.headers.location, currentUrl).toString();
      continue;
    }

    return response;
  }

  throw new Error('Muitos redirecionamentos.');
}

// Upload e extração de texto de PDF / TXT
router.post('/upload-file', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    const { originalname, mimetype, buffer } = req.file;

    // Imagens não têm texto a extrair: retorna o base64 para uso como entrada
    // multimodal na IA (Gemini Vision), em vez do texto de placeholder anterior.
    if (mimetype.startsWith('image/')) {
      return res.json({
        success: true,
        filename: originalname,
        mimeType: mimetype,
        base64: buffer.toString('base64')
      });
    }

    let extractedText = '';
    if (mimetype === 'application/pdf') {
      const pdfData = await pdfParse(buffer);
      extractedText = pdfData.text;
    } else if (mimetype.startsWith('text/')) {
      extractedText = buffer.toString('utf-8');
    } else {
      extractedText = `[Arquivo recebido: ${originalname} (Tipo: ${mimetype})]`;
    }

    res.json({
      success: true,
      filename: originalname,
      text: extractedText.substring(0, 8000) // limita para não exceder contexto
    });
  } catch (error) {
    console.error('Erro na rota upload-file:', error);
    res.status(500).json({ error: 'Falha ao processar arquivo enviado.' });
  }
});

// Upload de PDF pra IMPORTAR uma apresentação existente (ver AIModalGenerator,
// modo "Importar apresentação existente") — renderiza cada PÁGINA como uma
// imagem (pixel a pixel igual ao PDF original: texto, fotos, gráficos,
// layout) e sobe cada uma pro Cloud Storage. O cliente monta um slide por
// página usando essa imagem como fundo inteiro — SEM IA no meio, então nada
// de texto/imagem se perde e funciona até em PDF escaneado (só imagem, sem
// camada de texto), que a extração de texto antiga rejeitava.
router.post('/upload-presentation', uploadPresentationFile.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Envie um arquivo PDF.' });
    }

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(req.file.buffer),
      standardFontDataUrl: PDFJS_STANDARD_FONTS_URL,
      cMapUrl: PDFJS_CMAPS_URL,
      cMapPacked: true,
      disableFontFace: true,
      isEvalSupported: false
    });
    const pdfDoc = await loadingTask.promise;

    if (pdfDoc.numPages > MAX_IMPORT_PAGES) {
      return res.status(400).json({
        error: `Este PDF tem ${pdfDoc.numPages} páginas — o limite pra importação é ${MAX_IMPORT_PAGES}. Divida o arquivo em partes menores.`
      });
    }

    const bucket = getBucket();
    const importId = Date.now();
    const pageImages = [];
    let failedPages = 0;

    // Sequencial (não Promise.all) — renderizar é pesado em CPU/memória, e um
    // PDF de 50+ páginas em paralelo poderia estourar o processo do servidor.
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      try {
        const jpegBuffer = await renderPdfPageToJpeg(pdfDoc, i);
        const objectPath = `imports/${req.user.id}/${importId}/page-${String(i).padStart(3, '0')}.jpg`;
        const file = bucket.file(objectPath);
        await file.save(jpegBuffer, { metadata: { contentType: 'image/jpeg' }, resumable: false });
        await file.makePublic();
        pageImages.push(`https://storage.googleapis.com/${bucket.name}/${objectPath}`);
      } catch (pageError) {
        console.error(`Erro ao renderizar página ${i} do PDF importado:`, pageError);
        failedPages++;
        pageImages.push(null);
      }
    }

    if (pageImages.every((url) => !url)) {
      return res.status(500).json({ error: 'Não foi possível renderizar nenhuma página deste PDF.' });
    }

    res.json({
      success: true,
      pageCount: pdfDoc.numPages,
      pageImages,
      warning: failedPages > 0 ? `${failedPages} de ${pdfDoc.numPages} página(s) não puderam ser renderizadas e ficaram em branco.` : undefined
    });
  } catch (error) {
    console.error('Erro na rota upload-presentation:', error);
    res.status(500).json({ error: 'Falha ao processar o PDF enviado.' });
  }
});

// Upload de mídia (imagem/vídeo/áudio) para embutir num slide. Vai para o
// Cloud Storage e devolve uma URL pública — o slide referencia essa URL em
// vez de carregar o arquivo como data: URI dentro do documento da
// apresentação, que é salvo inteiro como um único documento no Firestore
// (limite rígido de 1 MiB).
router.post('/upload-media', uploadMedia.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    const { originalname, mimetype, buffer } = req.file;
    const isImage = mimetype.startsWith('image/');
    const isVideo = mimetype.startsWith('video/');
    const isAudio = mimetype.startsWith('audio/');

    if (!isImage && !isVideo && !isAudio) {
      return res.status(400).json({ error: 'Tipo de arquivo não suportado — envie imagem, vídeo ou áudio.' });
    }

    // Escopa por usuário e sanitiza o nome pra evitar path traversal / caracteres
    // inválidos no nome do objeto no bucket.
    const safeName = originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
    const objectPath = `media/${req.user.id}/${Date.now()}-${safeName}`;
    const bucket = getBucket();
    const file = bucket.file(objectPath);

    await file.save(buffer, { metadata: { contentType: mimetype }, resumable: false });
    await file.makePublic();

    res.json({
      success: true,
      url: `https://storage.googleapis.com/${bucket.name}/${objectPath}`,
      type: isImage ? 'image' : isVideo ? 'video' : 'audio',
      name: originalname
    });
  } catch (error) {
    console.error('Erro na rota upload-media:', error);
    res.status(500).json({ error: 'Falha ao enviar arquivo para o armazenamento.' });
  }
});

// Extração de conteúdo de URL web
router.post('/parse-url', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL é obrigatória.' });
    }

    const response = await fetchSafely(url);

    const html = response.data;
    // Extrai texto removendo tags HTML brutas
    const cleanText = typeof html === 'string' 
      ? html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
      : 'Conteúdo obtido da URL';

    res.json({
      success: true,
      url,
      text: cleanText.substring(0, 8000)
    });
  } catch (error) {
    console.error('Erro na rota parse-url:', error.message);
    res.status(500).json({ error: 'Não foi possível ler o conteúdo do link fornecido.' });
  }
});

export default router;
