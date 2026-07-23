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
 * reloadKey: o palco (edição e apresentação) renderiza o slide sempre no mesmo
 * canvas nativo fixo (1280x720, ver lib/canvasConstants.js + lib/useCanvasFit.js)
 * e só ajusta a escala visual via CSS transform — como transform numa ancestral
 * nunca muda o tamanho de layout resolvido de um iframe (só como ele é pintado),
 * o documento interno do iframe sempre mede o mesmo tamanho de container em
 * qualquer modo/escala, então Chart.js e outros scripts sensíveis a tamanho não
 * precisam de um recarregamento forçado ao entrar/sair da tela cheia.
 */
// Identificador usado nas mensagens postMessage entre o script de seleção
// injetado no iframe e o listener no app principal (ver PresentationEditor).
export const SLIDE_EDITOR_MESSAGE_SOURCE = 'posologia-slide-editor';

// Identificador do sentido OPOSTO (pai → iframe) — hoje só usado pra ligar/
// desligar o modo de recorte ao vivo (ver useEffect de cropMode abaixo e o
// listener 'set-crop-mode' dentro de buildEditorScript), sem precisar
// recarregar o iframe inteiro a cada toggle.
const PARENT_TO_SLIDE_MESSAGE_SOURCE = 'posologia-slide-editor-control';

// Script injetado apenas quando `editable` é true: permite passar o mouse,
// clicar nos elementos de topo do slide (filhos diretos de ".slide-root", ou
// do <body> quando não há ".slide-root") pra selecioná-los no editor, e
// ARRASTAR pra qualquer posição livre (pointerdown + mover além de um pequeno
// limiar vira drag; um toque/clique simples, sem mover, continua só
// selecionando/desselecionando como antes). Usa Pointer Events (não Mouse
// Events) em todo o arrasto/redimensionamento — mouse events nunca disparam a
// partir de toque/caneta em touchscreens (mesmo raciocínio do DrawingCanvas),
// então isso também funciona com dedo/Apple Pencil num iPad, não só com
// mouse. Cliques normais em controles do próprio widget (slider, botão)
// continuam funcionando sem interferência — só um clique que veio depois de
// um arrasto de verdade é bloqueado (na fase de captura, antes de chegar no
// controle interno), pra não disparar o onclick dele sem querer ao soltar.
// `initialSelected` (índice + escopo de quem estava selecionado antes deste
// carregamento, ou null) — soltar um arrasto/redimensionamento grava a nova
// posição no HTML do slide (ver handleMessage/reposition em
// PresentationEditor), o que troca `htmlContent` e recarrega o iframe do
// zero (novo srcdoc): sem isso, cada vez que o usuário SOLTA o mouse depois
// de mover/redimensionar algo, o documento inteiro é recriado, apagando a
// seleção e as alças — pareceria que resize "não funciona" (aparece durante
// o arrasto, some ao soltar), quando na verdade o elemento nunca deixou de
// estar selecionado do ponto de vista do app, só o DOM do iframe é que foi
// substituído. Reaplica a seleção assim que o script novo roda.
// `initialCropMode` — mesma lógica de `initialSelected`: o modo de recorte
// liga/desliga via postMessage ao vivo (ver PARENT_TO_SLIDE_MESSAGE_SOURCE
// abaixo, pra não precisar recarregar o iframe a cada toggle), mas soltar
// uma alça de recorte TAMBÉM dispara um reload (grava no HTML, igual
// reposition) — sem isto, o modo voltaria sempre pra "redimensionar" depois
// da primeira alça solta.
// ARMADILHA: tudo daqui até o fechamento da template string (</script> no
// fim da função) é TEXTO — vira o script que roda dentro do iframe, num
// escopo JS totalmente separado do resto deste arquivo. Uma variável local
// desta função (initialSelected, initialIndex...) só existe ali dentro se
// for explicitamente interpolada com dólar-chaves (ex.: JSON.stringify(initialIndex)
// entre dólar-chaves) — escrevê-la "solta" no meio do texto (ex.: "var x =
// initialCropMode;") compila sem erro nenhum (npm run build só valida a
// STRING, não o JS que ela contém) e só quebra em runtime, no console do
// navegador, como um ReferenceError logo no topo do IIFE — o suficiente pra
// travar TODOS os listeners abaixo dele, inclusive clique/seleção que nada
// tem a ver com o que causou o erro (foi exatamente assim que a seleção
// quebrou por inteiro depois da feature de recorte).
function buildEditorScript(initialSelected, initialCropMode) {
  var initialIndex = initialSelected ? initialSelected.index : null;
  var initialScope = initialSelected ? initialSelected.scope : null;
  return `
<style>
  .__pos-hover { outline: 2px dashed rgba(34,211,238,0.7) !important; outline-offset: 2px; cursor: pointer; }
  /* touch-action:none nos dois — sem isso, um arrasto por toque também rola/dá
     zoom no documento do iframe em vez de (ou além de) mover o elemento. */
  .__pos-selected { outline: 2px solid #22d3ee !important; outline-offset: 2px; cursor: grab; touch-action: none; }
  .__pos-dragging { cursor: grabbing !important; opacity: 0.85; }
  /* Área de toque (28px) bem maior que o quadradinho visual (11px, no
     ::after) — 11px é inatingível com o dedo num iPad; ver positionHandles()
     abaixo, que centraliza essa caixa de 28px no mesmo ponto onde o
     quadradinho ficava antes, então nada muda visualmente.
     TUDO em !important (ao contrário de .__pos-hover/.__pos-selected acima,
     que só protegem outline/cursor): o slide é HTML gerado por IA com CSS
     arbitrário, e uma regra ampla dele (ex. "div { position: relative }" ou
     "div { display: flex }", comuns em templates de layout) sobrescrevia
     position/display/z-index dessas alças sem !important — a alça existia no
     DOM mas nunca aparecia nem recebia toque, então só o arrasto (protegido
     por !important em .__pos-selected) parecia funcionar. left/top ficam DE
     FORA do !important de propósito — são definidos via JS inline em
     positionHandles() sem !important, e um !important aqui bateria a
     inline (prioridade de "important" sempre vence especificidade), travando
     as alças na posição inicial (0,0). */
  .__pos-handle { position: fixed !important; display: none !important; width: 28px !important; height: 28px !important; margin: 0 !important; padding: 0 !important; border: none !important; background: transparent !important; box-sizing: border-box !important; z-index: 2147483647 !important; touch-action: none !important; }
  .__pos-handle::after { content: '' !important; position: absolute !important; top: 50% !important; left: 50% !important; width: 11px !important; height: 11px !important; transform: translate(-50%, -50%) !important; background: #22d3ee !important; border: 1.5px solid #071019 !important; border-radius: 3px !important; box-sizing: border-box !important; }
  /* Alças de recorte (aparar bordas) — mesmo tratamento !important acima
     (mesma razão) e mesma caixa de toque, só num tom diferente (rosa) pra
     distinguir visualmente "modo recorte" de "modo redimensionar", já que
     nunca aparecem os dois ao mesmo tempo (ver positionHandles/
     positionCropHandles). */
  .__crop-handle { position: fixed !important; display: none !important; width: 28px !important; height: 28px !important; margin: 0 !important; padding: 0 !important; border: none !important; background: transparent !important; box-sizing: border-box !important; z-index: 2147483647 !important; touch-action: none !important; }
  .__crop-handle::after { content: '' !important; position: absolute !important; top: 50% !important; left: 50% !important; width: 11px !important; height: 11px !important; transform: translate(-50%, -50%) !important; background: #f472b6 !important; border: 1.5px solid #071019 !important; border-radius: 3px !important; box-sizing: border-box !important; }
</style>
<script>
(function () {
  var container = document.querySelector('.slide-root') || document.body;
  var scope = container === document.body ? 'body' : 'root';
  // :not(.__pos-handle):not(.__crop-handle) exclui as alças (ver abaixo) —
  // sem ".slide-root" (slide em branco), elas são anexadas direto no <body>,
  // logo entrariam no próprio "body > *" e seriam tratadas como conteúdo
  // selecionável do slide.
  var selector = (scope === 'root' ? '.slide-root > *' : 'body > *') + ':not(.__pos-handle):not(.__crop-handle)';
  var hovered = null;
  var selected = null;
  var dragState = null;
  var resizeState = null;
  var cropState = null;
  var cropMode = !!${JSON.stringify(!!initialCropMode)};
  var justDragged = false;
  var DRAG_THRESHOLD = 4;
  var MIN_SIZE_PX = 24;

  // Lê o recorte já aplicado ao elemento (ver setCropAt em slideHtmlUtils.js)
  // ou o padrão "sem recorte" — usada tanto pra desenhar as alças de recorte
  // em repouso quanto como ponto de partida ao começar a arrastar uma delas.
  function readCropInsets(el) {
    try {
      return JSON.parse(el.getAttribute('data-el-crop') || 'null') || { top: 0, right: 0, bottom: 0, left: 0 };
    } catch (err) {
      return { top: 0, right: 0, bottom: 0, left: 0 };
    }
  }

  if (getComputedStyle(container).position === 'static') {
    container.style.position = 'relative';
  }

  function indexOf(el) {
    return Array.prototype.indexOf.call(container.children, el);
  }

  // Controles nativos que dependem do próprio mousedown+arrastar pra
  // funcionar (slider de simulador, campo de texto, botão de aba/flashcard) —
  // iniciar o arrasto do elemento inteiro nesses casos sequestraria o gesto
  // e quebraria a interação própria do widget.
  function isInteractiveTarget(el) {
    return !!el.closest('input, textarea, select, button, a[href], [contenteditable="true"], label');
  }

  function sendSelect(el) {
    var rect = el.getBoundingClientRect();
    window.parent.postMessage({
      source: '${SLIDE_EDITOR_MESSAGE_SOURCE}',
      type: 'select',
      index: indexOf(el),
      scope: scope,
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
    }, '*');
  }

  function sendReposition(el, extra) {
    justDragged = true;
    var containerRect = container.getBoundingClientRect();
    var elRect = el.getBoundingClientRect();
    var payload = {
      source: '${SLIDE_EDITOR_MESSAGE_SOURCE}',
      type: 'reposition',
      index: indexOf(el),
      scope: scope,
      leftPct: (elRect.left - containerRect.left) / containerRect.width * 100,
      topPct: (elRect.top - containerRect.top) / containerRect.height * 100,
      widthPct: elRect.width / containerRect.width * 100,
      rect: { top: elRect.top, left: elRect.left, width: elRect.width, height: elRect.height }
    };
    if (extra) for (var k in extra) payload[k] = extra[k];
    window.parent.postMessage(payload, '*');
  }

  // clip-path não muda getBoundingClientRect() do elemento (só afeta
  // pintura/hit-test) — ao contrário de sendReposition, não precisa mandar
  // o retângulo de volta: a caixa do elemento não mudou, só o que é visível dela.
  function sendCrop(el, insets) {
    justDragged = true;
    window.parent.postMessage({
      source: '${SLIDE_EDITOR_MESSAGE_SOURCE}',
      type: 'crop',
      index: indexOf(el),
      scope: scope,
      topPct: insets.top,
      rightPct: insets.right,
      bottomPct: insets.bottom,
      leftPct: insets.left
    }, '*');
  }

  // Tira o elemento do fluxo e fixa a posição/largura atuais em % do
  // container (ver setPositionAt) — usado tanto ao começar a arrastar quanto
  // ao começar a redimensionar, sempre que o elemento ainda não é "livre".
  // Elemento centralizado/à direita (ver setAlignmentAt) é embrulhado num
  // <div style="display:flex;width:100%"> — em position:absolute esse
  // width:100% ocuparia o slide inteiro e anularia a posição livre, então
  // desembrulha primeiro.
  function detach(el) {
    if (el.getAttribute('data-align-wrap') === 'true') {
      var inner = el.firstElementChild;
      el.replaceWith(inner);
      el = inner;
    }
    if (el.getAttribute('data-el-positioned') !== 'true') {
      var containerRect = container.getBoundingClientRect();
      var elRect = el.getBoundingClientRect();
      el.style.position = 'absolute';
      el.style.margin = '0';
      el.style.zIndex = '10';
      el.style.left = ((elRect.left - containerRect.left) / containerRect.width * 100) + '%';
      el.style.top = ((elRect.top - containerRect.top) / containerRect.height * 100) + '%';
      el.style.width = (elRect.width / containerRect.width * 100) + '%';
      // Imagem/vídeo recém-inserido usa "height:auto" (ver PresentationEditor
      // handleInsertMedia) — sem fixar a altura aqui também, redimensionar só
      // pela alça de largura ('e') deixa a altura em auto, e o navegador
      // recalcula ela pela proporção intrínseca do arquivo, fazendo parecer
      // um redimensionamento uniforme mesmo a alça sendo só de largura.
      // Outros elementos (texto, widgets) não têm essa proporção intrínseca,
      // então não precisam da altura fixada aqui — continuam em "auto" até
      // que a alça de altura/quina seja usada de propósito.
      if (el.tagName === 'IMG' || el.tagName === 'VIDEO') {
        el.style.height = (elRect.height / containerRect.height * 100) + '%';
      }
      el.setAttribute('data-el-positioned', 'true');
    }
    return el;
  }

  // --- Alças de redimensionar: 3 quadradinhos (direita, baixo, quina) que
  // seguem o elemento selecionado e, arrastados, mudam largura/altura.
  var handles = {};
  ['e', 's', 'se'].forEach(function (pos) {
    var h = document.createElement('div');
    h.className = '__pos-handle';
    h.style.cursor = pos === 'e' ? 'ew-resize' : (pos === 's' ? 'ns-resize' : 'nwse-resize');
    document.body.appendChild(h);
    handles[pos] = h;
  });

  // --- Alças de recorte: 4 quadradinhos (cima/baixo/esquerda/direita), um
  // por borda — só aparecem em modo de recorte (ver cropMode), no lugar das
  // de redimensionar (nunca os dois conjuntos ao mesmo tempo).
  var cropHandles = {};
  ['n', 'e', 's', 'w'].forEach(function (edge) {
    var ch = document.createElement('div');
    ch.className = '__crop-handle';
    ch.style.cursor = (edge === 'n' || edge === 's') ? 'ns-resize' : 'ew-resize';
    document.body.appendChild(ch);
    cropHandles[edge] = ch;
  });

  // display via setProperty(..., 'important'): a regra base de .__pos-handle/
  // .__crop-handle é !important (ver <style> acima) pra sobreviver a CSS
  // arbitrário do slide — um style.display comum perderia pra ela (important
  // de stylesheet bate normal inline), então também precisa ser important
  // pra alternar mostrar/esconder de verdade.
  function setHandleDisplay(handle, value) {
    handle.style.setProperty('display', value, 'important');
  }

  function positionHandles() {
    if (!selected || cropMode) {
      for (var k in handles) setHandleDisplay(handles[k], 'none');
      return;
    }
    var r = selected.getBoundingClientRect();
    // Metade da caixa de TOQUE (28px, ver .__pos-handle), não do quadradinho
    // visual (11px, ::after) — centraliza a caixa maior no mesmo ponto onde o
    // quadradinho ficava antes, então o visual não muda, só a área tocável.
    var half = 14;
    handles.e.style.left = (r.right - half) + 'px';
    handles.e.style.top = (r.top + r.height / 2 - half) + 'px';
    handles.s.style.left = (r.left + r.width / 2 - half) + 'px';
    handles.s.style.top = (r.bottom - half) + 'px';
    handles.se.style.left = (r.right - half) + 'px';
    handles.se.style.top = (r.bottom - half) + 'px';
    for (var k2 in handles) setHandleDisplay(handles[k2], 'block');
  }

  // clip-path não muda getBoundingClientRect() (só afeta pintura/hit-test),
  // então a caixa CHEIA do elemento selecionado continua confiável aqui — os
  // insets (ver cropState/readCropInsets) é que dizem quanto dela está visível.
  function positionCropHandles() {
    if (!selected || !cropMode) {
      for (var k in cropHandles) setHandleDisplay(cropHandles[k], 'none');
      return;
    }
    var r = selected.getBoundingClientRect();
    var insets = cropState ? cropState.current : readCropInsets(selected);
    var half = 14;
    var vTop = r.top + r.height * insets.top / 100;
    var vBottom = r.bottom - r.height * insets.bottom / 100;
    var vLeft = r.left + r.width * insets.left / 100;
    var vRight = r.right - r.width * insets.right / 100;
    cropHandles.n.style.left = ((vLeft + vRight) / 2 - half) + 'px';
    cropHandles.n.style.top = (vTop - half) + 'px';
    cropHandles.s.style.left = ((vLeft + vRight) / 2 - half) + 'px';
    cropHandles.s.style.top = (vBottom - half) + 'px';
    cropHandles.w.style.left = (vLeft - half) + 'px';
    cropHandles.w.style.top = ((vTop + vBottom) / 2 - half) + 'px';
    cropHandles.e.style.left = (vRight - half) + 'px';
    cropHandles.e.style.top = ((vTop + vBottom) / 2 - half) + 'px';
    for (var k2 in cropHandles) setHandleDisplay(cropHandles[k2], 'block');
  }

  // Único ponto usado por seleção/arrasto pra atualizar as alças — decide
  // sozinha (via cropMode) qual dos dois conjuntos mostrar.
  function refreshHandles() {
    positionHandles();
    positionCropHandles();
  }

  Object.keys(handles).forEach(function (pos) {
    handles[pos].addEventListener('pointerdown', function (e) {
      if (!selected) return;
      e.preventDefault();
      e.stopPropagation();
      handles[pos].setPointerCapture(e.pointerId);
      var el = detach(selected);
      if (el !== selected) { selected = el; selected.classList.add('__pos-selected'); }
      var containerRect = container.getBoundingClientRect();
      var elRect = el.getBoundingClientRect();
      resizeState = {
        el: el,
        pos: pos,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startWidthPx: elRect.width,
        startHeightPx: elRect.height,
        containerWidth: containerRect.width,
        containerHeight: containerRect.height
      };
    });
  });

  Object.keys(cropHandles).forEach(function (edge) {
    cropHandles[edge].addEventListener('pointerdown', function (e) {
      if (!selected || !cropMode) return;
      e.preventDefault();
      e.stopPropagation();
      cropHandles[edge].setPointerCapture(e.pointerId);
      var el = detach(selected);
      if (el !== selected) { selected = el; selected.classList.add('__pos-selected'); }
      var r = el.getBoundingClientRect();
      var insets = readCropInsets(el);
      cropState = {
        el: el,
        edge: edge,
        startClientX: e.clientX,
        startClientY: e.clientY,
        fullWidth: r.width,
        fullHeight: r.height,
        // "start" fica fixo (referência dos outros 3 lados, que não mudam
        // nesta alça); "current" é o que muda a cada pointermove e o que
        // acaba sendo mandado pro pai ao soltar.
        start: insets,
        current: { top: insets.top, right: insets.right, bottom: insets.bottom, left: insets.left }
      };
    });
  });

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

  document.body.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    if (isInteractiveTarget(e.target)) return;
    var match = e.target.closest(selector);
    if (!match) return;
    // Sem isto, apertar/arrastar em cima de texto (título, parágrafo) inicia
    // a SELEÇÃO NATIVA de texto do navegador em paralelo ao nosso arrasto —
    // e depois de uma seleção de texto, o navegador costuma nem disparar o
    // 'click' no soltar, então o clique nunca chegava a selecionar o
    // elemento (nem editar campos/HTML), só destacava o texto em cinza.
    e.preventDefault();
    document.body.setPointerCapture(e.pointerId);
    var containerRect = container.getBoundingClientRect();
    dragState = {
      el: match,
      startClientX: e.clientX,
      startClientY: e.clientY,
      // startLeftPx/startTopPx são recalculados só quando o arrasto de fato
      // começa (ver abaixo) — não aqui, porque desembrulhar um elemento
      // alinhado (ver detach) troca qual elemento é rastreado, e medir agora
      // pegaria o retângulo do WRAPPER (embrulho de alinhamento), não do
      // conteúdo real.
      containerWidth: containerRect.width,
      containerHeight: containerRect.height,
      moved: false
    };
  });

  document.addEventListener('pointermove', function (e) {
    if (resizeState) {
      var rdx = e.clientX - resizeState.startClientX;
      var rdy = e.clientY - resizeState.startClientY;
      var el = resizeState.el;
      if (resizeState.pos === 'e' || resizeState.pos === 'se') {
        var newWidthPx = Math.max(MIN_SIZE_PX, resizeState.startWidthPx + rdx);
        el.style.width = (newWidthPx / resizeState.containerWidth * 100) + '%';
      }
      if (resizeState.pos === 's' || resizeState.pos === 'se') {
        var newHeightPx = Math.max(MIN_SIZE_PX, resizeState.startHeightPx + rdy);
        el.style.height = (newHeightPx / resizeState.containerHeight * 100) + '%';
      }
      positionHandles();
      return;
    }

    if (cropState) {
      var cdx = e.clientX - cropState.startClientX;
      var cdy = e.clientY - cropState.startClientY;
      var s = cropState.start;
      var c = cropState.current;
      var minPctW = MIN_SIZE_PX / cropState.fullWidth * 100;
      var minPctH = MIN_SIZE_PX / cropState.fullHeight * 100;
      if (cropState.edge === 'n') {
        c.top = Math.max(0, Math.min(100 - s.bottom - minPctH, s.top + cdy / cropState.fullHeight * 100));
      } else if (cropState.edge === 's') {
        c.bottom = Math.max(0, Math.min(100 - s.top - minPctH, s.bottom - cdy / cropState.fullHeight * 100));
      } else if (cropState.edge === 'w') {
        c.left = Math.max(0, Math.min(100 - s.right - minPctW, s.left + cdx / cropState.fullWidth * 100));
      } else if (cropState.edge === 'e') {
        c.right = Math.max(0, Math.min(100 - s.left - minPctW, s.right - cdx / cropState.fullWidth * 100));
      }
      cropState.el.style.clipPath = 'inset(' + c.top + '% ' + c.right + '% ' + c.bottom + '% ' + c.left + '%)';
      positionCropHandles();
      return;
    }

    if (!dragState) return;
    var dx = e.clientX - dragState.startClientX;
    var dy = e.clientY - dragState.startClientY;

    if (!dragState.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      dragState.moved = true;
      dragState.el = detach(dragState.el);

      // Base do arrasto medida AGORA, depois do detach — se ele desembrulhou
      // um elemento alinhado, dragState.el mudou pro elemento interno, cujo
      // retângulo é diferente do wrapper medido no pointerdown.
      var containerRect0 = container.getBoundingClientRect();
      var elRect0 = dragState.el.getBoundingClientRect();
      dragState.startLeftPx = elRect0.left - containerRect0.left;
      dragState.startTopPx = elRect0.top - containerRect0.top;

      if (selected && selected !== dragState.el) selected.classList.remove('__pos-selected');
      selected = dragState.el;
      selected.classList.remove('__pos-hover');
      selected.classList.add('__pos-selected', '__pos-dragging');
      sendSelect(selected);
    }

    var leftPx = dragState.startLeftPx + dx;
    var topPx = dragState.startTopPx + dy;
    dragState.el.style.left = (leftPx / dragState.containerWidth * 100) + '%';
    dragState.el.style.top = (topPx / dragState.containerHeight * 100) + '%';
    refreshHandles();
  });

  document.addEventListener('pointerup', function () {
    if (resizeState) {
      var el = resizeState.el;
      resizeState = null;
      justDragged = true;
      var elRect = el.getBoundingClientRect();
      var containerRect = container.getBoundingClientRect();
      sendReposition(el, { heightPct: elRect.height / containerRect.height * 100 });
      return;
    }

    if (cropState) {
      var elCrop = cropState.el;
      var finalInsets = cropState.current;
      cropState = null;
      sendCrop(elCrop, finalInsets);
      return;
    }

    if (!dragState) return;
    var moved = dragState.moved;
    var el2 = dragState.el;
    dragState = null;

    if (!moved) {
      // O pointerdown que iniciou este gesto chamou preventDefault() (ver
      // acima, pra travar a seleção nativa de texto) — e isso suprime o
      // 'click' de compatibilidade do navegador pro elemento inteiro, não só
      // quando havia texto. Sem um 'click' de verdade, o listener de 'click'
      // abaixo (que trata seleção) nunca dispararia pra este elemento, então
      // fazemos a seleção aqui mesmo. O listener de 'click' continua
      // necessário à parte pra: cliques em ÁREA VAZIA (fora de qualquer
      // elemento, que nunca passam pelo pointerdown acima) e cliques em
      // CONTROLES INTERNOS do próprio widget (isInteractiveTarget também os
      // pula no pointerdown, então o click nativo deles chega intacto).
      if (selected && selected !== el2) selected.classList.remove('__pos-selected');
      selected = el2;
      selected.classList.remove('__pos-hover');
      selected.classList.add('__pos-selected');
      refreshHandles();
      sendSelect(selected);
      return;
    }

    el2.classList.remove('__pos-dragging');
    sendReposition(el2);
  });

  // Fase de captura: intercepta o click nativo que o navegador dispara logo
  // depois do pointerup de um arrasto/redimensionamento de verdade, antes que
  // ele alcance (e dispare) o onclick de um controle interno do próprio widget.
  document.addEventListener('click', function (e) {
    if (!justDragged) return;
    justDragged = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  document.body.addEventListener('click', function (e) {
    var match = e.target.closest(selector);
    if (selected) selected.classList.remove('__pos-selected');

    if (!match) {
      selected = null;
      refreshHandles();
      window.parent.postMessage({ source: '${SLIDE_EDITOR_MESSAGE_SOURCE}', type: 'deselect' }, '*');
      return;
    }

    selected = match;
    selected.classList.remove('__pos-hover');
    selected.classList.add('__pos-selected');
    refreshHandles();
    sendSelect(match);
  });

  // Ver comentário de "initialCropMode" acima de buildEditorScript: liga/
  // desliga o modo de recorte ao vivo, sem recarregar o iframe (ver
  // PresentationViewer/useEffect que manda esta mensagem sempre que a prop
  // cropMode muda). Cancela qualquer arrasto em andamento pra não deixar
  // um handle "fantasma" de um modo que acabou de deixar de existir.
  window.addEventListener('message', function (e) {
    var data = e.data;
    if (!data || data.source !== '${PARENT_TO_SLIDE_MESSAGE_SOURCE}' || data.type !== 'set-crop-mode') return;
    cropMode = !!data.enabled;
    resizeState = null;
    cropState = null;
    refreshHandles();
  });

  // Ver comentário de "initialSelected" acima de buildEditorScript: restaura
  // a seleção que existia antes deste (re)carregamento, se o elemento ainda
  // existir no mesmo índice/escopo. Não reenvia 'select' pro pai — o rect
  // dele já foi atualizado pela própria mensagem 'reposition'/'crop' que
  // causou este reload (ver handleMessage em PresentationEditor).
  if (${JSON.stringify(initialScope)} === scope && ${JSON.stringify(initialIndex)} !== null) {
    var restored = container.children[${JSON.stringify(initialIndex)}];
    if (restored && !restored.classList.contains('__pos-handle') && !restored.classList.contains('__crop-handle')) {
      selected = restored;
      selected.classList.add('__pos-selected');
      refreshHandles();
    }
  }
})();
</script>`;
}

// Script injetado SEMPRE (editável ou não) — ao contrário de buildEditorScript,
// precisa funcionar durante a apresentação de verdade (tela cheia, editable
// false), não só editando. Ao tocar num elemento de topo do slide, escurece
// todos os irmãos (mesma convenção ".slide-root > *"/"body > *" já usada pra
// seleção), pra o apresentador focar a atenção da turma nele; tocar de novo
// no mesmo elemento remove o destaque. Não manda nada pro app pai — tudo
// local ao próprio documento do iframe. Recebe `spotlightEnabled` já
// resolvido pelo chamador (ver PresentationEditor: só true em apresentação
// de verdade, nunca ao mesmo tempo que o script de edição acima, senão os
// dois listeners de clique no body competiriam entre si).
function buildSpotlightScript(spotlightEnabled) {
  if (!spotlightEnabled) return '';
  return `
<style>
  .__spot-dim { opacity: 0.15; filter: grayscale(0.3); transition: opacity 0.25s ease, filter 0.25s ease; }
</style>
<script>
(function () {
  var container = document.querySelector('.slide-root') || document.body;
  var selector = (container === document.body ? 'body > *' : '.slide-root > *') + ':not(.__pos-handle)';
  var spotlighted = null;

  function clearDim() {
    Array.prototype.forEach.call(container.children, function (child) {
      child.classList.remove('__spot-dim');
    });
  }

  document.body.addEventListener('click', function (e) {
    var match = e.target.closest(selector);
    if (!match) return;

    if (spotlighted === match) {
      clearDim();
      spotlighted = null;
      return;
    }

    spotlighted = match;
    Array.prototype.forEach.call(container.children, function (child) {
      if (child === match) child.classList.remove('__spot-dim');
      else child.classList.add('__spot-dim');
    });
  });
})();
</script>`;
}

// Script injetado SEMPRE, mas só ativo (`zoomGestureEnabled`) durante a
// apresentação de verdade (isFullscreen) — nunca junto com buildEditorScript
// (editable), pra não competir com o rastreio de ponteiro único do
// arrasto/redimensionamento de elemento. Detecta pinça de dois dedos (toque)
// e Ctrl+roda do mouse (sinal padrão de pinça de trackpad), e só avisa o app
// pai o FATOR de variação — quem decide o zoom final e aplica o clamp é
// PresentationEditor.jsx (ver `zoom-gesture` no listener de mensagens). A
// NAVEGAÇÃO (arrastar a visão já com zoom) não passa por aqui — é rolagem
// nativa do navegador em cima de .zoom-scrollport, por isso roda "solta"
// (sem Ctrl) é deliberadamente ignorada aqui, pra não competir com ela.
function buildZoomGestureScript(zoomGestureEnabled) {
  if (!zoomGestureEnabled) return '';
  return `
<script>
(function () {
  var pointers = {};
  var pinchStartDist = null;

  function dist(p1, p2) {
    var dx = p1.x - p2.x, dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function sendZoom(factor) {
    window.parent.postMessage({ source: '${SLIDE_EDITOR_MESSAGE_SOURCE}', type: 'zoom-gesture', factor: factor }, '*');
  }

  document.addEventListener('pointerdown', function (e) {
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if (ids.length === 2) {
      pinchStartDist = dist(pointers[ids[0]], pointers[ids[1]]);
    }
  });

  document.addEventListener('pointermove', function (e) {
    if (!(e.pointerId in pointers)) return;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if (ids.length !== 2 || pinchStartDist === null || pinchStartDist === 0) return;
    e.preventDefault();
    var newDist = dist(pointers[ids[0]], pointers[ids[1]]);
    sendZoom(newDist / pinchStartDist);
    pinchStartDist = newDist;
  }, { passive: false });

  function clearPointer(e) {
    delete pointers[e.pointerId];
    pinchStartDist = null;
  }
  document.addEventListener('pointerup', clearPointer);
  document.addEventListener('pointercancel', clearPointer);

  document.addEventListener('wheel', function (e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    sendZoom(e.deltaY < 0 ? 1.08 : 0.93);
  }, { passive: false });
})();
</script>`;
}

export default function PresentationViewer({ htmlContent, editable = false, spotlightEnabled = false, zoomGestureEnabled = false, selectedElement = null, cropMode = false }) {
  const iframeRef = useRef(null);
  // Ref (não estado/dependência do efeito abaixo): só precisamos do valor mais
  // recente NO MOMENTO em que o iframe recarrega por outro motivo (ver
  // "initialSelected" em buildEditorScript) — se `selectedElement` entrasse
  // nas dependências do efeito, todo clique de seleção (que muda o índice
  // selecionado sem mudar `htmlContent`) recarregaria o iframe à toa, o
  // efeito colateral que este código inteiro existe pra evitar.
  const selectedElementRef = useRef(selectedElement);
  selectedElementRef.current = selectedElement;
  // Mesma lógica pro modo de recorte (ver "initialCropMode" em
  // buildEditorScript) — o VALOR INICIAL de cada carregamento do iframe vem
  // desta ref; TOGGLES ao vivo (iframe já carregado) vão pelo useEffect
  // separado logo abaixo, via postMessage, sem recarregar nada.
  const cropModeRef = useRef(cropMode);
  cropModeRef.current = cropMode;

  // Liga/desliga o modo de recorte no script já rodando dentro do iframe,
  // sem recriar o srcdoc — só precisamos de um reload completo quando o
  // CONTEÚDO muda (ver efeito principal abaixo); alternar o modo é só uma
  // troca de qual conjunto de alças aparece.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage(
      { source: PARENT_TO_SLIDE_MESSAGE_SOURCE, type: 'set-crop-mode', enabled: !!cropMode },
      '*'
    );
  }, [cropMode]);

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
${buildSpotlightScript(spotlightEnabled)}
${buildZoomGestureScript(zoomGestureEnabled)}
${editable ? buildEditorScript(selectedElementRef.current, cropModeRef.current) : ''}
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
  }, [htmlContent, editable, spotlightEnabled, zoomGestureEnabled]);

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
