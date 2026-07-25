// Catálogo curado de animações aplicáveis a um elemento selecionado do slide
// (ver painel "Animar" na barra de ação flutuante em PresentationEditor). Um
// conjunto pequeno e deliberado — não um grid genérico estilo Animate.css com
// dezenas de efeitos que destoariam do tom do produto.
// "fade-in-up" replica de propósito a animação de entrada que o próprio prompt
// de sistema da IA já pede pros slides gerados (server/services/aiService.js).
//
// Três categorias (mesma convenção do PowerPoint/Keynote), cada elemento só
// carrega UM preset por vez (`el.style.animation` é sobrescrito por inteiro em
// `setAnimationAt`, ver slideHtmlUtils.js — não há timeline nem múltiplos
// efeitos encadeados):
// - entrance: começa invisível/deslocado, termina no estado normal.
// - emphasis: já está visível, chama atenção sem sair do lugar (a "duração"
//   controla quanto tempo o efeito dura; ao fim volta ao estado normal).
// - exit: começa visível, termina invisível/deslocado — `delay` funciona como
//   "por quanto tempo fica visível antes de sumir" (ver rótulo dinâmico do
//   painel em PresentationEditor.jsx).
export const ANIMATION_CATEGORIES = [
  { id: 'entrance', label: 'Entrada' },
  { id: 'emphasis', label: 'Ênfase' },
  { id: 'exit', label: 'Saída' }
];

export const ANIMATION_PRESETS = [
  { id: 'fade-in', label: 'Fade', category: 'entrance', keyframe: 'pos-fade-in', loop: false },
  { id: 'fade-in-up', label: 'Fade + Subir', category: 'entrance', keyframe: 'pos-fade-in-up', loop: false },
  { id: 'fade-in-down', label: 'Fade + Descer', category: 'entrance', keyframe: 'pos-fade-in-down', loop: false },
  { id: 'slide-in-left', label: 'Deslizar da Esquerda', category: 'entrance', keyframe: 'pos-slide-in-left', loop: false },
  { id: 'slide-in-right', label: 'Deslizar da Direita', category: 'entrance', keyframe: 'pos-slide-in-right', loop: false },
  { id: 'scale-in', label: 'Ampliar', category: 'entrance', keyframe: 'pos-scale-in', loop: false },

  { id: 'pulse', label: 'Pulsar (contínuo)', category: 'emphasis', keyframe: 'pos-pulse', loop: true },
  { id: 'shake', label: 'Sacudir', category: 'emphasis', keyframe: 'pos-shake', loop: false },
  { id: 'flash', label: 'Piscar', category: 'emphasis', keyframe: 'pos-flash', loop: false },
  { id: 'bounce', label: 'Saltar', category: 'emphasis', keyframe: 'pos-bounce', loop: false },

  { id: 'fade-out', label: 'Fade', category: 'exit', keyframe: 'pos-fade-out', loop: false },
  { id: 'fade-out-up', label: 'Fade + Subir', category: 'exit', keyframe: 'pos-fade-out-up', loop: false },
  { id: 'fade-out-down', label: 'Fade + Descer', category: 'exit', keyframe: 'pos-fade-out-down', loop: false },
  { id: 'slide-out-left', label: 'Deslizar p/ Esquerda', category: 'exit', keyframe: 'pos-slide-out-left', loop: false },
  { id: 'slide-out-right', label: 'Deslizar p/ Direita', category: 'exit', keyframe: 'pos-slide-out-right', loop: false },
  { id: 'scale-out', label: 'Reduzir', category: 'exit', keyframe: 'pos-scale-out', loop: false }
];

export const ANIMATION_DEFAULTS = { duration: 0.6, delay: 0 };
