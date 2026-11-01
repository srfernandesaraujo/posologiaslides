// Slides que "são donos das setas".
//
// Alguns slides (aulas interativas importadas) revelam elementos passo a passo
// quando o professor aperta a seta. Se o sistema TAMBÉM tratasse a seta, cada
// toque revelaria um elemento E trocaria de slide. Regra para esses slides:
// a seta (e Espaço/PageUp/PageDown) só mexe DENTRO do slide; para trocar de
// slide, usar os botões ‹ › da barra do sistema.
//
// Contrato: o slide declara isso definindo `window.__slideOwnsKeys = true` no
// próprio documento. Slides que não definem nada continuam com o comportamento
// de sempre (a seta troca de slide). Só funciona porque o iframe do slide é
// same-origin (sandbox com allow-same-origin).
//
// Há dois caminhos de tecla, e os dois precisam respeitar isto:
//  1. Foco DENTRO do iframe: o script de repasse (buildNavKeyRelayScript, em
//     PresentationViewer.jsx, e o equivalente em exportStandalone.js) deixa de
//     avisar o pai.
//  2. Foco FORA do iframe (ex.: depois de clicar num botão da barra): o
//     listener de teclado do pai (PresentationControls/PublicViewerControls)
//     entrega a tecla ao slide em vez de navegar — `forwardKeyToOwningSlide`.

const NAV_KEYS = new Set(['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'Space']);

export function isSlideNavKey(key) {
  return NAV_KEYS.has(key);
}

export function slideOwnsKeys(iframe) {
  try {
    return !!(iframe && iframe.contentWindow && iframe.contentWindow.__slideOwnsKeys);
  } catch {
    return false; // iframe de outra origem ou ainda sem documento
  }
}

// Devolve true se o slide é dono das teclas e recebeu esta; nesse caso quem
// chamou NÃO deve navegar.
export function forwardKeyToOwningSlide(iframe, e) {
  if (!isSlideNavKey(e.key) || !slideOwnsKeys(iframe)) return false;
  try {
    const win = iframe.contentWindow;
    const target = iframe.contentDocument.body || iframe.contentDocument.documentElement;
    // `key: ' '` é o valor real da barra de espaço (o 'Space' que os
    // controles do pai comparam não existe como e.key); normaliza.
    const key = e.key === 'Space' ? ' ' : e.key;
    target.dispatchEvent(new win.KeyboardEvent('keydown', { key, code: e.code, bubbles: true, cancelable: true }));
  } catch {
    return false;
  }
  return true;
}
