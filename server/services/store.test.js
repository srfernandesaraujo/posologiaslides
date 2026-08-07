// store.js usa o Admin SDK direto (sem injeção de dependência como
// backupService.js), então estes testes rodam contra o Firestore de verdade
// (mesmas credenciais de server/.env — ver firebaseAdmin.js) sob um userId
// isolado e descartável, igual ao espírito real-I/O de backupService.test.js.
// Cobre a concorrência otimista de savePresentation (expectedUpdatedAt/force)
// — ver comentário em store.js#savePresentation pro porquê.
import 'dotenv/config';
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { db } from './firebaseAdmin.js';
import { savePresentation, findInvalidNestedArrayPath, findOversizedSlide } from './store.js';

const userId = `test-concurrency-${crypto.randomUUID()}`;
const createdIds = [];

async function cleanup() {
  await Promise.all(createdIds.map((id) => db.collection('users').doc(userId).collection('presentations').doc(id).delete()));
}
after(cleanup);

describe('savePresentation — concorrência otimista', () => {
  test('save normal (sem expectedUpdatedAt) sobrescreve como antes', async () => {
    const created = await savePresentation({ title: 'Aula X', slides: [{ id: 's1', html: '<div>a</div>' }] }, userId);
    createdIds.push(created.presentation.id);
    assert.equal(created.conflict, false);

    const updated = await savePresentation(
      { id: created.presentation.id, title: 'Aula X editada', slides: [{ id: 's1', html: '<div>b</div>' }] },
      userId
    );
    assert.equal(updated.conflict, false);
    assert.equal(updated.presentation.title, 'Aula X editada');
  });

  test('expectedUpdatedAt desatualizado + sessionId diferente devolve conflict:true e NÃO sobrescreve', async () => {
    const created = await savePresentation({ title: 'Aula Y', slides: [{ id: 's1', html: '<div>a</div>' }] }, userId);
    const id = created.presentation.id;
    createdIds.push(id);
    const staleUpdatedAt = created.presentation.updatedAt;

    // Simula outro dispositivo (sessionId diferente) salvando primeiro.
    const otherDevice = await savePresentation(
      { id, title: 'Aula Y (salva no iPad)', slides: [{ id: 's1', html: '<div>ipad</div>' }], expectedUpdatedAt: staleUpdatedAt, sessionId: 'sessao-ipad' },
      userId
    );
    assert.equal(otherDevice.conflict, false);

    // Este cliente (sessão diferente) ainda tem o updatedAt antigo — não devia sobrescrever o que o iPad acabou de salvar.
    const thisDevice = await savePresentation(
      { id, title: 'Aula Y (editada no PC)', slides: [{ id: 's1', html: '<div>pc</div>' }], expectedUpdatedAt: staleUpdatedAt, sessionId: 'sessao-pc' },
      userId
    );
    assert.equal(thisDevice.conflict, true);
    // O conflito devolve o estado ATUAL do servidor (o que o iPad salvou), não o que este cliente tentou mandar.
    assert.equal(thisDevice.presentation.title, 'Aula Y (salva no iPad)');
    assert.equal(thisDevice.presentation.slides[0].html, '<div>ipad</div>');
  });

  test('expectedUpdatedAt desatualizado mas MESMA sessionId não é conflito (aba cancelou a resposta anterior, não é outro dispositivo)', async () => {
    const created = await savePresentation({ title: 'Aula W', slides: [{ id: 's1', html: '<div>a</div>' }] }, userId);
    const id = created.presentation.id;
    createdIds.push(id);
    const staleUpdatedAt = created.presentation.updatedAt;

    // Mesma aba salva de novo (updatedAt já mudou no servidor por esse mesmo save,
    // mas o cliente nunca processou a resposta — abortou — então ainda manda o
    // expectedUpdatedAt antigo). sessionId igual ao gravador atual: não é conflito.
    const firstSave = await savePresentation(
      { id, title: 'Aula W (save 1, resposta abortada no cliente)', slides: [{ id: 's1', html: '<div>1</div>' }], expectedUpdatedAt: staleUpdatedAt, sessionId: 'sessao-unica' },
      userId
    );
    assert.equal(firstSave.conflict, false);

    const secondSave = await savePresentation(
      { id, title: 'Aula W (save 2, mesma aba)', slides: [{ id: 's1', html: '<div>2</div>' }], expectedUpdatedAt: staleUpdatedAt, sessionId: 'sessao-unica' },
      userId
    );
    assert.equal(secondSave.conflict, false);
    assert.equal(secondSave.presentation.title, 'Aula W (save 2, mesma aba)');
  });

  test('force:true ignora o conflito e sobrescreve mesmo assim', async () => {
    const created = await savePresentation({ title: 'Aula Z', slides: [{ id: 's1', html: '<div>a</div>' }] }, userId);
    const id = created.presentation.id;
    createdIds.push(id);
    const staleUpdatedAt = created.presentation.updatedAt;

    await savePresentation(
      { id, title: 'Aula Z (salva no iPad)', slides: [{ id: 's1', html: '<div>ipad</div>' }], expectedUpdatedAt: staleUpdatedAt },
      userId
    );

    const forced = await savePresentation(
      { id, title: 'Aula Z (forçado do PC)', slides: [{ id: 's1', html: '<div>pc</div>' }], expectedUpdatedAt: staleUpdatedAt, force: true },
      userId
    );
    assert.equal(forced.conflict, false);
    assert.equal(forced.presentation.title, 'Aula Z (forçado do PC)');
  });
});

describe('findInvalidNestedArrayPath — array-dentro-de-array (Firestore rejeita)', () => {
  test('slides sem nenhum array aninhado: null', () => {
    const slides = [{ id: 's1', title: 'A', html: '<div></div>', tags: ['x', 'y'] }];
    assert.equal(findInvalidNestedArrayPath(slides), null);
  });

  test('array direto dentro de array: acha o caminho', () => {
    const slides = [{ id: 's1', pontos: [[1, 2], [3, 4]] }];
    assert.equal(findInvalidNestedArrayPath(slides), 'slides[0].pontos[0]');
  });

  test('array aninhado fundo dentro de objetos: acha o caminho completo', () => {
    const slides = [
      { id: 's1', html: '<div></div>' },
      { id: 's2', elements: [{ id: 'e1', transform: { path: [[0, 0], [10, 10]] } }] }
    ];
    assert.equal(findInvalidNestedArrayPath(slides), 'slides[1].elements[0].transform.path[0]');
  });

  test('array DENTRO de objeto DENTRO de array é permitido (só array-em-array direto é proibido)', () => {
    const slides = [{ id: 's1', elements: [{ id: 'e1', tags: ['a', 'b'] }] }];
    assert.equal(findInvalidNestedArrayPath(slides), null);
  });
});

describe('findOversizedSlide — limite de 1 MiB por documento do Firestore', () => {
  test('apresentação pequena: null', () => {
    const slides = [{ id: 's1', title: 'A', html: '<div>oi</div>' }];
    assert.equal(findOversizedSlide(slides), null);
  });

  test('um slide gigante estoura o limite: aponta ele como culpado', () => {
    const slides = [
      { id: 's1', title: 'Normal', html: '<div>pequeno</div>' },
      { id: 's2', title: 'Gigante', html: '<div>' + 'x'.repeat(1_100_000) + '</div>' }
    ];
    const result = findOversizedSlide(slides);
    assert.ok(result, 'deveria detectar apresentação grande demais');
    assert.equal(result.biggest.index, 1);
    assert.equal(result.biggest.title, 'Gigante');
    assert.ok(result.biggest.bytes > 1_000_000);
  });
});
