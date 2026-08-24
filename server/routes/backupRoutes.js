import express from 'express';
import multer from 'multer';
import os from 'os';
import fs from 'fs';
import {
  createBackup, restoreBackup, UnsupportedBackupVersionError, InvalidBackupFileError
} from '../services/backupService.js';
import { consumeDownload } from '../services/downloadRegistry.js';
import { createJob, updateJobProgress, finishJob, failJob, getJob } from '../services/backupJobRegistry.js';
import { getBucket } from '../services/firebaseAdmin.js';

const router = express.Router();

// Upload do .zip de backup escolhido no computador do usuário pra restaurar
// — direto em disco (os.tmpdir()), não em memória: o zip de uma conta com
// bastante mídia pode passar de dezenas/centenas de MB, e memoryStorage
// significaria segurar esse buffer inteiro na RAM do processo Node só pra
// depois escrever em disco de qualquer forma (unzipper.Open.file precisa de
// um caminho). Limite generoso (bem maior que os 50MB de mídia avulsa, ver
// materialsRoutes.js) porque aqui é o backup da conta INTEIRA de uma vez.
const uploadBackup = multer({
  storage: multer.diskStorage({ destination: os.tmpdir() }),
  limits: { fileSize: 500 * 1024 * 1024 }
});

function errorToEvent(err) {
  if (err instanceof UnsupportedBackupVersionError || err instanceof InvalidBackupFileError) {
    return { code: err.code, message: err.message };
  }
  return { code: 'internal_error', message: 'Erro inesperado ao processar o backup.' };
}

// Job assíncrono + polling em vez da resposta NDJSON em streaming que este
// endpoint usava antes (conexão HTTP aberta por dezenas de segundos,
// recebendo eventos de progresso aos poucos). Trocado depois de confirmar em
// produção, atrás do Cloudflare Tunnel do usuário, que a versão em streaming
// falhava com net::ERR_QUIC_PROTOCOL_ERROR E, mesmo desligando HTTP/3 no
// Cloudflare pra testar, com net::ERR_HTTP2_PROTOCOL_ERROR — o mesmo
// endpoint falhando nos dois protocolos descarta bug específico de um deles
// e aponta pra algo na forma como o túnel relaia uma resposta chunked/de
// streaming por múltiplos saltos. Ver server/services/backupJobRegistry.js.
// Cada requisição de status abaixo é curta e completa (JSON normal), sem
// depender de conexão nenhuma ficar aberta.
router.post('/create', (req, res) => {
  const jobId = createJob(req.user.id);
  res.json({ success: true, jobId });

  (async () => {
    try {
      const bucket = getBucket();
      const result = await createBackup({
        userId: req.user.id,
        user: req.user,
        bucket,
        onEvent: (evt) => updateJobProgress(jobId, evt)
      });
      finishJob(jobId, result);
    } catch (err) {
      console.error('Falha ao criar backup:', err);
      failJob(jobId, errorToEvent(err));
    }
  })();
});

router.get('/status/:jobId', (req, res) => {
  const job = getJob(req.params.jobId, req.user.id);
  if (!job) {
    return res.status(404).json({ error: 'Job não encontrado (talvez expirado — inicie de novo).' });
  }
  res.json({ status: job.status, progress: job.progress, result: job.result, error: job.error });
});

// Download de uso único do zip gerado por /create (ver downloadRegistry.js)
// — rota separada porque o resultado de /create é só um `downloadId` (via
// polling de /status) e o arquivo final é binário; não dá pra misturar os
// dois numa resposta HTTP só.
router.get('/download/:downloadId', async (req, res) => {
  const entry = consumeDownload(req.params.downloadId, req.user.id);
  if (!entry) {
    return res.status(404).json({ error: 'Backup não encontrado (talvez já baixado ou expirado — gere um novo).' });
  }
  res.download(entry.filePath, entry.fileName, (err) => {
    fs.promises.unlink(entry.filePath).catch(() => {});
    if (err && !res.headersSent) {
      res.status(500).json({ error: 'Falha ao enviar o arquivo de backup.' });
    }
  });
});

router.post('/restore', uploadBackup.single('backupFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo de backup enviado.' });
  }

  const jobId = createJob(req.user.id);
  res.json({ success: true, jobId });

  (async () => {
    try {
      const bucket = getBucket();
      const result = await restoreBackup({
        userId: req.user.id,
        zipFilePath: req.file.path,
        bucket,
        onEvent: (evt) => updateJobProgress(jobId, evt)
      });
      finishJob(jobId, result);
    } catch (err) {
      console.error('Falha ao restaurar backup:', err);
      failJob(jobId, errorToEvent(err));
    }
  })();
});

export default router;
