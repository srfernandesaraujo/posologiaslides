// Blocos compartilhados entre os slides de uma mesma apresentação.
//
// Problema: o Firestore recusa documento acima de 1 MiB, e a apresentação
// inteira (todos os slides) é UM documento. Uma aula interativa importada
// slide a slide repete em CADA slide o mesmo CSS, as mesmas fontes embutidas
// (base64) e o mesmo motor JS — a Aula 08 tinha ~440 KB por slide, dos quais
// só ~7 KB eram conteúdo; 32 slides somavam ~14 MB.
//
// Solução: qualquer elemento <style>/<script> inline grande que se repita
// idêntico em 2+ slides vira o marcador `<!--@shared:ID-->` no slide, e o
// texto original é guardado UMA vez em `sharedChunks[ID]`. Nada disso é
// visível fora do armazenamento/transporte: ao abrir, `inflate*` devolve o HTML
// completo, idêntico ao original, e todos os componentes (editor, viewer,
// exportação, miniatura) continuam lidando com HTML normal.
//
// ESTE ARQUIVO É DUPLICADO em client/src/lib/sharedChunks.js (mesmo padrão de
// dataValidation.js) — mantenha os dois idênticos; sharedChunks.test.js
// confere isso.

export const MARKER_PREFIX = '<!--@shared:';
const MARKER_RE = /<!--@shared:([A-Za-z0-9-]+)-->/g;
// Dois tipos de bloco candidato, numa passada só (a alternativa 1 consome o
// <style>/<script> inteiro, então um data URI dentro dele nunca é achado à
// parte): o elemento <style>/<script> e um data URI base64 (imagem, fonte...)
// solto no HTML — a causa real de slides com 400 KB+ de JPEG embutido.
const BLOCK_RE = /<(style|script)\b[^>]*>[\s\S]*?<\/\1\s*>|data:(?:image|font|audio|video|application)\/[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi;

// Abaixo disto o marcador + a entrada em sharedChunks custam quase o mesmo
// que repetir o bloco, e blocos pequenos raramente se repetem de verdade.
export const MIN_CHUNK_CHARS = 1024;

// Blocos GRANDES viram chunk mesmo usados em um slide só: o que importa não é
// só repetição, é tirar o peso de dentro do slide. O servidor guarda chunks
// deste tamanho pra cima em documentos próprios (subcoleção chunks/), cada um
// com o seu próprio limite de 1 MiB, em vez de dentro do documento da
// apresentação. Cliente e servidor precisam concordar neste número: é ele que
// separa "mora no documento" de "mora na subcoleção".
export const BLOB_MIN_CHARS = 16384;

// Ids de todos os marcadores presentes num HTML.
export function markerIds(html) {
  const out = [];
  if (typeof html !== 'string' || !html.includes(MARKER_PREFIX)) return out;
  html.replace(MARKER_RE, (whole, id) => { out.push(id); return whole; });
  return out;
}

export function marker(id) {
  return `${MARKER_PREFIX}${id}-->`;
}

function fnv1a(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// Determinístico (mesmo texto => mesmo id, no cliente e no servidor): dois
// hashes de 32 bits com sementes diferentes + o comprimento.
export function chunkId(text) {
  return `c${fnv1a(text, 2166136261)}${fnv1a(text, 3266489917)}-${text.length.toString(36)}`;
}

function unknownMarkerError(id) {
  const err = new Error(`Bloco compartilhado "${id}" não existe em sharedChunks.`);
  err.status = 400;
  return err;
}

// Troca cada marcador pelo texto original. `strict` (gravação) rejeita um
// marcador sem entrada correspondente — gravar assim perderia o conteúdo pra
// sempre. Na leitura (`strict` false) deixa o marcador como está, pra um
// documento corrompido ainda abrir em vez de travar.
export function inflateHtml(html, chunks, strict = false) {
  if (typeof html !== 'string' || !html.includes(MARKER_PREFIX)) return html;
  const map = chunks || {};
  return html.replace(MARKER_RE, (whole, id) => {
    if (Object.prototype.hasOwnProperty.call(map, id)) return map[id];
    if (strict) throw unknownMarkerError(id);
    return whole;
  });
}

export function inflateSlides(slides, chunks, strict = false) {
  if (!Array.isArray(slides)) return slides;
  return slides.map((s) => (s && typeof s.html === 'string' && s.html.includes(MARKER_PREFIX)
    ? { ...s, html: inflateHtml(s.html, chunks, strict) }
    : s));
}

function findBlocks(html) {
  const out = [];
  BLOCK_RE.lastIndex = 0;
  let m;
  while ((m = BLOCK_RE.exec(html)) !== null) {
    if (m[0].length >= MIN_CHUNK_CHARS) out.push(m[0]);
  }
  return out;
}

// Recebe listas de slides (ex.: [slides, trashedSlides]) já com ou sem
// marcadores e devolve { lists, chunks }: as mesmas listas com os blocos
// repetidos trocados por marcador, e só os blocos realmente usados.
// Idempotente: aplicar de novo sobre o resultado não muda nada.
export function deflateLists(lists, existingChunks = {}) {
  // 1. Normaliza: tudo por extenso (aceita entrada já compacta, parcial ou
  //    mista; marcador desconhecido lança 400).
  const full = lists.map((list) => inflateSlides(list, existingChunks, true));

  // 2. Conta em quantos slides diferentes cada bloco grande aparece.
  const seenIn = new Map(); // texto -> Set de "lista:índice"
  full.forEach((list, li) => {
    if (!Array.isArray(list)) return;
    list.forEach((s, si) => {
      if (!s || typeof s.html !== 'string') return;
      for (const text of findBlocks(s.html)) {
        let set = seenIn.get(text);
        if (!set) { set = new Set(); seenIn.set(text, set); }
        set.add(`${li}:${si}`);
      }
    });
  });

  // 3. Repetidos (ou grandes, ver BLOB_MIN_CHARS) viram chunk. Colisão de id com texto diferente (não deve
  //    acontecer) deixa aquele bloco por extenso.
  const chunks = {};
  const idByText = new Map();
  for (const [text, where] of seenIn) {
    if (where.size < 2 && text.length < BLOB_MIN_CHARS) continue;
    const id = chunkId(text);
    if (chunks[id] !== undefined && chunks[id] !== text) continue;
    chunks[id] = text;
    idByText.set(text, id);
  }
  const texts = [...idByText.keys()].sort((a, b) => b.length - a.length);

  // 4. Substitui.
  const outLists = full.map((list) => {
    if (!Array.isArray(list)) return list;
    return list.map((s) => {
      if (!s || typeof s.html !== 'string') return s;
      let html = s.html;
      for (const text of texts) {
        if (html.includes(text)) html = html.split(text).join(marker(idByText.get(text)));
      }
      return html === s.html ? s : { ...s, html };
    });
  });

  return { lists: outLists, chunks };
}

// Rede de segurança de quem grava: confere que desfazer a compactação devolve
// exatamente o HTML de entrada. Se não bater, quem chama grava por extenso.
export function roundTripsExactly(original, deflated, chunks) {
  const back = inflateSlides(deflated, chunks, true);
  if (!Array.isArray(original) || !Array.isArray(back) || original.length !== back.length) return false;
  return original.every((s, i) => (s && s.html) === (back[i] && back[i].html));
}

// Tamanho em bytes UTF-8 de qualquer valor serializável (no Node e no
// navegador) — usado pra somar chunks + lixeira ao total contra o limite.
export function jsonBytes(value) {
  const json = JSON.stringify(value);
  if (typeof Buffer !== 'undefined') return Buffer.byteLength(json, 'utf8');
  return new Blob([json]).size;
}
