// Catálogo de transições aplicadas na TROCA de um slide para o outro (distinto
// de client/src/lib/animationCatalog.js, que anima só um elemento DENTRO de um
// slide). Pequeno e deliberado, no mesmo espírito do catálogo de animações —
// não um grid genérico de dezenas de efeitos.
export const TRANSITION_PRESETS = [
  { id: 'none', label: 'Nenhuma' },
  { id: 'fade', label: 'Fade' },
  { id: 'slide', label: 'Deslizar' },
  { id: 'zoom', label: 'Ampliar' }
];

export const DEFAULT_TRANSITION = 'fade';
