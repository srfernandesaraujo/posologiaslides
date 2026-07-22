import React, { useEffect, useRef } from 'react';

/**
 * PresentationViewer renderiza o slide HTML atual dentro de um <iframe sandbox="allow-scripts">.
 * O iframe tem origem opaca (sem allow-same-origin), então o script do slide NUNCA tem acesso
 * ao window/document reais da aplicação, a cookies, a localStorage ou às chaves de API do usuário.
 * Chart.js e Mermaid.js são servidos localmente (public/vendor) e injetados dentro do documento
 * isolado para que os slides continuem podendo desenhar gráficos e diagramas.
 *
 * Mídia embutida (imagens/vídeos/áudios locais) usa data: URIs em vez de blob: —
 * blob: é preso à origem que o criou e não atravessa essa fronteira de origem opaca.
 * allow-popups é intencionalmente adicionado (baixo risco: só permite que uma página
 * embutida via <iframe> no slide abra uma aba nova, ex. "assistir no YouTube") sem
 * reintroduzir allow-same-origin, que quebraria o isolamento acima.
 *
 * reloadKey: entrar/sair do modo tela cheia NÃO muda htmlContent (é o mesmo slide),
 * então o efeito abaixo não recarregava o iframe nessa transição — o Chart.js e
 * outros scripts sensíveis a tamanho do slide já tinham medido o container ANTES
 * do palco redimensionar para o novo tamanho da tela cheia, e não recalculavam
 * corretamente depois. Passar isFullscreen como reloadKey força um recarregamento
 * completo (documento novo) toda vez que essa transição acontece, para que o
 * script do slide meça o tamanho final já estabilizado.
 */
// Identificador usado nas mensagens postMessage entre o script de seleção
// injetado no iframe e o listener no app principal (ver PresentationEditor).
export const SLIDE_EDITOR_MESSAGE_SOURCE = 'posologia-slide-editor';

// Script injetado apenas quando `editable` é true: permite passar o mouse e
// clicar nos elementos de topo do slide (filhos diretos de ".slide-root", ou
// do <body> quando não há ".slide-root") pra selecioná-los no editor. Não
// chama preventDefault/stopPropagation — cliques em controles do próprio
// widget (slider, botão) continuam funcionando normalmente; selecionar é só
// um efeito colateral passivo do clique.
function buildEditorScript() {
  return `
<style>
  .__pos-hover { outline: 2px dashed rgba(34,211,238,0.7) !important; outline-offset: 2px; cursor: pointer; }
  .__pos-selected { outline: 2px solid #22d3ee !important; outline-offset: 2px; }
</style>
<script>
(function () {
  var container = document.querySelector('.slide-root') || document.body;
  var scope = container === document.body ? 'body' : 'root';
  var selector = scope === 'root' ? '.slide-root > *' : 'body > *';
  var hovered = null;
  var selected = null;

  function indexOf(el) {
    return Array.prototype.indexOf.call(container.children, el);
  }

  document.body.addEventListener('mouseover', function (e) {
    var match = e.target.closest(selector);
    if (match === hovered) return;
    if (hovered && hovered !== selected) hovered.classList.remove('__pos-hover');
    hovered = match;
    if (hovered && hovered !== selected) hovered.classList.add('__pos-hover');
  });

  document.body.addEventListener('mouseout', function () {
    if (hovered && hovered !== selected) hovered.classList.remove('__pos-hover');
    hovered = null;
  });

  document.body.addEventListener('click', function (e) {
    var match = e.target.closest(selector);
    if (selected) selected.classList.remove('__pos-selected');

    if (!match) {
      selected = null;
      window.parent.postMessage({ source: '${SLIDE_EDITOR_MESSAGE_SOURCE}', type: 'deselect' }, '*');
      return;
    }

    selected = match;
    selected.classList.remove('__pos-hover');
    selected.classList.add('__pos-selected');
    var rect = match.getBoundingClientRect();
    window.parent.postMessage({
      source: '${SLIDE_EDITOR_MESSAGE_SOURCE}',
      type: 'select',
      index: indexOf(match),
      scope: scope,
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
    }, '*');
  });
})();
</script>`;
}

export default function PresentationViewer({ htmlContent, reloadKey, editable = false }) {
  const iframeRef = useRef(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const content = htmlContent || '<div style="color:#9ca3af; padding:2rem;">Slide Vazio</div>';
    const needsMermaid = /mermaid/i.test(content);

    const doc = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; font-family: 'Plus Jakarta Sans', sans-serif; background: #090d16; }
  * { box-sizing: border-box; }

  /* Biblioteca de animações aplicáveis a um elemento via o painel "Animar" do
     editor (ver client/src/lib/animationCatalog.js) — sempre presente (não só
     em modo editável): a animação é conteúdo real do slide e precisa tocar
     durante a apresentação de verdade, não só na edição. */
  @keyframes pos-fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes pos-fade-in-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes pos-fade-in-down { from { opacity: 0; transform: translateY(-16px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes pos-slide-in-left { from { opacity: 0; transform: translateX(-40px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes pos-slide-in-right { from { opacity: 0; transform: translateX(40px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes pos-scale-in { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
  @keyframes pos-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
</style>
<script src="/vendor/chart.umd.min.js"></script>
${needsMermaid ? '<script src="/vendor/mermaid.min.js"></script>' : ''}
</head>
<body>
${content}
${editable ? buildEditorScript() : ''}
</body>
</html>`;

    // Espera o layout do palco (tamanho novo de tela cheia, se for o caso) se
    // assentar por um frame antes de carregar o documento, para o script do
    // slide medir o container já no tamanho final.
    let frame1, frame2;
    frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => {
        // srcdoc substitui todo o documento do iframe (novo contexto isolado a cada troca de slide)
        iframe.srcdoc = doc;
      });
    });

    return () => {
      cancelAnimationFrame(frame1);
      if (frame2) cancelAnimationFrame(frame2);
    };
  }, [htmlContent, reloadKey, editable]);

  return (
    <iframe
      ref={iframeRef}
      title="slide-content"
      sandbox="allow-scripts allow-forms allow-popups"
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        display: 'block',
        background: '#090d16'
      }}
    />
  );
}
