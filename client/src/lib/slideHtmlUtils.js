// Gera um sufixo curto e único para escopar ids/classes de um bloco inserido
// dentro do HTML do slide — permite inserir o mesmo bloco mais de uma vez sem
// colisão de id. Compartilhado entre os catálogos que geram HTML com <script>
// próprio (widgets interativos, gráficos, diagramas Mermaid).
export function uniqueId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ==========================================================================
// Manipulação estrutural do HTML do slide — usada pela seleção de elementos
// no editor (alinhar, mover, agrupar, apagar, editar campos). Roda sempre no
// documento principal do app (nunca dentro do iframe sandboxed do slide) via
// <template>, que faz o parser tratar o HTML como um fragmento de <body> puro
// (sem as inferências de <head>/<body> do parser de documento completo) e não
// executa nenhum <script> contido nele.
// ==========================================================================

function parseFragment(html) {
  const template = document.createElement('template');
  template.innerHTML = html || '';
  return template;
}

function serializeFragment(template) {
  return template.innerHTML;
}

// Filhos diretos de ".slide-root" (contêiner que a IA usa pra montar o layout
// do slide) quando existir; senão, os filhos diretos do próprio fragmento —
// é essa lista que define os índices endereçáveis (0, 1, 2...) usados abaixo.
function getContainer(template) {
  return template.content.querySelector('.slide-root') || template.content;
}

export function getElementAt(html, index) {
  const template = parseFragment(html);
  const el = getContainer(template).children[index];
  return el ? el.outerHTML : null;
}

export function removeElementAt(html, index) {
  const template = parseFragment(html);
  const el = getContainer(template).children[index];
  if (!el) return html;
  el.remove();
  return serializeFragment(template);
}

// Substitui por completo o que ocupa a posição `index` (wrapper de
// alinhamento/agrupamento incluído, se houver) — usada pela edição via IA
// restrita a um elemento e pela edição manual de HTML bruto (ver
// `getElementAt`), onde a resposta/entrada já é o substituto completo daquele
// slot. Aceita fragmentos com mais de um nó de topo (ex.: um diagrama
// Mermaid/Chart.js é `<div>` + `<script>`) — um nó único vira o próprio
// elemento endereçável; mais de um é embrulhado num `<div>` pra continuar
// endereçável por esse mesmo índice.
export function replaceElementAt(html, index, newFragmentHtml) {
  const template = parseFragment(html);
  const el = getContainer(template).children[index];
  const newNodes = Array.from(parseFragment(newFragmentHtml).content.childNodes);
  if (!el || !newNodes.length) return html;

  let newEl;
  if (newNodes.length === 1 && newNodes[0].nodeType === Node.ELEMENT_NODE) {
    newEl = newNodes[0];
  } else {
    newEl = document.createElement('div');
    newEl.append(...newNodes);
  }

  el.replaceWith(newEl);
  return serializeFragment(template);
}

// Substitui só o CONTEÚDO da posição `index`, preservando um wrapper de
// alinhamento existente — usada por "Editar campos" (reabrir o formulário de
// configuração), onde queremos manter o alinhamento já aplicado ao elemento.
// `newInnerHtml` pode ter mais de um nó de topo (ex.: diagramas Mermaid e
// gráficos Chart.js retornam `<div>` + `<script>`) — por isso todos os nós
// são preservados dentro de um wrapper próprio, em vez de só o primeiro
// elemento. Atributos do elemento antigo (data-el-source, data-el-anim,
// estilo de animação) são copiados pro novo; `data-el-config` é atualizado
// com `newConfig` pra "Editar campos" continuar funcionando numa próxima vez.
export function replaceElementInnerAt(html, index, newInnerHtml, newConfig) {
  const template = parseFragment(html);
  const wrapperOrEl = getContainer(template).children[index];
  if (!wrapperOrEl) return html;

  const isAlignWrap = wrapperOrEl.getAttribute('data-align-wrap') === 'true';
  const target = isAlignWrap ? wrapperOrEl.firstElementChild : wrapperOrEl;
  const newNodes = Array.from(parseFragment(newInnerHtml).content.childNodes);
  if (!target || !newNodes.length) return html;

  const newEl = document.createElement('div');
  Array.from(target.attributes).forEach((attr) => newEl.setAttribute(attr.name, attr.value));
  if (newEl.hasAttribute('data-el-config')) {
    newEl.setAttribute('data-el-config', JSON.stringify(newConfig || {}));
  }
  newEl.append(...newNodes);

  target.replaceWith(newEl);
  return serializeFragment(template);
}

export function moveElementAt(html, index, direction) {
  const template = parseFragment(html);
  const container = getContainer(template);
  const children = Array.from(container.children);
  const el = children[index];
  const target = children[index + (direction === 'up' ? -1 : 1)];
  if (!el || !target) return html;

  if (direction === 'up') {
    container.insertBefore(el, target);
  } else {
    container.insertBefore(target, el);
  }
  return serializeFragment(template);
}

// Alinha o elemento na posição `index` envolvendo-o num flex container que
// posiciona o conteúdo à esquerda/centro/direita — funciona igual não importa
// se o elemento original é block, inline ou inline-flex (ícones, botões,
// tabelas, texto), sem precisar tratar cada tipo de forma diferente.
// "left" remove o wrapper (é o fluxo normal, sem alinhamento especial).
export function setAlignmentAt(html, index, align) {
  const template = parseFragment(html);
  const container = getContainer(template);
  const wrapperOrEl = container.children[index];
  if (!wrapperOrEl) return html;

  const isWrapped = wrapperOrEl.getAttribute('data-align-wrap') === 'true';
  const innerEl = isWrapped ? wrapperOrEl.firstElementChild : wrapperOrEl;
  if (!innerEl) return html;

  if (align === 'left') {
    if (isWrapped) wrapperOrEl.replaceWith(innerEl);
    return serializeFragment(template);
  }

  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-align-wrap', 'true');
  wrapper.style.cssText = `display:flex;justify-content:${align === 'center' ? 'center' : 'flex-end'};width:100%;`;
  wrapperOrEl.replaceWith(wrapper);
  wrapper.appendChild(innerEl);

  // Um elemento com max-width (tabelas, cards) preenche até esse limite em
  // fluxo normal de bloco — como item flex, width:auto encolhe pro tamanho do
  // conteúdo em vez disso. Fixar o flex-basis no próprio max-width mantém a
  // largura pretendida ao centralizar/alinhar à direita.
  if (innerEl.style.maxWidth) {
    innerEl.style.flex = `0 1 ${innerEl.style.maxWidth}`;
  }

  return serializeFragment(template);
}

// Agrupa o elemento em `index` com o vizinho anterior ("prev") ou seguinte
// ("next") num container flex lado a lado. `ungroupAt` desfaz.
export function groupWithNeighborAt(html, index, neighbor) {
  const template = parseFragment(html);
  const container = getContainer(template);
  const children = Array.from(container.children);
  const el = children[index];
  const other = children[index + (neighbor === 'prev' ? -1 : 1)];
  if (!el || !other) return html;

  const first = neighbor === 'prev' ? other : el;
  const second = neighbor === 'prev' ? el : other;

  const group = document.createElement('div');
  group.setAttribute('data-el-group', 'true');
  group.style.cssText = 'display:flex;gap:1.5rem;align-items:flex-start;width:100%;';
  first.replaceWith(group);
  [first, second].forEach((child) => {
    child.style.flex = '1';
    child.style.minWidth = '0';
    group.appendChild(child);
  });

  return serializeFragment(template);
}

export function isGroupedAt(html, index) {
  const template = parseFragment(html);
  const el = getContainer(template).children[index];
  return !!el && el.getAttribute('data-el-group') === 'true';
}

export function ungroupAt(html, index) {
  const template = parseFragment(html);
  const container = getContainer(template);
  const group = container.children[index];
  if (!group || group.getAttribute('data-el-group') !== 'true') return html;

  Array.from(group.children).forEach((child) => {
    child.style.flex = '';
    child.style.minWidth = '';
    group.before(child);
  });
  group.remove();
  return serializeFragment(template);
}

// Lê a origem/configuração de um elemento inserido pela biblioteca de blocos
// (ver `appendIntoRoot`) — usada pra saber se "Editar campos" deve aparecer,
// e com quais valores pré-preencher o formulário.
export function getElementMeta(html, index) {
  const template = parseFragment(html);
  const wrapperOrEl = getContainer(template).children[index];
  if (!wrapperOrEl) return null;

  const el = wrapperOrEl.getAttribute('data-align-wrap') === 'true' ? wrapperOrEl.firstElementChild : wrapperOrEl;
  if (!el || !el.hasAttribute('data-el-source')) return null;

  let config = {};
  try {
    config = JSON.parse(el.getAttribute('data-el-config') || '{}');
  } catch {
    // Config corrompida/antiga — segue com valores vazios em vez de quebrar a seleção
  }
  return { source: el.getAttribute('data-el-source'), config };
}

// Tira o elemento em `index` do fluxo normal e fixa uma posição livre em
// porcentagem do container (ver arrasto em PresentationViewer.jsx) — permite
// colocar o elemento em qualquer lugar do slide, inclusive espaços vazios que
// o fluxo/flex do slide-root não preenchia. Se o slot estiver embrulhado por
// alinhamento (`data-align-wrap`, ver `setAlignmentAt`), desembrulha primeiro:
// aquele wrapper é `width:100%`, que em position:absolute ocuparia o slide
// inteiro e anularia a posição livre.
export function setPositionAt(html, index, { leftPct, topPct, widthPct }) {
  const template = parseFragment(html);
  const container = getContainer(template);
  const wrapperOrEl = container.children[index];
  if (!wrapperOrEl) return html;

  const el = wrapperOrEl.getAttribute('data-align-wrap') === 'true' ? wrapperOrEl.firstElementChild : wrapperOrEl;
  if (!el) return html;
  if (el !== wrapperOrEl) wrapperOrEl.replaceWith(el);

  if (!container.style.position) container.style.position = 'relative';

  el.style.position = 'absolute';
  el.style.margin = '0';
  el.style.zIndex = '10';
  el.style.left = `${leftPct}%`;
  el.style.top = `${topPct}%`;
  if (widthPct != null) el.style.width = `${widthPct}%`;
  el.setAttribute('data-el-positioned', 'true');
  return serializeFragment(template);
}

// Devolve o elemento em `index` pro fluxo normal, desfazendo `setPositionAt`.
export function clearPositionAt(html, index) {
  const template = parseFragment(html);
  const el = getContainer(template).children[index];
  if (!el) return html;

  el.style.position = '';
  el.style.margin = '';
  el.style.zIndex = '';
  el.style.left = '';
  el.style.top = '';
  el.style.width = '';
  el.removeAttribute('data-el-positioned');
  return serializeFragment(template);
}

export function isPositionedAt(html, index) {
  const template = parseFragment(html);
  const el = getContainer(template).children[index];
  return !!el && el.getAttribute('data-el-positioned') === 'true';
}

// Aplica uma animação CSS (ver client/src/lib/animationCatalog.js) ao elemento
// de topo em `index` — anima o mesmo "slot" endereçável usado por todas as
// outras mutações (align/move/group/delete), sem tratamento especial se ele
// estiver dentro de um wrapper de alinhamento (efeito visual idêntico, já que
// o wrapper só tem esse filho). Grava `data-el-anim` pra permitir reabrir o
// painel já com o preset/duração/atraso atuais.
export function setAnimationAt(html, index, { presetId, keyframe, loop, duration, delay }) {
  const template = parseFragment(html);
  const el = getContainer(template).children[index];
  if (!el) return html;

  el.style.animation = `${keyframe} ${duration}s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s both ${loop ? 'infinite' : '1'}`;
  el.setAttribute('data-el-anim', JSON.stringify({ presetId, duration, delay }));
  return serializeFragment(template);
}

export function getAnimationAt(html, index) {
  const template = parseFragment(html);
  const el = getContainer(template).children[index];
  if (!el || !el.hasAttribute('data-el-anim')) return null;

  try {
    return JSON.parse(el.getAttribute('data-el-anim'));
  } catch {
    return null;
  }
}

export function clearAnimationAt(html, index) {
  const template = parseFragment(html);
  const el = getContainer(template).children[index];
  if (!el) return html;

  el.style.animation = '';
  el.removeAttribute('data-el-anim');
  return serializeFragment(template);
}

// Insere `fragment` como último filho de ".slide-root" (ou do próprio corpo
// do slide, se não houver ".slide-root") em vez de simplesmente concatenar a
// string no fim do HTML — isso mantém o elemento inserido DENTRO da caixa de
// layout que a IA usa pra montar o slide, em vez de ficar solto depois dela.
// Quando `meta` é passado ({ source, config }), envolve o fragmento num
// wrapper marcado com data-el-source/data-el-config, habilitando a edição
// posterior dos campos (ver `getElementMeta`); blocos sem formulário de
// configuração (mídia, infográfico gerado por IA) não passam `meta`.
export function appendIntoRoot(html, fragment, meta) {
  const template = parseFragment(html);
  const container = getContainer(template);
  const fragTemplate = parseFragment(fragment);

  let node;
  if (meta) {
    node = document.createElement('div');
    node.setAttribute('data-el-source', meta.source);
    node.setAttribute('data-el-config', JSON.stringify(meta.config || {}));
    node.append(...fragTemplate.content.childNodes);
  } else if (fragTemplate.content.childNodes.length === 1 && fragTemplate.content.firstElementChild) {
    node = fragTemplate.content.firstElementChild;
  } else {
    // Fragmento com múltiplos nós de topo (ex.: mídia + legenda de crédito)
    // precisa de um único wrapper pra virar um item endereçável por índice.
    node = document.createElement('div');
    node.append(...fragTemplate.content.childNodes);
  }

  container.appendChild(node);
  return serializeFragment(template);
}
