// Junta um HTML exportado de outra ferramenta (ex.: Antigravity) que referencia
// CSS/JS/imagens como arquivos SEPARADOS num único fragmento autocontido —
// troca <link rel="stylesheet" href="X"> por <style>, <script src="Y"> por
// <script> inline, e src/href de imagem por base64 — pra caber no que "Criar
// Slide por Código" (ver CodeSlideModal.jsx) aceita: um bloco só, sem nenhum
// arquivo de fora além de CDN (esses continuam externos de propósito, ver
// isExternalUrl). Usado por handleBundleFilesSelected em CodeSlideModal.jsx.

const TEXT_EXTENSIONS = new Set(['css', 'js', 'mjs']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif']);
const HTML_EXTENSIONS = new Set(['html', 'htm']);

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

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler ' + file.name));
    reader.readAsText(file);
  });
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler ' + file.name));
    reader.readAsDataURL(file);
  });
}

// Troca url(...) dentro de um bloco CSS por base64 quando o arquivo
// referenciado estiver entre os selecionados (ex.: background-image:
// url('bg.png')) — sem isto, uma imagem de fundo declarada só no CSS (não no
// HTML) continuaria apontando pra um arquivo que não existe aqui dentro.
function inlineCssUrls(css, images) {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, _quote, url) => {
    if (isExternalUrl(url)) return full;
    const data = images[baseName(url)];
    return data ? `url('${data}')` : full;
  });
}

// Recebe uma FileList (ver <input type="file" multiple> em CodeSlideModal.jsx)
// com o .html principal + seus .css/.js/imagens locais, e devolve um único
// fragmento HTML autocontido (CSS/JS inline, imagens em base64) pronto pra
// colar no "Código-Fonte" do criador de slides. CDNs externos (Google Fonts,
// FontAwesome etc.) continuam como <link>/<script src> normais — só arquivo
// LOCAL vira inline.
export async function bundleLocalFiles(fileList) {
  const files = Array.from(fileList);
  const texts = {}; // nome-do-arquivo -> conteúdo texto (css/js)
  const images = {}; // nome-do-arquivo -> data: URI
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
      texts[name] = await readAsText(file);
    } else if (IMAGE_EXTENSIONS.has(ext)) {
      images[name] = await readAsDataURL(file);
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
    if (!rootEl.style.position) rootEl.style.position = 'relative';
  }

  const fragment = [headAssets, rootEl.outerHTML].filter(Boolean).join('\n');
  const usedFiles = Object.keys(texts).length + Object.keys(images).length;

  return { html: fragment, htmlFileName: htmlFile, usedFiles };
}
