import express from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import axios from 'axios';
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
const MAX_CHARS_PER_PAGE = 3000;

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
// modo "Importar apresentação existente") — extrai o texto POR PÁGINA (não um
// blob só concatenado, como /upload-file acima), pra a IA conseguir reproduzir
// um slide por página original em vez de perder a fronteira entre elas.
router.post('/upload-presentation', uploadPresentationFile.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Envie um arquivo PDF.' });
    }

    const pages = [];
    // `pagerender` roda uma vez por página do PDF, na ordem — captura o texto
    // de cada uma num array próprio, sem alterar a concatenação padrão da lib
    // (que continua disponível em pdfData.text, só não é usada aqui).
    const pagerender = async (pageData) => {
      const textContent = await pageData.getTextContent();
      const text = textContent.items.map((item) => item.str).join(' ');
      pages.push(text.slice(0, MAX_CHARS_PER_PAGE));
      return text;
    };

    const pdfData = await pdfParse(req.file.buffer, { pagerender });

    if (pdfData.numpages > MAX_IMPORT_PAGES) {
      return res.status(400).json({
        error: `Este PDF tem ${pdfData.numpages} páginas — o limite pra importação é ${MAX_IMPORT_PAGES}. Divida o arquivo em partes menores.`
      });
    }

    const avgCharsPerPage = pages.reduce((sum, p) => sum + p.length, 0) / (pages.length || 1);
    if (avgCharsPerPage < 30) {
      return res.status(400).json({
        error: 'Não foi possível extrair texto deste PDF — parece ser um documento escaneado (só imagem). Exporte como PDF de texto (ex: direto do PowerPoint/Google Slides/Keynote) e tente de novo.'
      });
    }

    res.json({ success: true, pages, pageCount: pages.length });
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
