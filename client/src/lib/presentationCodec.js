// Ponte entre o formato de transporte/armazenamento (slides com marcadores +
// `sharedChunks`, ver sharedChunks.js) e o formato que o resto do app usa
// (HTML completo em cada slide). O editor, o visualizador, a exportação e a
// miniatura nunca veem marcador: tudo é expandido ao CARREGAR e compactado só
// na hora de MANDAR pro servidor.
//
// Blocos grandes (imagens/fontes >= BLOB_MIN_CHARS) ficam em documentos
// próprios no servidor. O servidor diz quais já tem (`blobIds`, na resposta de
// leitura e de gravação) e o cliente não os reenvia a cada autosave.
import { inflateSlides, deflateLists, jsonBytes, marker, BLOB_MIN_CHARS } from './sharedChunks';

// Teto de sanidade de um bloco (imagens maiores que um documento são divididas em partes pelo servidor) —
// mesmo número de server/services/store.js (BLOB_MAX_BYTES).
const BLOB_MAX_BYTES = 8 * 1024 * 1024;

function utf8Bytes(text) {
  // Base64 é ASCII (1 byte por caractere); só mede de verdade quando está perto do teto.
  if (text.length < BLOB_MAX_BYTES / 3) return text.length;
  return new Blob([text]).size;
}

// Apresentação vinda do servidor -> apresentação "normal" em memória.
export function expandPresentation(presentation) {
  if (!presentation) return presentation;
  const { sharedChunks, blobIds, ...rest } = presentation;
  const chunks = sharedChunks || {};
  return {
    ...rest,
    slides: inflateSlides(presentation.slides, chunks),
    ...(Array.isArray(presentation.trashedSlides) ? { trashedSlides: inflateSlides(presentation.trashedSlides, chunks) } : {})
  };
}

// Apresentação em memória -> campos que vão no POST.
//  - `knownBlobIds`: blocos grandes que o servidor já tem; não vão no corpo.
//  - `extraBytes`: o que mora no DOCUMENTO além de `slides` (lixeira + chunks
//    pequenos), pra comparar com o limite de 1 MiB do Firestore. Os blocos
//    grandes não contam aqui: cada um tem o seu próprio documento.
//  - `oversizedBlob`: um bloco que sozinho passa do limite de um documento.
export function compactForSave(presentation, knownBlobIds = new Set()) {
  const { lists, chunks } = deflateLists([presentation.slides || [], presentation.trashedSlides || []], {});
  const inline = {};
  const toSend = {};
  let oversizedBlob = null;
  for (const [id, text] of Object.entries(chunks)) {
    if (text.length < BLOB_MIN_CHARS) { inline[id] = text; continue; }
    if (!knownBlobIds.has(id)) toSend[id] = text;
    const bytes = utf8Bytes(text);
    if (bytes > BLOB_MAX_BYTES && (!oversizedBlob || bytes > oversizedBlob.bytes)) {
      const m = marker(id);
      const index = lists[0].findIndex((s) => typeof s?.html === 'string' && s.html.includes(m));
      oversizedBlob = { id, bytes, index, title: index >= 0 ? (lists[0][index]?.title || '(sem título)') : '(lixeira de slides)' };
    }
  }
  return {
    slides: lists[0],
    trashedSlides: lists[1],
    sharedChunks: { ...inline, ...toSend },
    extraBytes: jsonBytes(lists[1]) + jsonBytes(inline),
    oversizedBlob
  };
}
