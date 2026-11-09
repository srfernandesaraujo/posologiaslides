// Testa o armazenamento de blocos grandes (subcoleção `chunks`) do store.js
// contra um Firestore FALSO em memória — não toca no banco real (diferente de
// store.test.js, que usa o Firestore de verdade).
//
// Rodar: node --experimental-test-module-mocks --test services/blobStorage.test.js
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { deflateLists, inflateSlides, marker, BLOB_MIN_CHARS } from './sharedChunks.js';

// ---- Firestore falso -------------------------------------------------------
const store = new Map(); // path -> data
let autoId = 0;

function snapOf(path, ref) {
  const data = store.get(path);
  return {
    id: path.split('/').pop(), exists: data !== undefined, ref,
    data: () => (data === undefined ? undefined : structuredClone(data)),
    get: (f) => (data === undefined ? undefined : data[f])
  };
}
function docRef(path) {
  const ref = {
    id: path.split('/').pop(), path,
    get: async () => snapOf(path, ref),
    set: async (d) => { store.set(path, structuredClone(d)); },
    update: async (d) => { if (!store.has(path)) throw new Error('NOT_FOUND ' + path); store.set(path, { ...store.get(path), ...structuredClone(d) }); },
    delete: async () => { store.delete(path); },
    collection: (name) => colRef(`${path}/${name}`)
  };
  return ref;
}
function colRef(path) {
  const depth = path.split('/').length + 1;
  const list = () => [...store.keys()].filter((k) => k.startsWith(path + '/') && k.split('/').length === depth).map((k) => snapOf(k, docRef(k)));
  const q = { get: async () => { const docs = list(); return { docs, size: docs.length, forEach: (f) => docs.forEach(f) }; } };
  q.select = () => q;
  return { doc: (id) => docRef(`${path}/${id || 'auto' + (++autoId)}`), select: () => q, get: q.get, where: () => q };
}
const fakeDb = {
  collection: (n) => colRef(n),
  getAll: async (...args) => {
    const refs = args.filter((a) => a && a.path);
    return refs.map((r) => snapOf(r.path, r));
  },
  runTransaction: async (fn) => fn({
    get: (r) => r.get(),
    update: (r, d) => { store.set(r.path, { ...store.get(r.path), ...structuredClone(d) }); }
  }),
  batch: () => {
    const ops = [];
    return { delete: (r) => ops.push(() => store.delete(r.path)), update: (r, d) => ops.push(() => store.set(r.path, { ...store.get(r.path), ...d })), commit: async () => ops.forEach((o) => o()) };
  }
};

mock.module('./firebaseAdmin.js', { namedExports: { db: fakeDb } });
const S = await import('./store.js');

// ---- Aula de teste: 3 slides com imagem grande + fonte repetida ------------
const bigImg = (seed) => 'data:image/jpeg;base64,' + (String.fromCharCode(65 + seed) + 'AbC0/+=').repeat(60000); // ~420 KB
const font = '<style>@font-face{src:url(data:font/woff2;base64,' + 'Zm9u'.repeat(20000) + ')}</style>';
const mk = (i, extra = '') => ({ id: 's' + i, title: 'Slide ' + i, html: `<div>${font}<p>texto ${i}</p>${extra}</div>` });
const fullSlides = () => [mk(1, `<img src="${bigImg(1)}">`), mk(2, `<img src="${bigImg(2)}"><img src="${bigImg(2)}">`), mk(3)];

const U = 'u1';
const mainPath = (id) => `users/${U}/presentations/${id}`;
const blobPaths = (id) => [...store.keys()].filter((k) => k.startsWith(mainPath(id) + '/chunks/'));
const docBytes = (id) => Buffer.byteLength(JSON.stringify(store.get(mainPath(id))), 'utf8');

test('salvar aula grande: documento principal fica pequeno, blocos vão pra subcoleção', async () => {
  const original = fullSlides();
  const totalFull = Buffer.byteLength(JSON.stringify(original));
  assert.ok(totalFull > 1048576, 'precondição: por extenso passa de 1 MiB');

  const prepared = await S.prepareForSave(U, null, original, [], {});
  assert.equal(S.findOversizedBlob(prepared), null);
  const res = await S.savePresentation({ title: 'Aula', prepared }, U);
  const id = res.presentation.id;

  assert.ok(docBytes(id) < 100000, 'documento principal pequeno: ' + docBytes(id));
  assert.equal(blobPaths(id).length, 3, '2 imagens + 1 fonte (a imagem repetida não duplica)');
  assert.equal(res.presentation.blobIds.length, 3);

  // Leitura compacta devolve tudo junto; expandir reproduz o original exato.
  const got = await S.getPresentation(id, U, { compact: true });
  assert.deepEqual(inflateSlides(got.slides, got.sharedChunks, true), original);
  // Leitura por extenso (backup, link antigo) idem.
  const full = await S.getPresentation(id, U);
  assert.deepEqual(full.slides, original);
});

test('save seguinte sem reenviar blocos já gravados funciona e não duplica', async () => {
  const original = fullSlides();
  const first = await S.savePresentation({ title: 'Aula', prepared: await S.prepareForSave(U, null, original, [], {}) }, U);
  const id = first.presentation.id;
  const got = await S.getPresentation(id, U, { compact: true });

  // O cliente edita o slide 3 e manda só o que o servidor não tem: nenhum bloco grande.
  const { lists, chunks } = deflateLists([inflateSlides(got.slides, got.sharedChunks), []]);
  lists[0][2] = { ...lists[0][2], html: lists[0][2].html.replace('texto 3', 'texto 3 editado') };
  const known = new Set(got.blobIds);
  const slim = Object.fromEntries(Object.entries(chunks).filter(([cid, t]) => !(t.length >= BLOB_MIN_CHARS && known.has(cid))));
  assert.equal(Object.keys(slim).length, 0);

  const second = await S.savePresentation({ id, title: 'Aula', expectedUpdatedAt: got.updatedAt, prepared: await S.prepareForSave(U, id, lists[0], [], slim) }, U);
  assert.equal(second.conflict, false);
  assert.equal(blobPaths(id).length, 3);
  const after = await S.getPresentation(id, U);
  assert.ok(after.slides[2].html.includes('texto 3 editado'));
  assert.equal(after.slides[0].html, original[0].html);
});

test('marcador de bloco que não existe no servidor => CHUNKS_MISSING (cliente reenvia tudo)', async () => {
  const id = (await S.savePresentation({ title: 'A', prepared: await S.prepareForSave(U, null, [mk(1)], [], {}) }, U)).presentation.id;
  await assert.rejects(
    () => S.prepareForSave(U, id, [{ id: 'x', html: '<p>' + marker('cdeadbeefdeadbeef-zz') + '</p>' }], [], {}),
    (e) => e.code === 'CHUNKS_MISSING' && e.status === 400 && e.missingChunkIds.length === 1
  );
});

test('conflito de edição devolve a versão do servidor já com os blocos', async () => {
  const id = (await S.savePresentation({ title: 'A', prepared: await S.prepareForSave(U, null, fullSlides(), [], {}) }, U)).presentation.id;
  const r = await S.savePresentation({ id, title: 'A', expectedUpdatedAt: 1, sessionId: 'outra', prepared: await S.prepareForSave(U, id, fullSlides(), [], {}) }, U);
  assert.equal(r.conflict, true);
  assert.deepEqual(inflateSlides(r.presentation.slides, r.presentation.sharedChunks, true), fullSlides());
});

test('excluir de vez apaga os blocos; limpeza só remove órfãos antigos', async () => {
  const id = (await S.savePresentation({ title: 'A', prepared: await S.prepareForSave(U, null, fullSlides(), [], {}) }, U)).presentation.id;
  // órfão recente (não pode ser apagado) e órfão antigo (pode)
  store.set(mainPath(id) + '/chunks/orfaoNovo', { text: 'x', createdAt: Date.now() });
  store.set(mainPath(id) + '/chunks/orfaoVelho', { text: 'x', createdAt: Date.now() - 48 * 3600 * 1000 });
  const got = await S.getPresentation(id, U, { compact: true });
  await S.savePresentation({ id, title: 'A', expectedUpdatedAt: got.updatedAt, prepared: await S.prepareForSave(U, id, fullSlides(), [], {}) }, U);
  await new Promise((r) => setTimeout(r, 20)); // limpeza roda em segundo plano
  assert.ok(store.has(mainPath(id) + '/chunks/orfaoNovo'));
  assert.ok(!store.has(mainPath(id) + '/chunks/orfaoVelho'));
  assert.equal(blobPaths(id).length, 4);

  assert.equal(await S.permanentlyDeletePresentation(id, U), true);
  assert.equal(blobPaths(id).length, 0);
  assert.ok(!store.has(mainPath(id)));
});

test('bloco único acima de 1 MiB é apontado, não explode no Firestore', async () => {
  const huge = { id: 'h', title: 'Enorme', html: '<img src="data:image/png;base64,' + 'A'.repeat(1100000) + '">' };
  const prepared = await S.prepareForSave(U, null, [mk(1), huge], [], {});
  const o = S.findOversizedBlob(prepared);
  assert.ok(o && o.index === 1 && o.title === 'Enorme');
});
