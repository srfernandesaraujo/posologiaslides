// Orquestração do backup/restore: liga a leitura do Firestore/Storage
// (store.js/firebaseAdmin.js) com o formato puro do manifest
// (backupManifest.js) e o registro de downloads temporários
// (downloadRegistry.js). `bucket` é recebido como PARÂMETRO (não construído
// aqui dentro) de propósito — permite testar com um stub (ver
// backupService.test.js), sem depender de credenciais reais do Firebase.
//
// Sem API do Google Drive: "Fazer Backup" gera um .zip local (disco do
// servidor) que o usuário baixa pelo navegador e guarda onde quiser;
// "Restaurar" recebe de volta um .zip que o usuário escolheu do próprio
// computador (upload multipart, ver backupRoutes.js) — nenhuma conta externa
// nem OAuth envolvidos.
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { ZipArchive } from 'archiver';
import unzipper from 'unzipper';
import {
  buildManifest, isSupportedFormatVersion, rewriteSlidesMedia, computeRestoreObjectPath
} from './backupManifest.js';
import { registerDownload } from './downloadRegistry.js';
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

export class InvalidBackupFileError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidBackupFileError';
    this.code = 'invalid_backup_file';
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

function buildBackupFileName(date = new Date()) {
  const stamp = date.toISOString().replace(/[:.]/g, '-');
  return `posologia-backup-${stamp}.zip`;
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

// Gera o zip localmente e registra pra download (ver downloadRegistry.js) —
// não apaga o arquivo no final: a posse dele passa pro registro, que só o
// remove quando o cliente efetivamente baixar (ou depois de expirar, se
// nunca baixar). Em caso de erro ANTES de registrar, aí sim limpa.
//
// `destPath`: usado só pelo backup AGENDADO (ver scripts/scheduledBackup.js),
// que roda fora de uma requisição HTTP e não tem um cliente esperando pra
// baixar o arquivo — em vez de registrar pra download de uso único, move o
// zip pronto direto pro destino final em disco (pasta de backups com
// retenção, fora do tmpdir) e devolve o caminho.
export async function createBackup({ userId, user, bucket, onEvent = () => {}, store = defaultStore, destPath = null }) {
  const emit = (evt) => onEvent(evt);
  const zipPath = tmpZipPath('posologia-backup');

  try {
    emit({ type: 'progress', stage: 'reading_data' });
    const tree = await store.getFolderTree(userId);
    const folders = tree.map((f) => ({
      id: f.id,
      name: f.name,
      color: f.color,
      subfolders: f.subfolders.map((sub) => ({ id: sub.id, name: sub.name }))
    }));
    const presentationRefs = [];
    for (const folder of tree) {
      for (const sub of folder.subfolders) {
        for (const p of sub.presentations) {
          presentationRefs.push({ id: p.id, folderId: folder.id, subfolderId: sub.id });
        }
      }
    }
    const presentations = await mapWithConcurrency(presentationRefs, 10, async (ref) => {
      const full = await store.getPresentation(ref.id, userId);
      return full ? { ...full, folderId: ref.folderId, subfolderId: ref.subfolderId } : null;
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

    const fileName = buildBackupFileName();
    const size = fs.statSync(zipPath).size;

    if (destPath) {
      // copyFile+unlink em vez de rename: zipPath está em os.tmpdir(), que
      // pode ser um filesystem/partição diferente do destino — rename entre
      // dispositivos diferentes falha com EXDEV.
      await fs.promises.copyFile(zipPath, destPath);
      await fs.promises.unlink(zipPath).catch(() => {});
      emit({ type: 'done', success: true, filePath: destPath, fileName, size });
      return { filePath: destPath, fileName, size };
    }

    const downloadId = registerDownload({ filePath: zipPath, userId, fileName });

    emit({ type: 'done', success: true, downloadId, fileName, size });
    return { downloadId, fileName, size };
  } catch (err) {
    await fs.promises.unlink(zipPath).catch(() => {});
    throw err;
  }
}

// `zipFilePath` já existe em disco quando chega aqui — vem do upload
// multipart do usuário (multer, ver backupRoutes.js), não é baixado de
// nenhum lugar. Sempre limpo no final: é um upload temporário, não algo que
// precise sobreviver além desta chamada.
export async function restoreBackup({ userId, zipFilePath, bucket, onEvent = () => {}, store = defaultStore }) {
  const emit = (evt) => onEvent(evt);

  try {
    emit({ type: 'progress', stage: 'reading_manifest' });
    const zip = await unzipper.Open.file(zipFilePath);
    const manifestEntry = zip.files.find((f) => f.path === 'manifest.json');
    if (!manifestEntry) throw new InvalidBackupFileError('Arquivo de backup inválido: manifest.json não encontrado dentro do zip.');
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
    // folderIdMap: id de disciplina do manifest -> id da subpasta "Geral" da
    // disciplina recriada (fallback pra presentations de um manifest antigo,
    // sem subfolderId). subfolderIdMap: id de subpasta do manifest -> id da
    // subpasta recriada, cobrindo tanto a "Geral" quanto as demais.
    const folderIdMap = {};
    const subfolderIdMap = {};
    for (const folder of manifest.folders || []) {
      const created = await store.createFolder(userId, `[Restaurado ${stamp}] ${folder.name}`, folder.color);
      folderIdMap[folder.id] = created.subfolderId;

      const subfolders = folder.subfolders || [];
      // O primeiro item é a "Geral" original (getFolderTree/buildManifest já
      // ordenam por createdAt) — reaproveita a "Geral" que createFolder acabou
      // de criar em vez de fazer uma subpasta extra vazia.
      subfolders.forEach((sub, index) => {
        if (index === 0) {
          subfolderIdMap[sub.id] = created.subfolderId;
        }
      });
      for (let i = 1; i < subfolders.length; i++) {
        const createdSub = await store.createSubfolder(userId, created.id, subfolders[i].name);
        subfolderIdMap[subfolders[i].id] = createdSub.id;
      }
    }

    let presentationsCreated = 0;
    for (const p of manifest.presentations || []) {
      const subfolderId = subfolderIdMap[p.subfolderId] || folderIdMap[p.folderId];
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
    await fs.promises.unlink(zipFilePath).catch(() => {});
  }
}
