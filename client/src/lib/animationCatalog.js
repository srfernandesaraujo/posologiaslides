// Catálogo curado de animações aplicáveis a um elemento selecionado do slide
// (ver botão "Animar" na barra de ação flutuante em PresentationEditor). Um
// conjunto pequeno e deliberado — não um grid genérico estilo Animate.css com
// dezenas de efeitos (shake/rubberBand/jello) que destoariam do tom do produto.
// "fade-in-up" replica de propósito a animação de entrada que o próprio prompt
// de sistema da IA já pede pros slides gerados (server/services/aiService.js).
export const ANIMATION_PRESETS = [
  { id: 'fade-in', label: 'Fade', keyframe: 'pos-fade-in', loop: false },
  { id: 'fade-in-up', label: 'Fade + Subir', keyframe: 'pos-fade-in-up', loop: false },
  { id: 'fade-in-down', label: 'Fade + Descer', keyframe: 'pos-fade-in-down', loop: false },
  { id: 'slide-in-left', label: 'Deslizar da Esquerda', keyframe: 'pos-slide-in-left', loop: false },
  { id: 'slide-in-right', label: 'Deslizar da Direita', keyframe: 'pos-slide-in-right', loop: false },
  { id: 'scale-in', label: 'Ampliar', keyframe: 'pos-scale-in', loop: false },
  { id: 'pulse', label: 'Pulsar (contínuo)', keyframe: 'pos-pulse', loop: true }
];

export const ANIMATION_DEFAULTS = { duration: 0.6, delay: 0 };
