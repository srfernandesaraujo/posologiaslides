// Canvas nativo do palco de slide: todo slide é sempre desenhado internamente
// neste tamanho fixo (edição e apresentação usam a mesma matemática de
// layout), e só depois reduzido/ampliado via CSS transform:scale para caber
// na caixa real disponível — ver useCanvasFit.js. Isso garante que o mesmo
// slide fique visualmente idêntico nos dois modos, e que widgets com altura
// mínima (ex. gráficos Chart.js) nunca sejam espremidos por uma tela pequena.
export const SLIDE_NATIVE_WIDTH = 1280;
export const SLIDE_NATIVE_HEIGHT = 720;

// Faixa inferior (em px reais, não escalados) sempre reservada e nunca
// ocupada pelo conteúdo do slide, para a barra de ferramentas flutuante
// (PresentationControls) nunca ficar por baixo/atrás do conteúdo em telas
// pequenas (tablet/celular).
export const STAGE_BOTTOM_RESERVE = 76;

// Zoom manual (multiplicador aplicado em cima da escala automática de ajuste
// — ver useCanvasFit.js): faixas diferentes por modo, já que faz sentido
// reduzir abaixo de 100% só editando (pra ver o slide inteiro), e em
// apresentação o piso é sempre 100% (a plateia já vê o slide inteiro por
// padrão; só faz sentido ampliar, nunca reduzir além do ajuste automático).
export const ZOOM_EDIT_RANGE = [0.4, 1.5];
export const ZOOM_PRESENT_RANGE = [1, 3];
export const ZOOM_STEP = 0.1;
