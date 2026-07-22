// Catálogo de transições aplicadas na TROCA de um slide para o outro (distinto
// de client/src/lib/animationCatalog.js, que anima só um elemento DENTRO de um
// slide). Configurável por slide (ver slide.transition = { type, duration }),
// não uma configuração global da apresentação — cada slide pode ter sua própria
// entrada. "wipe" é o momento de assinatura visual (gradiente ciano/esmeralda
// já usado no resto do produto), os demais são discretos e utilitários.
export const TRANSITION_PRESETS = [
  { id: 'none', label: 'Nenhuma' },
  { id: 'fade', label: 'Fade' },
  { id: 'slide-right', label: 'Deslizar da Direita' },
  { id: 'slide-left', label: 'Deslizar da Esquerda' },
  { id: 'slide-up', label: 'Deslizar de Baixo' },
  { id: 'zoom-in', label: 'Ampliar' },
  { id: 'zoom-out', label: 'Reduzir' },
  { id: 'wipe', label: 'Cortina' }
];

export const TRANSITION_DEFAULTS = { type: 'fade', duration: 0.6 };
export const TRANSITION_DURATION_RANGE = { min: 0.2, max: 2, step: 0.1 };

export function resolveTransition(transition) {
  return {
    type: transition?.type || TRANSITION_DEFAULTS.type,
    duration: transition?.duration ?? TRANSITION_DEFAULTS.duration
  };
}
