// Testes de integração LEVE: a única coisa "fake" é a fronteira HTTP real
// (o objeto `drive` do googleapis e o `bucket` do Storage) — o resto
// (googleDriveClient.js, backupManifest.js, o próprio backupService.js) roda
// código de verdade, incluindo escrita/leitura real de zip em os.tmpdir().
// `store` (Firestore) é stubado via o parâmetro de injeção de backupService.
// backupService.js importa store.js (default de injeção de dependência) que
// por sua vez importa firebaseAdmin.js — este SÓ instancia o Admin SDK no
// carregamento do módulo (nenhuma chamada de rede, ver getBucket() lazy em
// firebaseAdmin.js), mas precisa das credenciais em process.env pra isso não
// lançar. Mesmo bootstrap que server/index.js já faz como primeiro import.
import 'dotenv/config';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, PassThrough } from 'stream';
import { ZipArchive } from 'archiver';
import { createBackup, restoreBackup, UnsupportedBackupVersionError } from './backupService.js';
import { DriveTokenExpiredError } from './googleDriveClient.js';

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

async function drainBody(body) {
  if (!body) return;
  for await (const _chunk of body) { /* descarta */ }
}

describe('createBackup', () => {
  test('caminho feliz: monta o zip e sobe pro Drive (sem mídia)', async () => {
    const events = [];
    const driveClient = {
      files: {
        list: async () => ({ data: { files: [] } }), // pasta de backup não existe ainda
        create: async (req) => {
          if (req.requestBody?.mimeType === 'application/vnd.google-apps.folder') {
            return { data: { id: 'folder-123' } };
          }
          await drainBody(req.media?.body);
          return { data: { id: 'file-abc', name: req.requestBody.name, size: '42' } };
        }
      }
    };

    const result = await createBackup({
      userId: 'u1',
      user: { id: 'u1', email: 'a@b.com', name: 'Ana' },
      driveClient,
      bucket: fakeBucketNoMedia(),
      store: fakeStoreWithOnePresentation(),
      onEvent: (evt) => events.push(evt)
    });

    assert.equal(result.id, 'file-abc');
    const doneEvent = events.find((e) => e.type === 'done');
    assert.ok(doneEvent, 'deveria emitir um evento "done"');
    assert.equal(doneEvent.fileId, 'file-abc');
    assert.ok(events.some((e) => e.stage === 'reading_data'));
    assert.ok(events.some((e) => e.stage === 'uploading'));
  });

  test('propaga DriveTokenExpiredError quando a Drive API devolve 401', async () => {
    const driveClient = {
      files: {
        list: async () => { const err = new Error('unauthorized'); err.code = 401; throw err; },
        create: async () => { throw new Error('não deveria chegar aqui'); }
      }
    };

    await assert.rejects(
      () => createBackup({
        userId: 'u1',
        user: { id: 'u1' },
        driveClient,
        bucket: fakeBucketNoMedia(),
        store: fakeStoreWithOnePresentation(),
        onEvent: () => {}
      }),
      DriveTokenExpiredError
    );
  });
});

// Monta um zip de verdade em memória (mesma lib usada em produção,
// backupService.js) pra simular o download de um backup existente do Drive.
async function buildZipBuffer(entries) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const pass = new PassThrough();
    pass.on('data', (c) => chunks.push(c));
    pass.on('end', () => resolve(Buffer.concat(chunks)));
    pass.on('error', reject);

    const archive = new ZipArchive();
    archive.on('error', reject);
    archive.pipe(pass);
    for (const [name, content] of entries) archive.append(content, { name });
    archive.finalize();
  });
}

function fakeDownloadDriveClient(zipBuffer) {
  return {
    files: {
      get: async () => ({ data: Readable.from(zipBuffer) })
    }
  };
}

describe('restoreBackup', () => {
  test('formatVersion desconhecido: erro tipado, não tenta processar', async () => {
    const manifest = { formatVersion: 2, folders: [], presentations: [], media: [] };
    const zipBuffer = await buildZipBuffer([['manifest.json', JSON.stringify(manifest)]]);

    await assert.rejects(
      () => restoreBackup({
        userId: 'u2',
        fileId: 'file-abc',
        driveClient: fakeDownloadDriveClient(zipBuffer),
        bucket: fakeBucketNoMedia(),
        store: fakeStoreWithOnePresentation(),
        onEvent: () => {}
      }),
      UnsupportedBackupVersionError
    );
  });

  test('caminho feliz sem mídia: recria pasta e apresentação via store injetado', async () => {
    const manifest = {
      formatVersion: 1,
      folders: [{ id: 'f1', name: 'Farmaco', color: '#38bdf8' }],
      presentations: [{
        id: 'p1', folderId: 'f1', title: 'Aula 1', slides: [{ id: 's1', html: '<div>oi</div>' }],
        favorite: false, updatedAt: 1, lastOpenedAt: null
      }],
      media: []
    };
    const zipBuffer = await buildZipBuffer([['manifest.json', JSON.stringify(manifest)]]);

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
      fileId: 'file-abc',
      driveClient: fakeDownloadDriveClient(zipBuffer),
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
  });
});
