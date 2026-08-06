// Wrapper fino sobre a Google Drive API (googleapis) — cada chamada usa o
// OAuth access token do PRÓPRIO usuário (escopo drive.file, pedido sob
// demanda no client via reauthenticateWithPopup, ver
// client/src/lib/googleDriveAuth.js), nunca uma service account: o backup
// precisa ficar no Drive do usuário, não num Drive da aplicação. O backend
// nunca persiste esse token — só usa na hora de cada requisição (ver
// backupRoutes.js).
import fs from 'fs';
import { google } from 'googleapis';

const BACKUP_FOLDER_NAME = 'Posologia Slides - Backups';
const BACKUP_FILE_PREFIX = 'posologia-backup-';

// Token expirado/rejeitado no meio de uma operação (a Drive API devolve 401)
// — o Firebase client-side não fornece refresh_token pra esse fluxo, então a
// única saída na v1 é a UI pedir pro usuário reiniciar a operação. Erro
// tipado pra backupRoutes.js reconhecer e traduzir num evento NDJSON
// específico (`drive_token_expired`) em vez de um erro genérico.
export class DriveTokenExpiredError extends Error {
  constructor() {
    super('O token de acesso ao Google Drive expirou ou foi rejeitado.');
    this.name = 'DriveTokenExpiredError';
    this.code = 'drive_token_expired';
  }
}

function isAuthError(err) {
  const status = err?.code || err?.response?.status;
  return status === 401 || status === 403 && /insufficient|invalid.*credential/i.test(err?.message || '');
}

async function callDrive(fn) {
  try {
    return await fn();
  } catch (err) {
    if (isAuthError(err)) throw new DriveTokenExpiredError();
    throw err;
  }
}

export function buildDriveClient(accessToken) {
  if (!accessToken) throw new Error('Access token do Google Drive ausente.');
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.drive({ version: 'v3', auth });
}

// Localiza a pasta de backups na raiz do Drive do usuário (por nome, não por
// id salvo em algum lugar — não guardamos estado do lado do servidor sobre o
// Drive de cada usuário) ou cria se ainda não existir. Idempotente.
export async function findOrCreateBackupFolder(drive) {
  const existing = await callDrive(() => drive.files.list({
    q: `name = '${BACKUP_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and 'root' in parents`,
    fields: 'files(id, name)',
    spaces: 'drive'
  }));
  if (existing.data.files?.length) return existing.data.files[0].id;

  const created = await callDrive(() => drive.files.create({
    requestBody: { name: BACKUP_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id'
  }));
  return created.data.id;
}

export async function listBackups(drive, folderId) {
  const res = await callDrive(() => drive.files.list({
    q: `'${folderId}' in parents and name contains '${BACKUP_FILE_PREFIX}' and trashed = false`,
    fields: 'files(id, name, createdTime, size)',
    orderBy: 'createdTime desc',
    spaces: 'drive'
  }));
  return (res.data.files || []).map((f) => ({
    id: f.id,
    name: f.name,
    createdTime: f.createdTime,
    size: f.size ? Number(f.size) : null
  }));
}

export function buildBackupFileName(date = new Date()) {
  const stamp = date.toISOString().replace(/[:.]/g, '-');
  return `${BACKUP_FILE_PREFIX}${stamp}.zip`;
}

// Upload resumable (via stream, sem carregar o zip inteiro em memória) — a
// própria lib googleapis cuida da negociação resumable a partir de um stream
// de leitura do arquivo temporário local (ver backupService.js, fase
// "empacotar" grava em disco antes de chegar aqui).
export async function uploadZipFile(drive, folderId, name, filePath, onProgress) {
  const size = fs.statSync(filePath).size;
  const res = await callDrive(() => drive.files.create({
    requestBody: { name, parents: [folderId] },
    media: { mimeType: 'application/zip', body: fs.createReadStream(filePath) },
    fields: 'id, name, size'
  }, {
    onUploadProgress: onProgress ? (evt) => onProgress(evt.bytesRead, size) : undefined
  }));
  return { id: res.data.id, name: res.data.name, size: Number(res.data.size || size) };
}

export async function deleteFile(drive, fileId) {
  try {
    await callDrive(() => drive.files.delete({ fileId }));
  } catch {
    // Melhor esforço (ex.: limpar um upload parcial após falha) — nunca deve
    // mascarar o erro original que causou a limpeza.
  }
}

export async function downloadFileToPath(drive, fileId, destPath) {
  const res = await callDrive(() => drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  ));
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(destPath);
    res.data.on('error', reject);
    out.on('error', reject);
    out.on('finish', resolve);
    res.data.pipe(out);
  });
}
