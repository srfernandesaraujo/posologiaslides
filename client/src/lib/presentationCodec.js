// Ponte entre o formato de transporte/armazenamento (slides com marcadores +
// `sharedChunks`, ver sharedChunks.js) e o formato que o resto do app usa
// (HTML completo em cada slide). O editor, o visualizador, a exportação e a
// miniatura nunca veem marcador: tudo é expandido ao CARREGAR e compactado só
// na hora de MANDAR pro servidor.
import { inflateSlides, deflateLists, jsonBytes } from './sharedChunks';

// Apresentação vinda do servidor -> apresentação "normal" em memória.
export function expandPresentation(presentation) {
  if (!presentation) return presentation;
  const { sharedChunks, ...rest } = presentation;
  const chunks = sharedChunks || {};
  return {
    ...rest,
    slides: inflateSlides(presentation.slides, chunks),
    ...(Array.isArray(presentation.trashedSlides) ? { trashedSlides: inflateSlides(presentation.trashedSlides, chunks) } : {})
  };
}

// Apresentação em memória -> campos que vão no POST. `extraBytes` é o que
// mora no mesmo documento além de `slides` (lixeira + chunks), pra comparar
// com o limite de 1 MiB do Firestore.
export function compactForSave(presentation) {
  const { lists, chunks } = deflateLists([presentation.slides || [], presentation.trashedSlides || []], {});
  return {
    slides: lists[0],
    trashedSlides: lists[1],
    sharedChunks: chunks,
    extraBytes: jsonBytes(lists[1]) + jsonBytes(chunks)
  };
}
