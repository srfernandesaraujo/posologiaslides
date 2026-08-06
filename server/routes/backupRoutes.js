import express from 'express';
import multer from 'multer';
import os from 'os';
import fs from 'fs';
import {
  createBackup, restoreBackup, UnsupportedBackupVersionError, InvalidBackupFileError
} from '../services/backupService.js';
import { consumeDownload } from '../services/downloadRegistry.js';
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
    return { type: 'error', code: err.code, message: err.message };
  }
  return { type: 'error', code: 'internal_error', message: 'Erro inesperado ao processar o backup.' };
}

// NDJSON (uma linha JSON por evento de progresso) via chunked transfer, em
// vez de "dispara job + endpoint de status/polling" — menos infraestrutura
// nova pra uma ação manual de uso ocasional, e dá feedback de progresso sem
// precisar bufferizar a resposta inteira (contas com bastante mídia podem
// levar um tempo pra empacotar/restaurar). Precisa ser iniciado ANTES de
// qualquer erro possível no meio da operação, porque depois de `writeHead`
// não dá mais pra trocar o status HTTP.
function startNdjsonStream(res) {
  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no'
  });
  return (evt) => res.write(JSON.stringify(evt) + '\n');
}

router.post('/create', async (req, res) => {
  const emit = startNdjsonStream(res);
  try {
    const bucket = getBucket();
    await createBackup({ userId: req.user.id, user: req.user, bucket, onEvent: emit });
  } catch (err) {
    console.error('Falha ao criar backup:', err);
    emit(errorToEvent(err));
  } finally {
    res.end();
  }
});

// Download de uso único do zip gerado por /create (ver downloadRegistry.js)
// — rota separada (não devolvida já no POST /create) porque a resposta de
// /create é NDJSON (texto, evento a evento) e o arquivo final é binário; não
// dá pra misturar os dois numa resposta HTTP só.
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

router.post('/restore', uploadBackup.single('backupFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo de backup enviado.' });
  }

  const emit = startNdjsonStream(res);
  try {
    const bucket = getBucket();
    await restoreBackup({ userId: req.user.id, zipFilePath: req.file.path, bucket, onEvent: emit });
  } catch (err) {
    console.error('Falha ao restaurar backup:', err);
    emit(errorToEvent(err));
  } finally {
    res.end();
  }
});

export default router;
