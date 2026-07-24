import express from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import axios from 'axios';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { fork } from 'child_process';
import { fileURLToPath } from 'url';
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
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Renderização de página (pdfjs-dist + @napi-rs/canvas) roda inteira dentro
// deste script, num PROCESSO FILHO à parte — ver pdfImportWorker.js pro
// porquê (isolar um crash/estouro de memória do processo principal do
// servidor) e a lógica de renderização em si.
const PDF_IMPORT_WORKER_PATH = path.join(__dirname, '..', 'services', 'pdfImportWorker.js');

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

// Renderizar 30+ páginas numa única requisição HTTP estourava o timeout do
// proxy da hospedagem (Render free tier: instância "dorme" após inatividade
// e ainda tem um teto de tempo de resposta — 31 páginas sequenciais somadas
// ao cold start já bastam pra romper a conexão, e o navegador só reporta
// "Failed to fetch", sem detalhe nenhum). Em vez de segurar a resposta até
// renderizar tudo, /upload-presentation devolve um jobId quase na hora (só
// espera abrir o PDF, rápido) e processa as páginas em segundo plano — o
// cliente acompanha o progresso via polling em /upload-presentation/:jobId
// (ver handleSubmitImport em AIModalGenerator.jsx). Cada poll também conta
// como tráfego pra a instância, então ela não volta a dormir no meio do job.
const importJobs = new Map(); // jobId -> { status, pageCount, pagesDone, pageImages, error, createdAt }
const IMPORT_JOB_TTL_MS = 30 * 60 * 1000;

function scheduleImportJobCleanup(jobId) {
  setTimeout(() => importJobs.delete(jobId), IMPORT_JOB_TTL_MS).unref();
}

// Sobe o buffer do PDF pra um arquivo temporário e inicia o processo filho
// (pdfImportWorker.js) que renderiza+sobe cada página, atualizando o job em
// `importJobs` conforme as mensagens chegam — chamada sem `await` pelo
// handler da rota (a resposta HTTP já foi enviada antes disto começar).
async function startImportJob(jobId, pdfBuffer, userId) {
  const job = importJobs.get(jobId);
  const tmpPath = path.join(os.tmpdir(), `pdf-import-${jobId}.pdf`);
  await fs.writeFile(tmpPath, pdfBuffer);

  const child = fork(PDF_IMPORT_WORKER_PATH, [jobId, tmpPath, userId], {
    // 'inherit' nos fds 0-2 pra log do worker (console.error de erro por
    // página) aparecer junto do log normal do servidor — só o canal ipc
    // (índice 3, implícito em fork) é exclusivo desta comunicação pai/filho.
    stdio: ['inherit', 'inherit', 'inherit', 'ipc']
  });
  let settled = false;

  const finish = (status, error) => {
    if (settled) return;
    settled = true;
    job.status = status;
    if (error) job.error = error;
    scheduleImportJobCleanup(jobId);
    fs.unlink(tmpPath).catch(() => {});
  };

  child.on('message', (msg) => {
    if (msg?.type === 'page') {
      job.pagesDone = msg.index;
      job.pageImages.push(msg.url);
      if (!msg.url) job.failedPages++;
    } else if (msg?.type === 'done') {
      finish(job.pageImages.every((url) => !url) ? 'error' : 'done',
        job.pageImages.every((url) => !url) ? 'Não foi possível renderizar nenhuma página deste PDF.' : null);
    } else if (msg?.type === 'error') {
      finish('error', msg.message || 'Falha ao processar o PDF.');
    }
  });

  // Processo filho encerrado sem ter mandado 'done'/'error' — provável crash
  // (estouro de memória, mais comum: SIGKILL do próprio SO/plataforma) no
  // meio do trabalho. Como isolamos a renderização aqui, o servidor
  // principal nunca cai junto — só reporta o que deu pra completar.
  child.on('exit', (code, signal) => {
    if (settled) return;
    console.error(`[import ${jobId}] processo de renderização encerrado inesperadamente (code=${code}, signal=${signal}) na página ${job.pagesDone}/${job.pageCount}`);
    finish('error', `A importação foi interrompida (provavelmente por limite de memória do servidor) na página ${job.pagesDone} de ${job.pageCount}. Tente novamente ou divida o PDF em partes menores.`);
  });

  child.on('error', (err) => {
    console.error(`[import ${jobId}] erro ao iniciar processo de renderização:`, err);
    finish('error', 'Falha ao iniciar o processo de importação.');
  });
}

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

    // Só conta páginas aqui (rápido, leve) — a renderização de verdade (mais
    // pesada) fica isolada no processo filho, ver startImportJob acima.
    const pdfData = await pdfParse(req.file.buffer);

    if (pdfData.numpages > MAX_IMPORT_PAGES) {
      return res.status(400).json({
        error: `Este PDF tem ${pdfData.numpages} páginas — o limite pra importação é ${MAX_IMPORT_PAGES}. Divida o arquivo em partes menores.`
      });
    }

    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    importJobs.set(jobId, {
      status: 'processing',
      pageCount: pdfData.numpages,
      pagesDone: 0,
      pageImages: [],
      failedPages: 0,
      error: null
    });

    res.json({ success: true, jobId, pageCount: pdfData.numpages });

    // Roda depois da resposta já enviada — erros daqui em diante só existem
    // no estado do job (ver /upload-presentation/:jobId), nunca mais numa
    // resposta HTTP desta requisição.
    startImportJob(jobId, req.file.buffer, req.user.id).catch((err) => {
      console.error(`Falha inesperada ao iniciar job de importação ${jobId}:`, err);
      const job = importJobs.get(jobId);
      if (job) {
        job.status = 'error';
        job.error = 'Falha inesperada ao processar o PDF.';
        scheduleImportJobCleanup(jobId);
      }
    });
  } catch (error) {
    console.error('Erro na rota upload-presentation:', error);
    res.status(500).json({ error: 'Falha ao processar o PDF enviado.' });
  }
});

// Progresso do job de importação criado acima — o cliente faz polling nisto
// (ver handleSubmitImport em AIModalGenerator.jsx) até status !== 'processing'.
router.get('/upload-presentation/:jobId', (req, res) => {
  const job = importJobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job de importação não encontrado (pode ter expirado).' });
  }

  res.json({
    success: true,
    status: job.status,
    pageCount: job.pageCount,
    pagesDone: job.pagesDone,
    pageImages: job.status === 'done' ? job.pageImages : undefined,
    error: job.error || undefined,
    warning: job.status === 'done' && job.failedPages > 0
      ? `${job.failedPages} de ${job.pageCount} página(s) não puderam ser renderizadas e ficaram em branco.`
      : undefined
  });
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
