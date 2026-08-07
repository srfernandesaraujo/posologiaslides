// Mesma checagem de server/services/store.js#findInvalidNestedArrayPath,
// duplicada aqui pra rodar ANTES de sequer mandar o autosave pro servidor —
// falha rápido e mostra o campo exato na tela, em vez de esperar o Firestore
// recusar do outro lado (ver App.jsx, incidente 2026-08-07: um array dentro
// de array nos slides derrubava o save com um erro genérico do Firestore,
// sem indicar onde estava o problema).
export function findInvalidNestedArrayPath(value, path = 'slides') {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (Array.isArray(value[i])) return `${path}[${i}]`;
      const nested = findInvalidNestedArrayPath(value[i], `${path}[${i}]`);
      if (nested) return nested;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      const nested = findInvalidNestedArrayPath(value[key], `${path}.${key}`);
      if (nested) return nested;
    }
  }
  return null;
}

// Mesma checagem de server/services/store.js#findOversizedSlide — o
// Firestore recusa qualquer documento acima de 1 MiB, sem exceção. Achado
// numa Aula 08 real (2026-08-07): "Importar Pasta Inteira" gerou um slide de
// 4,5 MB (provavelmente uma imagem colada como base64 em vez de enviada como
// arquivo), e o erro do Firestore pra isso não menciona tamanho em lugar
// nenhum — ficou horas parecendo um bug de array aninhado antes de alguém
// pensar em medir o tamanho do documento.
const FIRESTORE_MAX_DOCUMENT_BYTES = 1048576;
const SIZE_WARNING_THRESHOLD_BYTES = FIRESTORE_MAX_DOCUMENT_BYTES * 0.9;

export function findOversizedSlide(slides) {
  const totalBytes = new Blob([JSON.stringify(slides)]).size;
  if (totalBytes < SIZE_WARNING_THRESHOLD_BYTES) return null;

  let biggest = null;
  slides.forEach((slide, index) => {
    const bytes = new Blob([JSON.stringify(slide)]).size;
    if (!biggest || bytes > biggest.bytes) biggest = { index, bytes, title: slide?.title || '(sem título)' };
  });
  return { totalBytes, biggest };
}
