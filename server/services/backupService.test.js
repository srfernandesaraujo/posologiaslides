// backupService.js importa store.js (default de injeção de dependência) que
// por sua vez importa firebaseAdmin.js — este SÓ instancia o Admin SDK no
// carregamento do módulo (nenhuma chamada de rede, ver getBucket() lazy em
// firebaseAdmin.js), mas precisa das credenciais em process.env pra isso não
// lançar. Mesmo bootstrap que server/index.js já faz como primeiro import.
import 'dotenv/config';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { ZipArchive } from 'archiver';
import { createBackup, restoreBackup, UnsupportedBackupVersionError, InvalidBackupFileError } from './backupService.js';
import { consumeDownload } from './downloadRegistry.js';

function fakeBucketNoMedia() {
  return {
    name: 'fake-bucket',
    getFiles: async () => [[]],
    file: () => { throw new Error('não deveria chamar bucket.file() sem mídia'); }
  };
}

function fakeStoreWithOnePresentation() {
  return {
    getFolderTree: async () => ([
      { id: 'f1', name: 'Farmaco', color: '#38bdf8', subfolders: [{ id: 'sf1', name: 'Geral', presentations: [{ id: 'p1' }] }] }
    ]),
    getPresentation: async (id) => ({
      id, title: 'Aula 1', description: null, slides: [{ id: 's1', html: '<div>oi</div>' }],
      favorite: false, updatedAt: 1, lastOpenedAt: null, relatedPresentationId: null, relatedPresentationTitle: null
    })
  };
}

describe('createBackup', () => {
  test('caminho feliz: monta o zip localmente e registra pra download (sem mídia)', async () => {
    const events = [];
    const result = await createBackup({
      userId: 'u1',
      user: { id: 'u1', email: 'a@b.com', name: 'Ana' },
      bucket: fakeBucketNoMedia(),
      store: fakeStoreWithOnePresentation(),
      onEvent: (evt) => events.push(evt)
    });

    assert.ok(result.downloadId);
    assert.match(result.fileName, /^posologia-backup-.*\.zip$/);
    assert.ok(result.size > 0);

    const doneEvent = events.find((e) => e.type === 'done');
    assert.ok(doneEvent, 'deveria emitir um evento "done"');
    assert.equal(doneEvent.downloadId, result.downloadId);
    assert.ok(events.some((e) => e.stage === 'reading_data'));
    assert.ok(events.some((e) => e.stage === 'packaging'));

    // O arquivo registrado precisa existir de fato em disco, pronto pra
    // GET /api/backup/download/:id servir (ver backupRoutes.js).
    const entry = consumeDownload(result.downloadId, 'u1');
    assert.ok(entry, 'downloadId deveria estar registrado');
    assert.ok(fs.existsSync(entry.filePath));
    await fs.promises.unlink(entry.filePath).catch(() => {});
  });

  test('downloadId só é resgatável pelo mesmo usuário que gerou o backup', async () => {
    const result = await createBackup({
      userId: 'u1',
      user: { id: 'u1' },
      bucket: fakeBucketNoMedia(),
      store: fakeStoreWithOnePresentation(),
      onEvent: () => {}
    });

    assert.equal(consumeDownload(result.downloadId, 'u2-outro-usuario'), null);
    // ainda resgatável pelo dono de verdade (a chamada acima não devia ter consumido)
    const entry = consumeDownload(result.downloadId, 'u1');
    assert.ok(entry);
    await fs.promises.unlink(entry.filePath).catch(() => {});
  });
});

// Monta um zip de verdade em memória (mesma lib usada em produção,
// backupService.js) e escreve num arquivo temporário — restoreBackup agora
// recebe sempre um caminho local (upload multipart do usuário, ver
// backupRoutes.js), não baixa de lugar nenhum.
async function writeZipFile(entries) {
  const filePath = path.join(os.tmpdir(), `test-restore-${crypto.randomUUID()}.zip`);
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(filePath);
    const archive = new ZipArchive();
    archive.on('error', reject);
    output.on('close', resolve);
    output.on('error', reject);
    archive.pipe(output);
    for (const [name, content] of entries) archive.append(content, { name });
    archive.finalize();
  });
  return filePath;
}

describe('restoreBackup', () => {
  test('manifest.json ausente no zip: erro tipado', async () => {
    const zipFilePath = await writeZipFile([['outra-coisa.txt', 'oi']]);
    await assert.rejects(
      () => restoreBackup({
        userId: 'u2', zipFilePath, bucket: fakeBucketNoMedia(), store: fakeStoreWithOnePresentation(), onEvent: () => {}
      }),
      InvalidBackupFileError
    );
    assert.equal(fs.existsSync(zipFilePath), false, 'o arquivo temporário deveria ter sido limpo mesmo com erro');
  });

  test('formatVersion desconhecido: erro tipado, não tenta processar', async () => {
    const manifest = { formatVersion: 2, folders: [], presentations: [], media: [] };
    const zipFilePath = await writeZipFile([['manifest.json', JSON.stringify(manifest)]]);

    await assert.rejects(
      () => restoreBackup({
        userId: 'u2', zipFilePath, bucket: fakeBucketNoMedia(), store: fakeStoreWithOnePresentation(), onEvent: () => {}
      }),
      UnsupportedBackupVersionError
    );
  });

  test('caminho feliz sem mídia: recria pasta e apresentação via store injetado, e limpa o zip temporário', async () => {
    const manifest = {
      formatVersion: 1,
      folders: [{ id: 'f1', name: 'Farmaco', color: '#38bdf8' }],
      presentations: [{
        id: 'p1', folderId: 'f1', title: 'Aula 1', slides: [{ id: 's1', html: '<div>oi</div>' }],
        favorite: false, updatedAt: 1, lastOpenedAt: null
      }],
      media: []
    };
    const zipFilePath = await writeZipFile([['manifest.json', JSON.stringify(manifest)]]);

    const createdFolders = [];
    const createdPresentations = [];
    const store = {
      createFolder: async (userId, name, color) => {
        createdFolders.push({ userId, name, color });
        return { id: 'new-f1', subfolderId: 'new-sf1' };
      },
      createPresentationInSubfolder: async (userId, subfolderId, data) => {
        createdPresentations.push({ userId, subfolderId, data });
        return { id: 'new-p1' };
      }
    };

    const events = [];
    const result = await restoreBackup({
      userId: 'u2',
      zipFilePath,
      bucket: fakeBucketNoMedia(),
      store,
      onEvent: (evt) => events.push(evt)
    });

    assert.equal(result.foldersCreated, 1);
    assert.equal(result.presentationsCreated, 1);
    assert.equal(result.mediaRestored, 0);
    assert.match(createdFolders[0].name, /^\[Restaurado \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\] Farmaco$/);
    assert.equal(createdPresentations[0].subfolderId, 'new-sf1');
    assert.equal(createdPresentations[0].data.title, 'Aula 1');
    assert.ok(events.some((e) => e.type === 'done'));
    assert.equal(fs.existsSync(zipFilePath), false, 'o zip temporário do upload deveria ter sido apagado após o restore');
  });
});
