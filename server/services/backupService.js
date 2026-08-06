// Orquestração do backup/restore: liga a leitura do Firestore/Storage
// (store.js/firebaseAdmin.js) com o Drive (googleDriveClient.js) e o formato
// puro do manifest (backupManifest.js). driveClient/bucket são recebidos
// como PARÂMETROS (não construídos aqui dentro) de propósito — permite testar
// com stubs (ver backupService.test.js), sem depender de rede ou credenciais
// reais do Google/Firebase.
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { ZipArchive } from 'archiver';
import unzipper from 'unzipper';
import {
  buildManifest, isSupportedFormatVersion, rewriteSlidesMedia, computeRestoreObjectPath
} from './backupManifest.js';
import {
  findOrCreateBackupFolder, listBackups as listDriveBackups, buildBackupFileName,
  uploadZipFile, downloadFileToPath
} from './googleDriveClient.js';
import * as defaultStore from './store.js';

const MEDIA_PREFIX = (userId) => `media/${userId}/`;
const GENERATED_PREFIX = (userId) => `generated-images/${userId}/`;

export class UnsupportedBackupVersionError extends Error {
  constructor(version) {
    super(`Formato de backup não suportado (versão ${version}). Este backup foi gerado por uma versão mais nova do app.`);
    this.name = 'UnsupportedBackupVersionError';
    this.code = 'unsupported_backup_version';
  }
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function tmpZipPath(prefix) {
  return path.join(os.tmpdir(), `${prefix}-${crypto.randomUUID()}.zip`);
}

function formatRestoreStamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Todos os arquivos de mídia do usuário caem sob um dos dois prefixos fixos
// (ver materialsRoutes.js e aiService.js) — listar direto no bucket é mais
// confiável que extrair URLs do HTML dos slides (pega mídia "órfã" também,
// upada e depois removida de todo slide).
async function listUserMediaFiles(bucket, userId) {
  const [normalFiles] = await bucket.getFiles({ prefix: MEDIA_PREFIX(userId) });
  const [generatedFiles] = await bucket.getFiles({ prefix: GENERATED_PREFIX(userId) });

  const toEntry = (file, isGenerated) => {
    const baseName = file.name.split('/').pop();
    return {
      file,
      zipPath: isGenerated ? `media/generated/${baseName}` : `media/${baseName}`,
      originalUrl: `https://storage.googleapis.com/${bucket.name}/${file.name}`,
      contentType: file.metadata?.contentType || 'application/octet-stream'
    };
  };

  return [
    ...normalFiles.map((f) => toEntry(f, false)),
    ...generatedFiles.map((f) => toEntry(f, true))
  ];
}

export async function createBackup({ userId, user, driveClient, bucket, onEvent = () => {}, store = defaultStore }) {
  const emit = (evt) => onEvent(evt);
  const zipPath = tmpZipPath('posologia-backup');

  try {
    emit({ type: 'progress', stage: 'reading_data' });
    const tree = await store.getFolderTree(userId);
    const folders = tree.map((f) => ({ id: f.id, name: f.name, color: f.color }));
    const presentationRefs = [];
    for (const folder of tree) {
      for (const sub of folder.subfolders) {
        for (const p of sub.presentations) {
          presentationRefs.push({ id: p.id, folderId: folder.id });
        }
      }
    }
    const presentations = await mapWithConcurrency(presentationRefs, 10, async (ref) => {
      const full = await store.getPresentation(ref.id, userId);
      return full ? { ...full, folderId: ref.folderId } : null;
    });
    const validPresentations = presentations.filter(Boolean);

    emit({ type: 'progress', stage: 'listing_media' });
    const mediaEntries = await listUserMediaFiles(bucket, userId);
    emit({ type: 'progress', stage: 'listing_media', total: mediaEntries.length });

    const manifest = buildManifest({
      user,
      folders,
      presentations: validPresentations,
      mediaFiles: mediaEntries
    });

    emit({ type: 'progress', stage: 'packaging', done: 0, total: mediaEntries.length });
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = new ZipArchive({ zlib: { level: 6 } });
      let done = 0;

      output.on('close', resolve);
      archive.on('error', reject);
      output.on('error', reject);
      archive.on('entry', (entryData) => {
        if (entryData.name === 'manifest.json') return;
        done += 1;
        emit({ type: 'progress', stage: 'packaging', done, total: mediaEntries.length });
      });

      archive.pipe(output);
      archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
      for (const entry of mediaEntries) {
        archive.append(entry.file.createReadStream(), { name: entry.zipPath });
      }
      archive.finalize();
    });

    emit({ type: 'progress', stage: 'uploading', bytesUploaded: 0 });
    const folderId = await findOrCreateBackupFolder(driveClient);
    const fileName = buildBackupFileName();
    const uploaded = await uploadZipFile(driveClient, folderId, fileName, zipPath, (bytesUploaded, totalBytes) => {
      emit({ type: 'progress', stage: 'uploading', bytesUploaded, totalBytes });
    });

    emit({ type: 'done', success: true, fileId: uploaded.id, fileName: uploaded.name, size: uploaded.size });
    return uploaded;
  } finally {
    fs.promises.unlink(zipPath).catch(() => {});
  }
}

export async function listBackups({ driveClient }) {
  const folderId = await findOrCreateBackupFolder(driveClient);
  const backups = await listDriveBackups(driveClient, folderId);
  return { folderId, backups };
}

export async function restoreBackup({ userId, fileId, driveClient, bucket, onEvent = () => {}, store = defaultStore }) {
  const emit = (evt) => onEvent(evt);
  const zipPath = tmpZipPath('posologia-restore');

  try {
    emit({ type: 'progress', stage: 'downloading' });
    await downloadFileToPath(driveClient, fileId, zipPath);

    emit({ type: 'progress', stage: 'reading_manifest' });
    const zip = await unzipper.Open.file(zipPath);
    const manifestEntry = zip.files.find((f) => f.path === 'manifest.json');
    if (!manifestEntry) throw new Error('Arquivo de backup inválido: manifest.json não encontrado.');
    const manifest = JSON.parse((await manifestEntry.buffer()).toString('utf-8'));
    if (!isSupportedFormatVersion(manifest.formatVersion)) {
      throw new UnsupportedBackupVersionError(manifest.formatVersion);
    }

    const urlMap = {};
    const mediaList = manifest.media || [];
    emit({ type: 'progress', stage: 'restoring_media', done: 0, total: mediaList.length });
    let mediaRestored = 0;
    for (let i = 0; i < mediaList.length; i++) {
      const m = mediaList[i];
      const entry = zip.files.find((f) => f.path === m.zipPath);
      if (!entry) continue; // mídia listada no manifest mas ausente no zip (não deveria acontecer) — pula, não derruba o restore inteiro
      const newObjectPath = computeRestoreObjectPath(userId, m.zipPath, i);
      const destFile = bucket.file(newObjectPath);
      await new Promise((resolve, reject) => {
        entry.stream()
          .pipe(destFile.createWriteStream({ metadata: { contentType: m.contentType || undefined } }))
          .on('error', reject)
          .on('finish', resolve);
      });
      await destFile.makePublic();
      urlMap[m.originalUrl] = `https://storage.googleapis.com/${bucket.name}/${newObjectPath}`;
      mediaRestored += 1;
      emit({ type: 'progress', stage: 'restoring_media', done: mediaRestored, total: mediaList.length });
    }

    emit({ type: 'progress', stage: 'restoring_data' });
    const stamp = formatRestoreStamp(new Date());
    const folderIdMap = {};
    for (const folder of manifest.folders || []) {
      const created = await store.createFolder(userId, `[Restaurado ${stamp}] ${folder.name}`, folder.color);
      folderIdMap[folder.id] = created.subfolderId;
    }

    let presentationsCreated = 0;
    for (const p of manifest.presentations || []) {
      const subfolderId = folderIdMap[p.folderId];
      if (!subfolderId) continue; // apresentação referencia uma pasta que não veio no manifest (não deveria acontecer) — pula, não derruba o restore inteiro
      const rewrittenSlides = rewriteSlidesMedia(p.slides, urlMap);
      await store.createPresentationInSubfolder(userId, subfolderId, { ...p, slides: rewrittenSlides });
      presentationsCreated += 1;
    }

    const result = {
      foldersCreated: Object.keys(folderIdMap).length,
      presentationsCreated,
      mediaRestored
    };
    emit({ type: 'done', success: true, ...result });
    return result;
  } finally {
    fs.promises.unlink(zipPath).catch(() => {});
  }
}
