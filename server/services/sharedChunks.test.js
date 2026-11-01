// Puro (sem Firestore): roda com `node --test server/services/sharedChunks.test.js`.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  deflateLists, inflateSlides, inflateHtml, roundTripsExactly, chunkId, marker, MIN_CHUNK_CHARS, MARKER_PREFIX
} from './sharedChunks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BIG_CSS = `<style>${'.a{color:red}'.repeat(300)}</style>`;
const BIG_JS = `<script>${'var x=1;'.repeat(300)}</script>`;
const slide = (n, extra = '') => ({ id: `s${n}`, title: `Slide ${n}`, html: `${BIG_CSS}${BIG_JS}<div>conteúdo ${n}${extra}</div>` });

describe('sharedChunks — deflate/inflate', () => {
  test('bloco grande repetido em 2+ slides vira um chunk único e volta idêntico', () => {
    const slides = [slide(1), slide(2), slide(3)];
    const { lists, chunks } = deflateLists([slides]);
    assert.equal(Object.keys(chunks).length, 2);
    lists[0].forEach((s) => {
      assert.ok(s.html.includes(MARKER_PREFIX));
      assert.ok(!s.html.includes('color:red'));
      assert.ok(s.html.length < 300);
    });
    assert.deepEqual(inflateSlides(lists[0], chunks, true), slides);
    assert.ok(roundTripsExactly(slides, lists[0], chunks));
  });

  test('bloco que aparece em um slide só fica por extenso', () => {
    const { lists, chunks } = deflateLists([[slide(1), { id: 's2', html: '<div>outro</div>' }]]);
    assert.deepEqual(chunks, {});
    assert.ok(lists[0][0].html.includes('color:red'));
  });

  test('bloco pequeno repetido não vira chunk', () => {
    const small = '<style>.b{color:blue}</style>';
    assert.ok(small.length < MIN_CHUNK_CHARS);
    const { chunks } = deflateLists([[{ html: small + '1' }, { html: small + '2' }]]);
    assert.deepEqual(chunks, {});
  });

  test('idempotente: compactar o já compacto não muda nada', () => {
    const first = deflateLists([[slide(1), slide(2)]]);
    const second = deflateLists(first.lists, first.chunks);
    assert.deepEqual(second.lists, first.lists);
    assert.deepEqual(second.chunks, first.chunks);
  });

  test('um slide novo por extenso junto de slides já compactos reaproveita os mesmos chunks', () => {
    const first = deflateLists([[slide(1), slide(2)]]);
    const mixed = [...first.lists[0], slide(3)];
    const second = deflateLists([mixed], first.chunks);
    assert.deepEqual(second.chunks, first.chunks);
    assert.ok(second.lists[0][2].html.includes(MARKER_PREFIX));
  });

  test('chunks que deixam de ser usados somem (sem lixo acumulado)', () => {
    const first = deflateLists([[slide(1), slide(2)]]);
    const onlyOne = deflateLists([[first.lists[0][0]]], first.chunks);
    assert.deepEqual(onlyOne.chunks, {});
    assert.ok(onlyOne.lists[0][0].html.includes('color:red'));
  });

  test('lista extra (lixeira) conta para a repetição e também é compactada', () => {
    const { lists, chunks } = deflateLists([[slide(1)], [slide(2)]]);
    assert.equal(Object.keys(chunks).length, 2);
    assert.ok(lists[0][0].html.includes(MARKER_PREFIX) && lists[1][0].html.includes(MARKER_PREFIX));
  });

  test('marcador sem chunk correspondente é recusado na gravação (400), não perdido em silêncio', () => {
    assert.throws(
      () => deflateLists([[{ html: `<div>${marker('cdeadbeef-x')}</div>` }]], {}),
      (err) => err.status === 400
    );
  });

  test('na leitura (não estrito) marcador órfão é mantido como está', () => {
    const html = `<div>${marker('cdeadbeef-x')}</div>`;
    assert.equal(inflateHtml(html, {}), html);
  });

  test('preserva os demais campos do slide e slides sem html', () => {
    const s = { ...slide(1), transition: 'fade', notes: 'x' };
    const { lists } = deflateLists([[s, slide(2), { id: 'vazio' }, null]]);
    assert.equal(lists[0][0].transition, 'fade');
    assert.equal(lists[0][0].notes, 'x');
    assert.deepEqual(lists[0][2], { id: 'vazio' });
    assert.equal(lists[0][3], null);
  });

  test('chunkId é determinístico e depende do texto', () => {
    assert.equal(chunkId(BIG_CSS), chunkId(BIG_CSS));
    assert.notEqual(chunkId(BIG_CSS), chunkId(BIG_JS));
    assert.match(chunkId(BIG_CSS), /^c[0-9a-f]{16}-[0-9a-z]+$/);
  });

  test('o texto do script com `$&` ou `$1` não é interpretado como padrão de substituição', () => {
    const js = `<script>${'var a="$&$1$$";'.repeat(200)}</script>`;
    const slides = [{ html: js + '1' }, { html: js + '2' }];
    const { lists, chunks } = deflateLists([slides]);
    assert.deepEqual(inflateSlides(lists[0], chunks, true), slides);
  });
});

describe('sharedChunks — cópia do cliente', () => {
  test('client/src/lib/sharedChunks.js é idêntico a este módulo', () => {
    const server = fs.readFileSync(path.join(__dirname, 'sharedChunks.js'), 'utf8');
    const clientPath = path.join(__dirname, '..', '..', 'client', 'src', 'lib', 'sharedChunks.js');
    assert.equal(fs.readFileSync(clientPath, 'utf8'), server);
  });
});
