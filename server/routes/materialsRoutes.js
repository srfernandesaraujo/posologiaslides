import express from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import axios from 'axios';
import { assertSafeUrl } from '../services/urlSafety.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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
