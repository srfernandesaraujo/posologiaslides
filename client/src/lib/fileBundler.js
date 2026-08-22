// Junta um HTML exportado de outra ferramenta (ex.: Antigravity) que referencia
// CSS/JS/imagens como arquivos SEPARADOS num único fragmento autocontido —
// troca <link rel="stylesheet" href="X"> por <style>, <script src="Y"> por
// <script> inline, e src/href de imagem pela URL de um upload real (ver
// uploadImageFile abaixo) — pra caber no que "Criar Slide por Código" (ver
// CodeSlideModal.jsx) aceita: um bloco só, sem nenhum arquivo de fora além de
// CDN (esses continuam externos de propósito, ver isExternalUrl). Usado por
// handleBundleFilesSelected em CodeSlideModal.jsx.
import { apiFetch } from './api';

const TEXT_EXTENSIONS = new Set(['css', 'js', 'mjs']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif']);
const HTML_EXTENSIONS = new Set(['html', 'htm']);

// .css/.js legítimo raramente passa disso — CSS/JS de verdade escrito à mão
// fica na casa das dezenas de KB. Um .js/.css muito maior que isso quase
// sempre é um arquivo de dados embutido em base64 (ex.: ferramentas de IA
// que geram um "banco de imagens offline" tipo `const IMAGENS = {
// foo: 'data:image/jpeg;base64,...' }` pra a página funcionar sem precisar
// dos arquivos de imagem por perto). Inlinar um arquivo desses INTEIRO como
// texto no HTML do slide estoura o limite de 1 MiB por apresentação do
// Firestore sozinho, mesmo com as imagens de verdade sendo enviadas certas
// à parte — e o erro que aparece depois ("apresentação muito grande") não
// aponta pra ESTE arquivo como causa, deixando o problema difícil de achar
// (caso real, 2026-08-20: image_data.js de 4,5 MB). Detectar aqui, ANTES de
// tentar inlinar, e simplesmente pular esse arquivo (a tag <script src="...">/
// <link href="..."> que o carregava fica intacta e só aponta pra um caminho
// que não existe mais — inofensivo, não quebra o resto da página) é bem
// melhor que deixar o usuário descobrir só depois que o Firestore recusar a
// apresentação inteira.
const MAX_INLINE_TEXT_FILE_BYTES = 300 * 1024;

function fileExt(name) {
  const m = /\.([a-zA-Z0-9]+)$/.exec(name);
  return m ? m[1].toLowerCase() : '';
}

// Nome "puro" do arquivo (sem pasta) — o HTML original referencia esses
// arquivos por caminho relativo (ex.: "images/foo.png", "./styles.css"), mas
// o que importa pra casar com o arquivo selecionado é só o nome final, não o
// caminho inteiro. Isso vale tanto pra uma seleção multi-arquivo comum
// (sem estrutura de pastas) quanto pra uma pasta inteira selecionada via
// <input webkitdirectory> (ver bundleFolderInputRef em CodeSlideModal.jsx),
// que expõe file.webkitRelativePath com as subpastas (ex.: "images/foo.png")
// — descartamos essas subpastas de propósito, senão "images/foo.png" no
// markup não casaria com o arquivo cujo relativePath é "meuprojeto/images/foo.png".
function baseName(pathOrName) {
  return pathOrName.split(/[\\/]/).pop();
}

function isExternalUrl(url) {
  return /^https?:\/\//i.test(url) || url.startsWith('//') || url.startsWith('data:') || url.startsWith('#');
}

// Páginas exportadas pra rodar soltas no navegador costumam ter uma barra/
// cabeçalho com "position: fixed", pensada pra ficar grudada na janela
// inteira enquanto o PRÓPRIO DOCUMENTO rola. Aqui dentro, porém, quem rola é
// o <body> do iframe do slide (ver PresentationViewer.jsx), não a janela —
// e "fixed" é sempre relativo ao viewport, nunca a um container com scroll
// próprio. Resultado: a barra fica "flutuando" parada enquanto o resto do
// conteúdo desliza por baixo dela, sobrepondo texto/imagem. Trocar por
// "absolute" resolve: ancora no .slide-root (que garantimos como
// position:relative logo abaixo), então volta a rolar junto com o resto.
function neutralizeFixedPosition(css) {
  return css.replace(/position\s*:\s*fixed\b/gi, 'position: absolute');
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler ' + file.name));
    reader.readAsText(file);
  });
}

// Sobe a imagem pro Cloud Storage e devolve a URL pública, em vez de embutir
// o arquivo como data: URI direto no HTML — mesma rota que colar imagem/
// hotspot já usam (ver handlePasteImageFile/handleChangeHotspotConfig em
// PresentationEditor.jsx). Embutir como base64 parecia mais simples (não
// precisa de rede, funciona offline), mas o resultado vai inteiro pro campo
// `html` do slide, que é salvo como parte de UM ÚNICO documento no Firestore
// — limite rígido de 1 MiB por documento. Uma imagem em alta resolução
// (comum ao importar uma pasta inteira) sozinha já estoura isso, e o erro
// que o Firestore devolve nesse caso não menciona tamanho em lugar nenhum
// (ver findOversizedSlide em store.js — já aconteceu de verdade, 2026-08-07).
async function uploadImageFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiFetch('/api/materials/upload-media', { method: 'POST', body: formData });
  const data = await res.json();
  if (!data.success) throw new Error(`Falha ao enviar "${file.name}": ${data.error || 'erro desconhecido'}`);
  return data.url;
}

// Troca url(...) dentro de um bloco CSS pela URL de upload quando o arquivo
// referenciado estiver entre os selecionados (ex.: background-image:
// url('bg.png')) — sem isto, uma imagem de fundo declarada só no CSS (não no
// HTML) continuaria apontando pra um arquivo que não existe aqui dentro.
function inlineCssUrls(css, images) {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, _quote, url) => {
    if (isExternalUrl(url)) return full;
    const uploadedUrl = images[baseName(url)];
    return uploadedUrl ? `url('${uploadedUrl}')` : full;
  });
}

// Troca caminho de imagem local por URL de upload dentro de literais de string
// em código JS (ex.: `imgElement.src = "assets/img/foo.jpg"` ou um objeto de
// dados como `imagePaths: ["assets/img/foo.jpg", "./foo.jpg"]`). Sem isto, uma
// página com JS que seta/troca `.src` dinamicamente (comum em visualizações
// interativas geradas por IA, ex.: trocar de imagem ao clicar numa aba) fica
// com a tag <img> corrigida no HTML mas o script sobrescreve o `src` de volta
// pro caminho relativo original assim que roda — a imagem funciona ao abrir o
// index.html direto (onde o caminho relativo existe de verdade) mas some
// depois de importado (caso real, 2026-08-22: mechanism3d.js reatribuindo
// imgElement.src via loadImageWithFallback ao trocar de mecanismo de ação).
function inlineJsImageUrls(js, images) {
  // Caminho relativo com subpastas (ex.: "assets/img/foo.jpg") precisa da
  // "/" DENTRO do meio do valor, não só antes dele — daí o grupo repetido
  // "(segmento/)*" entre o "./" ou "../" opcional do início e o nome do
  // arquivo no final.
  return js.replace(/(['"`])((?:\.{1,2}\/)?(?:[\w.-]+\/)*[\w.-]+\.(?:png|jpe?g|gif|webp|svg|ico|bmp|avif))\1/gi, (full, quote, url) => {
    if (isExternalUrl(url)) return full;
    const uploadedUrl = images[baseName(url)];
    return uploadedUrl ? `${quote}${uploadedUrl}${quote}` : full;
  });
}

// Recebe uma FileList (ver <input type="file" multiple> em CodeSlideModal.jsx)
// com o .html principal + seus .css/.js/imagens locais, e devolve um único
// fragmento HTML autocontido (CSS/JS inline, imagens enviadas pro Cloud
// Storage e referenciadas por URL) pronto pra colar no "Código-Fonte" do
// criador de slides. CDNs externos (Google Fonts, FontAwesome etc.) continuam
// como <link>/<script src> normais — só arquivo LOCAL é processado aqui.
export async function bundleLocalFiles(fileList) {
  const files = Array.from(fileList);
  const texts = {}; // nome-do-arquivo -> conteúdo texto (css/js)
  const images = {}; // nome-do-arquivo -> URL pública no Cloud Storage
  const skippedOversized = []; // { name, sizeMb } — ver MAX_INLINE_TEXT_FILE_BYTES
  let htmlFile = null;
  let htmlText = '';

  for (const file of files) {
    const ext = fileExt(file.name);
    const name = baseName(file.webkitRelativePath || file.name);
    if (HTML_EXTENSIONS.has(ext)) {
      const text = await readAsText(file);
      // Mais de um .html selecionado (ex.: pasta inteira com vários
      // exemplos) prioriza "index.html"; senão fica com o primeiro encontrado.
      if (!htmlFile || name.toLowerCase() === 'index.html') {
        htmlFile = name;
        htmlText = text;
      }
    } else if (TEXT_EXTENSIONS.has(ext)) {
      if (file.size > MAX_INLINE_TEXT_FILE_BYTES) {
        skippedOversized.push({ name, sizeMb: (file.size / (1024 * 1024)).toFixed(1) });
        continue;
      }
      texts[name] = await readAsText(file);
    } else if (IMAGE_EXTENSIONS.has(ext)) {
      images[name] = await uploadImageFile(file);
    }
  }

  if (!htmlFile) {
    return { error: 'Nenhum arquivo .html encontrado na seleção — inclua o arquivo HTML principal junto com os outros (CSS/JS/imagens).' };
  }

  // Fase 1: substitui as referências locais por conteúdo inline, DENTRO do
  // texto bruto do HTML, preservando a posição original de cada uma — importa
  // sobretudo pra <script>, cuja ordem relativa ao resto do documento decide
  // se ele já encontra os elementos que manipula quando roda.
  let inlined = htmlText;

  inlined = inlined.replace(/<link\s+[^>]*rel=["']stylesheet["'][^>]*>/gi, (tag) => {
    const hrefMatch = /href\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (!hrefMatch || isExternalUrl(hrefMatch[1])) return tag;
    const css = texts[baseName(hrefMatch[1])];
    return css != null ? `<style>\n${inlineCssUrls(css, images)}\n</style>` : tag;
  });

  inlined = inlined.replace(/<script\s+[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>\s*<\/script>/gi, (tag, src) => {
    if (isExternalUrl(src)) return tag;
    const js = texts[baseName(src)];
    return js != null ? `<script>\n${js}\n</script>` : tag;
  });

  inlined = inlined.replace(/\b(src|href)\s*=\s*["']([^"']+)["']/gi, (full, attr, val) => {
    if (isExternalUrl(val)) return full;
    const data = images[baseName(val)];
    return data ? `${attr}="${data}"` : full;
  });

  // Fase 2: separa head/body pra descartar a "casca" de documento (doctype,
  // <html>, <head>, <title>, <meta>) e devolver só um fragmento plano — link/
  // style externos que sobraram + conteúdo do body — em vez de deixar um
  // documento HTML inteiro aninhado dentro de outro (ver bug do auto-
  // embrulho em CodeSlideModal.jsx, que corrigiu a DETECÇÃO de slide-root mas
  // não evita a bagunça estrutural de um <!DOCTYPE> no meio do <body> alheio).
  const doc = new DOMParser().parseFromString(inlined, 'text/html');

  // Neutraliza "position: fixed" tanto em <style> (regras de CSS) quanto em
  // atributos style="..." inline — ver neutralizeFixedPosition() acima.
  doc.querySelectorAll('style').forEach((styleEl) => {
    styleEl.textContent = neutralizeFixedPosition(styleEl.textContent);
  });
  doc.querySelectorAll('[style]').forEach((el) => {
    if (el.style.position === 'fixed') el.style.position = 'absolute';
  });

  // Cobre tanto <script> que já era inline no HTML original quanto os que
  // acabaram de ser inlinados a partir de .js externos (Fase 1 acima) — ver
  // inlineJsImageUrls(). Scripts com src="..." restante são CDN externo
  // (já filtrado na Fase 1) e ficam intocados.
  doc.querySelectorAll('script:not([src])').forEach((scriptEl) => {
    scriptEl.textContent = inlineJsImageUrls(scriptEl.textContent, images);
  });

  const headAssets = Array.from(doc.head?.querySelectorAll('link, style, script') || [])
    .map((el) => el.outerHTML)
    .join('\n');

  const bodyChildNodes = doc.body ? Array.from(doc.body.childNodes) : [];
  const meaningfulChildren = bodyChildNodes.filter((n) => !(n.nodeType === 3 && !n.textContent.trim()));

  let rootEl;
  if (meaningfulChildren.length === 1 && meaningfulChildren[0].nodeType === 1) {
    rootEl = meaningfulChildren[0];
  } else {
    // Mais de um nó de topo (ex.: HTML escrito à mão sem um único wrapper) —
    // embrulha todos num único <div>, senão não sobra um elemento de raiz pra
    // marcar como .slide-root e o resto do pipeline (ver CodeSlideModal.jsx)
    // cairia no auto-embrulho antigo de novo.
    rootEl = doc.createElement('div');
    // Ferramentas tipo Antigravity colocam as classes que fazem a página
    // ocupar a tela inteira (h-screen/w-screen/flex flex-col justify-between
    // etc.) no próprio <body>, não num wrapper interno — é o <body> que age
    // como container flex/grid do layout. Sem herdar essas classes pro novo
    // wrapper, ele vira uma <div> comum sem altura/flex nenhum, e o conteúdo
    // desmancha pro tamanho natural no canto superior esquerdo em vez de
    // preencher o slide (caso real, 2026-08-22: <body class="h-screen w-screen
    // ... flex flex-col justify-between"> perdido na importação).
    if (doc.body.className) rootEl.className = doc.body.className;
    if (doc.body.getAttribute('style')) rootEl.setAttribute('style', doc.body.getAttribute('style'));
    rootEl.append(...bodyChildNodes);
    doc.body.appendChild(rootEl);
  }

  // Garante a classe slide-root aqui mesmo (não depende da detecção de
  // CodeSlideModal.jsx) — com um estilo mínimo que NÃO centraliza o
  // conteúdo (ao contrário do wrapper de fallback do modal): a maioria
  // destas páginas importadas é mais alta que os 720/1080px do slide, e um
  // wrapper com justify-content/align-items:center empurraria a metade de
  // cima pra fora da área rolável (sintoma já visto: "o topo nunca aparece,
  // mesmo rolando até o fim pra cima").
  if (!rootEl.classList.contains('slide-root')) {
    rootEl.classList.add('slide-root');
    if (!rootEl.style.height) rootEl.style.height = '100%';
    // "w-screen"/"100vw" herdado do <body> original mede contra a janela do
    // navegador de verdade — dentro do slide isso pode passar um pouco do
    // que o container realmente tem (barra de rolagem etc.) e cortar/gerar
    // scroll horizontal indevido. 100% (relativo ao .slide-root) é o que os
    // outros containers do editor esperam.
    if (!rootEl.style.width) rootEl.style.width = '100%';
  }
  // Sempre garante um container posicionado pra ancorar os "position:
  // absolute" que vieram de "fixed" (ver neutralizeFixedPosition acima) —
  // mesmo quando .slide-root já existia no HTML original e por isso não caiu
  // no bloco acima.
  if (!rootEl.style.position) rootEl.style.position = 'relative';

  const fragment = [headAssets, rootEl.outerHTML].filter(Boolean).join('\n');
  const usedFiles = Object.keys(texts).length + Object.keys(images).length;

  const warning = skippedOversized.length
    ? `Arquivo(s) grande(s) demais ignorado(s) (provavelmente dados embutidos em base64, não CSS/JS de verdade): ${skippedOversized.map((f) => `${f.name} (${f.sizeMb} MB)`).join(', ')}. A tag que carregava esse arquivo ficou intacta no código mas vai apontar pra um caminho inexistente — se a página depender dele, ajuste o código (ver seção "Importações grandes demais" no chat) antes de importar de novo.`
    : null;

  return { html: fragment, htmlFileName: htmlFile, usedFiles, warning };
}
