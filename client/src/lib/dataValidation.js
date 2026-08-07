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
