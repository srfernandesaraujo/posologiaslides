import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildManifest, isSupportedFormatVersion, rewriteSlidesMedia,
  computeRestoreObjectPath, extractMediaUrlsFromHtml
} from './backupManifest.js';

describe('buildManifest', () => {
  test('monta o formato esperado com os campos certos', () => {
    const manifest = buildManifest({
      user: { id: 'u1', email: 'a@b.com', name: 'Ana' },
      folders: [{ id: 'f1', name: 'Farmaco', color: '#38bdf8' }],
      presentations: [{
        id: 'p1', folderId: 'f1', title: 'Aula 1', description: 'desc',
        slides: [{ id: 's1', html: '<div>oi</div>' }], favorite: true,
        updatedAt: 123, lastOpenedAt: 456, relatedPresentationId: null, relatedPresentationTitle: null
      }],
      mediaFiles: [{ zipPath: 'media/1-foto.png', originalUrl: 'https://storage.googleapis.com/b/media/u1/1-foto.png', contentType: 'image/png' }]
    });

    assert.equal(manifest.formatVersion, 1);
    assert.equal(manifest.app, 'posologia-slides');
    assert.equal(manifest.user.id, 'u1');
    assert.equal(manifest.folders.length, 1);
    assert.equal(manifest.presentations[0].title, 'Aula 1');
    assert.equal(manifest.presentations[0].favorite, true);
    assert.equal(manifest.media[0].zipPath, 'media/1-foto.png');
    assert.match(manifest.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  });

  test('aplica defaults seguros pra campos opcionais ausentes', () => {
    const manifest = buildManifest({
      user: { id: 'u1' },
      folders: [],
      presentations: [{ id: 'p1', folderId: 'f1', title: 'T', slides: [] }],
      mediaFiles: []
    });
    assert.equal(manifest.presentations[0].description, null);
    assert.equal(manifest.presentations[0].favorite, false);
    assert.equal(manifest.presentations[0].lastOpenedAt, null);
  });
});

describe('isSupportedFormatVersion', () => {
  test('aceita só a versão 1', () => {
    assert.equal(isSupportedFormatVersion(1), true);
    assert.equal(isSupportedFormatVersion(2), false);
    assert.equal(isSupportedFormatVersion(undefined), false);
  });
});

describe('rewriteSlidesMedia', () => {
  const oldUrl = 'https://storage.googleapis.com/b/media/u1/1-foto.png';
  const newUrl = 'https://storage.googleapis.com/b/media/u2/9-foto.png';

  test('troca URL presente no mapa', () => {
    const slides = [{ id: 's1', html: `<img src="${oldUrl}" />` }];
    const result = rewriteSlidesMedia(slides, { [oldUrl]: newUrl });
    assert.equal(result[0].html, `<img src="${newUrl}" />`);
  });

  test('URL ausente do mapa não é tocada', () => {
    const untouchedUrl = 'https://storage.googleapis.com/b/media/u1/2-outra.png';
    const slides = [{ id: 's1', html: `<img src="${untouchedUrl}" />` }];
    const result = rewriteSlidesMedia(slides, { [oldUrl]: newUrl });
    assert.equal(result[0].html, slides[0].html);
    assert.equal(result[0], slides[0]); // mesma referência quando nada muda
  });

  test('troca todas as ocorrências da mesma URL no mesmo slide', () => {
    const slides = [{ id: 's1', html: `<img src="${oldUrl}" /><img src="${oldUrl}" />` }];
    const result = rewriteSlidesMedia(slides, { [oldUrl]: newUrl });
    assert.equal(result[0].html, `<img src="${newUrl}" /><img src="${newUrl}" />`);
  });

  test('slide sem nenhuma URL de mídia fica idêntico', () => {
    const slides = [{ id: 's1', html: '<div>texto puro</div>' }];
    const result = rewriteSlidesMedia(slides, { [oldUrl]: newUrl });
    assert.equal(result[0].html, slides[0].html);
  });

  test('mapa vazio devolve os slides como vieram', () => {
    const slides = [{ id: 's1', html: `<img src="${oldUrl}" />` }];
    const result = rewriteSlidesMedia(slides, {});
    assert.equal(result, slides);
  });

  test('slide sem html (ex.: tipo especial) não quebra', () => {
    const slides = [{ id: 's1', type: 'quiz' }];
    const result = rewriteSlidesMedia(slides, { [oldUrl]: newUrl });
    assert.equal(result[0], slides[0]);
  });
});

describe('computeRestoreObjectPath', () => {
  test('mídia normal usa o prefixo media/{userId}', () => {
    const path = computeRestoreObjectPath('u2', 'media/1-foto raro!.png', 0);
    assert.match(path, /^media\/u2\/\d+-0-1-foto_raro_\.png$/);
  });

  test('mídia gerada por IA usa o prefixo generated-images/{userId}', () => {
    const path = computeRestoreObjectPath('u2', 'media/generated/1-abc.png', 3);
    assert.match(path, /^generated-images\/u2\/\d+-3-1-abc\.png$/);
  });

  test('índices diferentes produzem paths diferentes pro mesmo nome', () => {
    const p0 = computeRestoreObjectPath('u2', 'media/1-foto.png', 0);
    const p1 = computeRestoreObjectPath('u2', 'media/1-foto.png', 1);
    assert.notEqual(p0, p1);
  });
});

describe('extractMediaUrlsFromHtml', () => {
  test('reconhece src="..." do bucket informado', () => {
    const html = '<img src="https://storage.googleapis.com/meu-bucket/media/u1/1-foto.png" />';
    const urls = extractMediaUrlsFromHtml(html, 'meu-bucket');
    assert.deepEqual(urls, ['https://storage.googleapis.com/meu-bucket/media/u1/1-foto.png']);
  });

  test('reconhece url(...) dentro de style', () => {
    const html = '<div style="background-image:url(https://storage.googleapis.com/meu-bucket/media/u1/2-bg.png)"></div>';
    const urls = extractMediaUrlsFromHtml(html, 'meu-bucket');
    assert.equal(urls.length, 1);
    assert.match(urls[0], /2-bg\.png$/);
  });

  test('ignora URLs de outro bucket/domínio', () => {
    const html = '<img src="https://storage.googleapis.com/outro-bucket/x.png" /><img src="https://exemplo.com/y.png" />';
    assert.deepEqual(extractMediaUrlsFromHtml(html, 'meu-bucket'), []);
  });

  test('html vazio ou sem bucketName devolve lista vazia', () => {
    assert.deepEqual(extractMediaUrlsFromHtml('', 'meu-bucket'), []);
    assert.deepEqual(extractMediaUrlsFromHtml('<img src="x">', ''), []);
  });
});
