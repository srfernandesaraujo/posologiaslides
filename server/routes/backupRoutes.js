import express from 'express';
import { buildDriveClient, DriveTokenExpiredError } from '../services/googleDriveClient.js';
import { createBackup, restoreBackup, listBackups, UnsupportedBackupVersionError } from '../services/backupService.js';
import { getBucket } from '../services/firebaseAdmin.js';

const router = express.Router();

// Autorização do Drive é POR REQUISIÇÃO, separada do `Authorization: Bearer
// <firebaseIdToken>` que o `requireAuth` já verifica (ver server/index.js) —
// o backend nunca persiste esse token, só usa na hora de cada chamada à
// Drive API (ver client/src/lib/googleDriveAuth.js: token de vida curta,
// pedido sob demanda, não guardado em disco/Firestore).
function getDriveAccessToken(req) {
  return req.headers['x-google-access-token'] || null;
}

function errorToEvent(err) {
  if (err instanceof DriveTokenExpiredError) {
    return { type: 'error', code: err.code, message: err.message };
  }
  if (err instanceof UnsupportedBackupVersionError) {
    return { type: 'error', code: err.code, message: err.message };
  }
  return { type: 'error', code: 'internal_error', message: 'Erro inesperado ao processar o backup.' };
}

// NDJSON (uma linha JSON por evento de progresso) via chunked transfer, em
// vez de "dispara job + endpoint de status/polling" — menos infraestrutura
// nova pra um botão manual de uso ocasional, e não depende de bufferizar a
// resposta inteira até o fim (backup/restore de contas com bastante mídia
// pode levar minutos). Precisa ser iniciado ANTES de qualquer erro possível
// no meio da operação, porque depois de `writeHead` não dá mais pra trocar o
// status HTTP — por isso os erros de validação de entrada (token/fileId
// ausente) respondem como JSON comum, só o corpo da operação em si é NDJSON.
function startNdjsonStream(res) {
  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no'
  });
  return (evt) => res.write(JSON.stringify(evt) + '\n');
}

router.get('/list', async (req, res) => {
  const accessToken = getDriveAccessToken(req);
  if (!accessToken) return res.status(400).json({ error: 'Token de acesso do Google Drive ausente.' });

  try {
    const driveClient = buildDriveClient(accessToken);
    const { folderId, backups } = await listBackups({ driveClient });
    res.json({ success: true, folderId, backups });
  } catch (err) {
    if (err instanceof DriveTokenExpiredError) {
      return res.status(401).json({ error: err.message, code: err.code });
    }
    console.error('Falha ao listar backups do Drive:', err);
    res.status(500).json({ error: 'Falha ao listar backups do Drive.' });
  }
});

router.post('/create', async (req, res) => {
  const accessToken = getDriveAccessToken(req);
  if (!accessToken) return res.status(400).json({ error: 'Token de acesso do Google Drive ausente.' });

  const emit = startNdjsonStream(res);
  try {
    const driveClient = buildDriveClient(accessToken);
    const bucket = getBucket();
    await createBackup({ userId: req.user.id, user: req.user, driveClient, bucket, onEvent: emit });
  } catch (err) {
    console.error('Falha ao criar backup:', err);
    emit(errorToEvent(err));
  } finally {
    res.end();
  }
});

router.post('/restore', async (req, res) => {
  const accessToken = getDriveAccessToken(req);
  const { fileId } = req.body || {};
  if (!accessToken) return res.status(400).json({ error: 'Token de acesso do Google Drive ausente.' });
  if (!fileId) return res.status(400).json({ error: 'fileId é obrigatório.' });

  const emit = startNdjsonStream(res);
  try {
    const driveClient = buildDriveClient(accessToken);
    const bucket = getBucket();
    await restoreBackup({ userId: req.user.id, fileId, driveClient, bucket, onEvent: emit });
  } catch (err) {
    console.error('Falha ao restaurar backup:', err);
    emit(errorToEvent(err));
  } finally {
    res.end();
  }
});

export default router;
