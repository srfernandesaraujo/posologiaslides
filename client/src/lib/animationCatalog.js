// Catálogo curado de animações aplicáveis a um elemento selecionado do slide
// (ver painel "Animar" na barra de ação flutuante em PresentationEditor). Um
// conjunto pequeno e deliberado — não um grid genérico estilo Animate.css com
// dezenas de efeitos que destoariam do tom do produto.
// "fade-in-up" replica de propósito a animação de entrada que o próprio prompt
// de sistema da IA já pede pros slides gerados (server/services/aiService.js).
//
// Três categorias (mesma convenção do PowerPoint/Keynote). Um elemento agora
// pode ter UM efeito POR CATEGORIA ao mesmo tempo (ex.: entrada + saída) —
// `data-el-anim` guarda uma LISTA de até 3 entradas, uma por categoria (ver
// setAnimationEntryAt/getAnimationsAt em slideHtmlUtils.js), combinadas no mesmo
// elemento via `animation` CSS com vírgula (suporta múltiplos valores nativamente).
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

// Quando/como o efeito dispara (mesma convenção do PowerPoint) — ver
// buildAnimationTriggerScript em PresentationViewer.jsx, o script (só ativo
// na apresentação de verdade em tela cheia, ver isFullscreen em
// PresentationEditor) que de fato orquestra clique/sequência.
// - auto: toca sozinho ao carregar o slide, depois de `delay` segundos
//   (comportamento de sempre, todo efeito criado antes desta feature é 'auto').
// - click: só toca quando o apresentador clica no slide; cada clique consome
//   UM passo pendente (na ordem em que os elementos aparecem no slide).
// - with-previous: toca no mesmo instante do passo "ao clicar" mais recente
//   (ou ao carregar o slide, se vier antes de qualquer 'click' no slide).
// - after-previous: toca automaticamente assim que o efeito anterior DENTRO
//   DO MESMO PASSO termina (encadeado, sem precisar de outro clique).
export const ANIMATION_TRIGGERS = [
  { id: 'auto', label: 'Automático' },
  { id: 'click', label: 'Ao clicar' },
  { id: 'with-previous', label: 'Com o anterior' },
  { id: 'after-previous', label: 'Após o anterior' }
];

export const ANIMATION_PRESETS = [
  { id: 'fade-in', label: 'Fade', category: 'entrance', keyframe: 'pos-fade-in', loop: false, pendingStyle: 'opacity:0;' },
  { id: 'fade-in-up', label: 'Fade + Subir', category: 'entrance', keyframe: 'pos-fade-in-up', loop: false, pendingStyle: 'opacity:0;transform:translateY(16px);' },
  { id: 'fade-in-down', label: 'Fade + Descer', category: 'entrance', keyframe: 'pos-fade-in-down', loop: false, pendingStyle: 'opacity:0;transform:translateY(-16px);' },
  { id: 'slide-in-left', label: 'Deslizar da Esquerda', category: 'entrance', keyframe: 'pos-slide-in-left', loop: false, pendingStyle: 'opacity:0;transform:translateX(-40px);' },
  { id: 'slide-in-right', label: 'Deslizar da Direita', category: 'entrance', keyframe: 'pos-slide-in-right', loop: false, pendingStyle: 'opacity:0;transform:translateX(40px);' },
  { id: 'scale-in', label: 'Ampliar', category: 'entrance', keyframe: 'pos-scale-in', loop: false, pendingStyle: 'opacity:0;transform:scale(0.85);' },

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

export const ANIMATION_DEFAULTS = { duration: 0.6, delay: 0, trigger: 'auto' };
