// Canvas nativo do palco de slide: todo slide é sempre desenhado internamente
// neste tamanho fixo (edição e apresentação usam a mesma matemática de
// layout), e só depois reduzido/ampliado via CSS transform:scale para caber
// na caixa real disponível — ver useCanvasFit.js. Isso garante que o mesmo
// slide fique visualmente idêntico nos dois modos, e que widgets com altura
// mínima (ex. gráficos Chart.js) nunca sejam espremidos por uma tela pequena.
export const SLIDE_NATIVE_WIDTH = 1920;
export const SLIDE_NATIVE_HEIGHT = 1080;

// Tamanho de canvas assumido por slide feito pra fora da caixa nativa acima:
// slides da biblioteca de antes da migração pra 1920x1080 (ver
// PresentationEditor.jsx, botão "Ajustar conteúdo"), e também o "tamanho de
// slide" mais comum que ferramentas externas (ChatGPT, Claude, Gemini,
// Antigravity) assumem por padrão ao gerar HTML de uma página/slide 16:9
// quando coladas ou importadas via CodeSlideModal — por isso também usado
// pra auto-escalar HTML colado/importado por código ou pasta.
export const LEGACY_SLIDE_WIDTH = 1280;
export const LEGACY_SLIDE_HEIGHT = 720;

// Faixa inferior (em px reais, não escalados) sempre reservada e nunca
// ocupada pelo conteúdo do slide, pra barra de ferramentas flutuante
// (.floating-toolbar) nunca cobrir conteúdo — inclusive em tela cheia
// (chegou a ser removida de lá, deixando a barra sobrepor o slide, mas
// slides densos/dashboards com conteúdo até a borda de baixo tinham a
// última linha coberta de forma incômoda; voltou a reservar sempre). A
// barra fica a bottom:24px da caixa do palco e sua própria altura (padding
// 0.6rem + ícones de 36px + borda) soma uns 57px — a borda de CIMA dela
// fica a uns 81px do fundo do palco, então 76px de reserva deixava margem
// insuficiente. 110px dá folga confortável. A faixa reservada em si usa a
// cor de fundo REAL do slide, medida ao vivo no DOM do iframe (ver
// measureIframeEdgeBackground em PresentationViewer.jsx, chamado via
// onReady em PresentationEditor.jsx/PublicPresentationView.jsx), não mais o
// preto fixo do CSS — funciona pra qualquer slide, inclusive os que
// definem a cor via CSS customizado embutido (não style inline de
// .slide-root, onde uma tentativa anterior de adivinhar a cor pelo HTML
// bruto falhava).
export const STAGE_BOTTOM_RESERVE = 110;

// Zoom manual (multiplicador aplicado em cima da escala automática de ajuste
// — ver useCanvasFit.js): faixas diferentes por modo, já que faz sentido
// reduzir abaixo de 100% só editando (pra ver o slide inteiro), e em
// apresentação o piso é sempre 100% (a plateia já vê o slide inteiro por
// padrão; só faz sentido ampliar, nunca reduzir além do ajuste automático).
export const ZOOM_EDIT_RANGE = [0.4, 1.5];
export const ZOOM_PRESENT_RANGE = [1, 3];
export const ZOOM_STEP = 0.1;
