import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

/**
 * Prompt do sistema para geração de slides HTML interativos
 */
const SYSTEM_PROMPT = `
Você é um designer de apresentações web de nível internacional e desenvolvedor especialista em HTML, CSS e JavaScript.
Sua missão é gerar páginas HTML completas, modernas e extremamente interativas que atuam como SLIDES de apresentação.

REGRAS DE DESIGN E CONTEÚDO:
1. Cada slide deve ser um bloco HTML independente com CSS inline ou dentro de <style> e JavaScript funcional dentro de <script>.
2. DESIGN PREMIUM: Use dark mode elegante, glassmorphism (backdrop-filter: blur), sombras neon sutis, tipografia moderna (Plus Jakarta Sans/Inter), gradientes vibrantes (roxo, azul-ciano, esmeralda, âmbar) e contraste alto para legibilidade em projeções.
3. ELEMENTOS INTERATIVOS OBRIGATÓRIOS:
   - Gráficos interativos usando Chart.js (com <canvas id="..." data-chart="..."> e inicialização script).
   - Componentes interativos nativos em JS (ex: abas alternáveis, simuladores com <input type="range"> que alteram valores/gráficos em tempo real, flashcards giratórios, simuladores numéricos/calculadoras, botões com animação).
   - Diagramas limpos com SVG ou Mermaid.js.
4. ESTRUTURA DO SLIDE:
   - Container principal com id="slide-container" (100% largura e altura do viewport de slide).
   - Header com título impactante e tag da categoria.
   - Área central responsiva — o layout de colunas (texto à esquerda + gráfico/simulador à direita) é APENAS UMA das opções possíveis, ver regra 8; não é o padrão a repetir em todo slide.
   - Footer com indicação sutil do tópico.
5. SEM DEPENDÊNCIAS EXTERNAS COMPLEXAS além de Chart.js e Fontes. Todo a interatividade JS deve ser limpa e sem erros.
6. ANIMAÇÕES DE ENTRADA: os elementos principais do slide (header, cards, itens de lista, gráfico) devem aparecer com uma animação sutil de entrada (fade-in combinado com leve translateY, via @keyframes + animation-fill-mode: both), escalonada por elemento com animation-delay curto (ex: 0.06s a 0.1s entre um item e o próximo). Use durações curtas (300–500ms) e easing suave (ease-out); nunca anime propriedades que quebrem o layout (evite animar width/height de containers).
7. COMPATIBILIDADE COM TOQUE E CANETA (o slide roda em tablets, incl. iPad com Apple Pencil): SEMPRE que precisar de interatividade além de <input type="range">/<button> nativos (ex: um elemento arrastável, um "canvas" de desenho customizado, drag-and-drop), use Pointer Events (pointerdown/pointermove/pointerup/pointercancel) e NUNCA apenas mousedown/mousemove/mouseup — mouse events não disparam a partir de toque/caneta e o elemento simplesmente não responderá em um tablet. Elementos nativos (<input type="range">, <button>, links) já funcionam com toque sem nenhum cuidado extra.
8. VARIEDADE E ANTI-GENERICIDADE (regra crítica): o maior erro possível é fazer o slide seguir o esqueleto raso "cabeçalho + lista de bullets à esquerda + gráfico/card à direita" ou "grade de cartõezinhos idênticos com ícone+número+frase" — isso é o clichê que qualquer IA genérica produz e deve ser EVITADO como estrutura padrão. Para CADA slide, escolha o tratamento visual dominante que melhor serve o CONTEÚDO ESPECÍFICO dele, entre estes (e outros equivalentes) — não se limite a card-grid:
   - Hero de dado: um único número/estatística gigante como protagonista visual, resto do slide é contexto mínimo.
   - Diagrama ou fluxo de processo anotado (setas, etapas numeradas) para mecanismos, vias de administração ou sequências.
   - Simulador real com sliders recalculando um gráfico ao vivo (ex.: curva de concentração x tempo, meia-vida, dose-resposta) para qualquer conteúdo quantitativo/ajustável.
   - Comparação em "duelo" (dois blocos lado a lado com contraste visual forte, não uma tabela burocrática) para comparar opções/classes/fármacos.
   - Citação ou insight em destaque tipográfico (frase grande, acento lateral, sem card ao redor) para conteúdo conceitual ou mensagem-chave.
   - Timeline horizontal/vertical para sequência temporal ou fases.
   - Flashcards giratórios (clique para virar) para pares pergunta/resposta ou termo/definição.
   Pelo menos UM elemento do slide deve romper a grade retangular padrão (ex: texto flutuando sobre gradiente sem moldura, número enorme sem card, forma orgânica/diagonal) — nem todo conteúdo pode estar dentro de caixinhas com a mesma borda/sombra/padding.
9. CONTEÚDO MANDA NA FORMA: a estrutura nasce do que o conteúdo realmente é (mecanismo de ação pede diagrama, não bullet list; dose pede simulador, não texto corrido; comparação pede duelo visual, não tabela genérica) — nunca o inverso. Números, rótulos e divisores carregam informação real (ex.: número = ordem de um passo, rótulo = fase do tratamento), nunca são decoração vazia.
`;

// Monta os "parts" enviados ao Gemini: texto puro quando não há imagens de
// referência, ou um array [texto, ...imagens inline] para aproveitar a
// entrada multimodal do modelo (permite à IA "ver" diagramas/fotos anexados).
function buildParts(promptText, images) {
  if (!images || !images.length) return promptText;
  return [
    promptText,
    ...images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } }))
  ];
}

function materialsBlock(materials) {
  return materials ? `MATERIAL DE REFERÊNCIA FORNECIDO PELO USUÁRIO:\n"""\n${materials}\n"""` : '';
}

export async function generatePresentationOutline({ prompt, materials, numSlides = 5, apiKey, images }) {
  const effectiveApiKey = apiKey || process.env.GEMINI_API_KEY;

  if (!effectiveApiKey) {
    return { outline: generateFallbackOutline(prompt, numSlides), warning: 'Nenhuma chave de API do Gemini configurada. Exibindo conteúdo de exemplo — configure sua chave em Configurações para gerar conteúdo real.' };
  }

  try {
    const genAI = new GoogleGenerativeAI(effectiveApiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const fullPrompt = `
    Baseado no seguinte tema e materiais, gere um roteiro (outline) de apresentação com ${numSlides} slides.
    TEMA/PROMPT: "${prompt}"
    MATERIAIS ADICIONAIS: "${materials || 'Nenhum material fornecido'}"

    Responda EXCLUSIVAMENTE em formato JSON VÁLIDO no seguinte esquema:
    {
      "title": "Título da Apresentação",
      "description": "Descrição curta do tema",
      "slides": [
        {
          "index": 1,
          "title": "Título do Slide 1",
          "subtitle": "Subtítulo do Slide 1",
          "type": "intro|chart|dashboard|simulator|comparison|conclusion",
          "keyPoints": ["Ponto 1", "Ponto 2", "Ponto 3"],
          "interactiveElement": "Descrição do elemento interativo (ex: gráfico de pizza interativo de custos)"
        }
      ]
    }
    `;

    const result = await model.generateContent(buildParts(fullPrompt, images));
    const responseText = result.response.text();
    const cleanJson = extractJson(responseText);
    return { outline: JSON.parse(cleanJson) };
  } catch (error) {
    console.error('Erro na API Gemini (Outline), usando gerador fallback:', error.message);
    return { outline: generateFallbackOutline(prompt, numSlides), warning: `Falha ao usar a IA Gemini (${error.message}). Exibindo conteúdo de exemplo.` };
  }
}

// Geração "do zero" quando o usuário preencheu prompt/material POR SLIDE (ver
// AIModalGenerator, seção "Prompt e Material por Slide") — em vez de deixar a
// IA inventar os ${numSlides} slides só a partir de um tema geral vago, cada
// slide do outline é ancorado na instrução/material específico que o usuário
// deu pra aquele slide, usando o tema geral só como pano de fundo de tom/coesão.
export async function generateOutlineFromSlidePrompts({ theme, materials, numSlides, slidesConfig, apiKey }) {
  const effectiveApiKey = apiKey || process.env.GEMINI_API_KEY;
  const count = slidesConfig.length || numSlides;

  if (!effectiveApiKey) {
    return { outline: generateFallbackOutline(theme, count), warning: 'Nenhuma chave de API do Gemini configurada. Exibindo conteúdo de exemplo — configure sua chave em Configurações para gerar conteúdo real.' };
  }

  try {
    const genAI = new GoogleGenerativeAI(effectiveApiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const slidesBlock = slidesConfig.map((s, i) => {
      const instruction = (s.prompt || '').trim() || '(nenhuma instrução específica — use o tema geral e bom senso para este slide)';
      const material = (s.materialText || '').trim();
      return `--- Slide ${i + 1} ---\nInstrução do usuário para este slide: ${instruction}${material ? `\nMaterial de apoio deste slide:\n"""\n${material}\n"""` : ''}`;
    }).join('\n\n');

    const fullPrompt = `
    Baseado no tema geral abaixo, gere um roteiro (outline) de apresentação com EXATAMENTE ${count} slides.

    IMPORTANTE: o usuário forneceu uma instrução e/ou material de apoio ESPECÍFICO para cada slide individualmente (ver abaixo, na ordem final da apresentação). Cada slide do outline deve ser fiel PRIMEIRO à instrução/material daquele slide específico — o tema geral serve só de pano de fundo pra manter tom e coesão entre os slides, NUNCA para substituir o que o usuário pediu pontualmente para um slide.

    TEMA GERAL: "${theme}"
    ${materialsBlock(materials)}

    INSTRUÇÕES POR SLIDE (na ordem final da apresentação):
    """
    ${slidesBlock}
    """

    Responda EXCLUSIVAMENTE em formato JSON VÁLIDO, com EXATAMENTE ${count} itens em "slides" (um por instrução acima, na mesma ordem), no seguinte esquema:
    {
      "title": "Título da Apresentação",
      "description": "Descrição curta do tema",
      "slides": [
        {
          "index": 1,
          "title": "Título do Slide 1 (baseado na instrução do slide 1)",
          "subtitle": "Subtítulo do Slide 1",
          "type": "intro|chart|dashboard|simulator|comparison|conclusion",
          "keyPoints": ["Ponto 1", "Ponto 2", "Ponto 3"],
          "interactiveElement": "Descrição do elemento interativo que melhor representa o conteúdo pedido para este slide"
        }
      ]
    }
    `;

    const result = await model.generateContent(fullPrompt);
    const responseText = result.response.text();
    const cleanJson = extractJson(responseText);
    const outline = JSON.parse(cleanJson);

    if (!Array.isArray(outline.slides) || outline.slides.length !== count) {
      console.warn(`generateOutlineFromSlidePrompts: esperava ${count} slides, recebeu ${outline.slides?.length ?? 0}.`);
    }

    return { outline };
  } catch (error) {
    console.error('Erro na API Gemini (Outline por slide), usando gerador fallback:', error.message);
    return { outline: generateFallbackOutline(theme, count), warning: `Falha ao usar a IA Gemini (${error.message}). Exibindo conteúdo de exemplo.` };
  }
}

// Importação de apresentação existente (ver AIModalGenerator, modo "Importar"
// + materialsRoutes.js /upload-presentation): em vez de inventar uma
// estrutura nova a partir de um tema livre, o outline é DERIVADO do texto de
// cada página do PDF original — um slide de outline por página, na mesma
// ordem, reproduzindo o conteúdo em vez de reinventá-lo. A segunda etapa
// (gerar o HTML de cada slide) reaproveita generateSlideHtml/o endpoint
// /api/ai/generate-slides sem nenhuma mudança, já que ambos só recebem um
// "outline" genérico e não se importam com a origem dele.
export async function generateOutlineFromImport({ pages, apiKey }) {
  const effectiveApiKey = apiKey || process.env.GEMINI_API_KEY;

  if (!effectiveApiKey) {
    return { outline: generateFallbackImportOutline(pages), warning: 'Nenhuma chave de API do Gemini configurada. Exibindo conteúdo de exemplo — configure sua chave em Configurações para gerar conteúdo real.' };
  }

  try {
    const genAI = new GoogleGenerativeAI(effectiveApiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const pagesBlock = pages.map((text, i) => `--- Página ${i + 1} ---\n${text}`).join('\n\n');

    const fullPrompt = `
    O usuário está IMPORTANDO uma apresentação existente pra este sistema. Abaixo está o texto extraído de cada página/slide do arquivo original (PDF), na ordem original.

    REPRODUZA a mesma sequência e conteúdo — NÃO invente slides novos, NÃO pule nenhuma página, mantenha a mesma ordem e a essência de cada uma. A reprodução é do CONTEÚDO/SIGNIFICADO de cada página, NÃO do layout estático do PDF original — o "interactiveElement" de cada slide deve propor uma representação visual moderna e rica, escolhida conforme o que o conteúdo da página realmente é (ex.: diagrama/fluxo anotado para um mecanismo, simulador de sliders para algo quantitativo, hero de dado para uma estatística central, timeline para uma sequência de fases, comparação em duelo para um confronto de opções, citação em destaque tipográfico para uma mensagem-chave, flashcards para pares pergunta/resposta) — NUNCA "colocar o texto da página original dentro de um card genérico".

    CONTEÚDO ORIGINAL (uma página por slide):
    """
    ${pagesBlock}
    """

    Responda EXCLUSIVAMENTE em formato JSON VÁLIDO, com EXATAMENTE ${pages.length} itens em "slides" (um por página, na mesma ordem do original), no seguinte esquema:
    {
      "title": "Título da Apresentação",
      "description": "Descrição curta do tema",
      "slides": [
        {
          "index": 1,
          "title": "Título do Slide 1 (baseado na página 1)",
          "subtitle": "Subtítulo do Slide 1",
          "type": "intro|chart|dashboard|simulator|comparison|conclusion",
          "keyPoints": ["Ponto 1", "Ponto 2", "Ponto 3"],
          "interactiveElement": "Descrição do elemento interativo que melhor representa o conteúdo original desta página"
        }
      ]
    }
    `;

    const result = await model.generateContent(fullPrompt);
    const responseText = result.response.text();
    const cleanJson = extractJson(responseText);
    const outline = JSON.parse(cleanJson);

    // Instrução forte no prompt, não garantia rígida — só loga se a IA não
    // seguir à risca, sem cortar/completar slides artificialmente (poderia
    // perder conteúdo real ou inventar um slide falso).
    if (!Array.isArray(outline.slides) || outline.slides.length !== pages.length) {
      console.warn(`generateOutlineFromImport: esperava ${pages.length} slides, recebeu ${outline.slides?.length ?? 0}.`);
    }

    return { outline };
  } catch (error) {
    console.error('Erro na API Gemini (Import Outline), usando gerador fallback:', error.message);
    return { outline: generateFallbackImportOutline(pages), warning: `Falha ao usar a IA Gemini (${error.message}). Exibindo conteúdo de exemplo.` };
  }
}

export async function generateSlideHtml({ slideOutline, presentationTitle, index, totalSlides, apiKey, images, previousLayoutTag }) {
  const effectiveApiKey = apiKey || process.env.GEMINI_API_KEY;

  if (!effectiveApiKey) {
    return { html: generateFallbackSlideHtml(slideOutline, presentationTitle, index, totalSlides), warning: 'Nenhuma chave de API do Gemini configurada. Exibindo conteúdo de exemplo — configure sua chave em Configurações para gerar conteúdo real.' };
  }

  try {
    const genAI = new GoogleGenerativeAI(effectiveApiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const fullPrompt = `
    ${SYSTEM_PROMPT}

    Gere o código HTML + CSS + JS COMPLETO para o Slide ${index} de ${totalSlides} da apresentação "${presentationTitle}".

    ESPECIFICAÇÃO DO SLIDE:
    - Título: ${slideOutline.title}
    - Subtítulo: ${slideOutline.subtitle}
    - Tipo: ${slideOutline.type}
    - Pontos Chave: ${JSON.stringify(slideOutline.keyPoints)}
    - Elemento Interativo Solicitado: ${slideOutline.interactiveElement}
    ${previousLayoutTag ? `\n    ATENÇÃO — VARIEDADE: o slide anterior desta mesma apresentação já usou o tratamento visual dominante "${previousLayoutTag}". Este slide é PROIBIDO de repetir esse mesmo tratamento — escolha um diferente da lista da regra 8, coerente com o conteúdo deste slide.` : ''}

    Instruções Técnicas:
    - Retorne APENAS o fragmento HTML (com <style> e <script> embutidos se necessário).
    - O container raiz deve ter classe "slide-root" e estilo de tela inteira (width: 100%; height: 100%; box-sizing: border-box; font-family: 'Plus Jakarta Sans', sans-serif).
    - Se for um gráfico, inclua a tag <canvas id="chart-${index}"></canvas> e o código JS para inicializar com Chart.js.
    - Se for um simulador, inclua sliders/botões e o JS para atualizar o DOM dinamicamente.
    - Na ÚLTIMA linha da resposta, adicione um comentário HTML isolado no formato exato <!-- layout: nome-curto-em-kebab-case --> nomeando em 2 a 4 palavras o tratamento visual dominante escolhido (ex: <!-- layout: hero-stat -->, <!-- layout: diagrama-processo -->, <!-- layout: simulador-slider -->). É uso interno, não aparece pro usuário.
    `;

    const result = await model.generateContent(buildParts(fullPrompt, images));
    const responseText = result.response.text();
    const cleaned = cleanCodeBlock(responseText);
    const layoutMatch = cleaned.match(/<!--\s*layout:\s*([a-z0-9-]+)\s*-->/i);
    const html = layoutMatch ? cleaned.replace(layoutMatch[0], '').trim() : cleaned;
    return { html, layoutTag: layoutMatch ? layoutMatch[1].toLowerCase() : null };
  } catch (error) {
    console.error(`Erro na API Gemini (Slide ${index}), usando gerador fallback:`, error.message);
    return { html: generateFallbackSlideHtml(slideOutline, presentationTitle, index, totalSlides), warning: `Falha ao usar a IA Gemini (${error.message}). Exibindo conteúdo de exemplo.` };
  }
}

export async function editSlideWithAi({ currentHtml, instruction, apiKey, materials, images, elementHtml }) {
  const effectiveApiKey = apiKey || process.env.GEMINI_API_KEY;
  // `elementHtml` presente: o usuário selecionou um elemento específico do
  // slide no editor — restringe a edição a esse fragmento (ver prompt abaixo),
  // em vez de reescrever o slide inteiro, que é o que fazia a IA às vezes
  // derrubar outros elementos ao pedir uma mudança pontual.
  const isElementScoped = !!elementHtml;

  if (!effectiveApiKey) {
    const warning = 'Nenhuma chave de API do Gemini configurada. Configure sua chave em Configurações para que a IA edite o slide de verdade.';
    return { html: isElementScoped ? elementHtml : generateEditedFallbackHtml(currentHtml, instruction), warning };
  }

  try {
    const genAI = new GoogleGenerativeAI(effectiveApiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = isElementScoped ? `
    ${SYSTEM_PROMPT}

    Você vai editar SOMENTE o fragmento HTML abaixo, que é UM elemento entre vários dentro de um slide maior — o restante do slide não está incluído aqui de propósito e NÃO deve ser mencionado nem recriado.

    FRAGMENTO ATUAL (o elemento selecionado):
    \`\`\`html
    ${elementHtml}
    \`\`\`

    ${materialsBlock(materials)}

    SOLICITAÇÃO DE ALTERAÇÃO DO USUÁRIO PARA ESTE ELEMENTO:
    "${instruction}"

    Regras obrigatórias da resposta:
    - Altere apenas este fragmento para atender à solicitação.
    - Se o fragmento tiver um elemento raiz com atributos "data-el-source" e/ou "data-el-config", mantenha-os EXATAMENTE como estão (não remova, não altere os valores).
    - Retorne APENAS o HTML atualizado deste fragmento — sem comentários, sem markdown, sem o resto do slide.
    ` : `
    ${SYSTEM_PROMPT}

    HTML ATUAL DO SLIDE:
    \`\`\`html
    ${currentHtml}
    \`\`\`

    ${materialsBlock(materials)}

    SOLICITAÇÃO DE ALTERAÇÃO DO USUÁRIO:
    "${instruction}"

    Altere o HTML/CSS/JS do slide para atender à solicitação de forma impecável.
    Use o material de referência acima (se houver) como base de conteúdo/dados.
    Retorne APENAS o novo HTML completo atualizado.
    `;

    const result = await model.generateContent(buildParts(prompt, images));
    return { html: cleanCodeBlock(result.response.text()) };
  } catch (error) {
    console.error('Erro na API Gemini (Edit Slide):', error.message);
    const warning = `Falha ao usar a IA Gemini (${error.message}). ${isElementScoped ? 'O elemento foi mantido sem alterações.' : 'A edição abaixo é apenas um marcador de exemplo.'}`;
    return { html: isElementScoped ? elementHtml : generateEditedFallbackHtml(currentHtml, instruction), warning };
  }
}

// Gera um fragmento de infográfico (HTML/CSS autocontido, sem <script>) pra
// ser inserido dentro de um slide já existente — não é um slide completo.
export async function generateInfographicFragment({ topic, materials, apiKey, images }) {
  const effectiveApiKey = apiKey || process.env.GEMINI_API_KEY;

  if (!effectiveApiKey) {
    return { html: generateFallbackInfographic(topic), warning: 'Nenhuma chave de API do Gemini configurada. Exibindo um infográfico de exemplo — configure sua chave em Configurações para gerar com IA de verdade.' };
  }

  try {
    const genAI = new GoogleGenerativeAI(effectiveApiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = `
    Você é um designer de infográficos para slides de aula.

    Gere um infográfico em HTML/CSS autocontido sobre o tema abaixo, para ser inserido DENTRO de um slide já existente (não é um slide completo, é só um trecho de conteúdo).

    TEMA: "${topic}"
    ${materialsBlock(materials)}

    REGRAS OBRIGATÓRIAS:
    - Retorne um único <div> raiz contendo de 3 a 5 "cards" lado a lado (flex ou grid), cada um com: um número/estatística OU no máximo um emoji Unicode como destaque visual, um rótulo curto em negrito, e uma frase de apoio com no máximo 12 palavras.
    - Visual escuro e elegante: fundo translúcido (ex. rgba(15,23,42,0.5)), bordas sutis (rgba(255,255,255,0.1)), acento em ciano (#22d3ee), texto claro. Todo o CSS inline (style="...").
    - NÃO use <script>, <img>, <svg> complexo, fontes externas ou ícones de bibliotecas externas (Font Awesome etc.).
    - Retorne APENAS o HTML do fragmento — nada de explicação, nada de markdown, nada de \`\`\`.
    `;

    const result = await model.generateContent(buildParts(prompt, images));
    return { html: cleanCodeBlock(result.response.text()) };
  } catch (error) {
    console.error('Erro na API Gemini (Infográfico):', error.message);
    return { html: generateFallbackInfographic(topic), warning: `Falha ao usar a IA Gemini (${error.message}). Exibindo um infográfico de exemplo.` };
  }
}

// Resume respostas abertas de alunos (ex.: nuvem de palavras) — texto puro, sem parse de JSON
export async function summarizeOpenResponses({ responses, apiKey }) {
  const effectiveApiKey = apiKey || process.env.GEMINI_API_KEY;
  const list = (responses || []).map((r) => (r || '').trim()).filter(Boolean);

  if (!effectiveApiKey) {
    return { summary: null, warning: 'Nenhuma chave de API do Gemini configurada. Configure sua chave em Configurações para gerar o resumo com IA.' };
  }
  if (list.length === 0) {
    return { summary: null, warning: 'Nenhuma resposta para resumir ainda.' };
  }

  try {
    const genAI = new GoogleGenerativeAI(effectiveApiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = `
    As respostas abaixo foram enviadas por alunos em uma aula ao vivo, em resposta a uma pergunta aberta.
    RESPOSTAS:
    ${list.map((r) => `- ${r}`).join('\n')}

    Resuma em no máximo 3 frases curtas os principais temas e padrões que aparecem nessas respostas.
    Responda em português, direto, sem introdução nem formatação markdown.
    `;

    const result = await model.generateContent(prompt);
    return { summary: result.response.text().trim() };
  } catch (error) {
    console.error('Erro na API Gemini (Summarize Responses):', error.message);
    return { summary: null, warning: `Falha ao gerar o resumo com IA (${error.message}).` };
  }
}

// Gera uma frase inspiradora original relacionada ao tema da aula, para o
// slide de encerramento virtual exibido após o último slide (ver
// PresentationEditor no cliente). Texto puro, sem parse de JSON — mesmo
// padrão de summarizeOpenResponses.
const FALLBACK_CLOSING_QUOTES = [
  'O conhecimento aplicado com cuidado é o que transforma tratamento em cura.',
  'Cada detalhe entendido hoje é uma decisão mais segura amanhã.',
  'Aprender é o primeiro passo para cuidar melhor de quem confia em nós.'
];

export async function generateClosingQuote({ presentationTitle, description, apiKey }) {
  const effectiveApiKey = apiKey || process.env.GEMINI_API_KEY;
  const theme = description || presentationTitle || 'o tema desta aula';
  const fallbackQuote = FALLBACK_CLOSING_QUOTES[Math.floor(Math.random() * FALLBACK_CLOSING_QUOTES.length)];

  if (!effectiveApiKey) {
    return { quote: fallbackQuote, warning: 'Nenhuma chave de API do Gemini configurada. Exibindo uma citação de exemplo.' };
  }

  try {
    const genAI = new GoogleGenerativeAI(effectiveApiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = `
    Crie UMA única frase inspiradora e original (aforismo), em português, relacionada ao tema abaixo — para encerrar uma aula/apresentação.
    TEMA DA AULA: "${theme}"

    Regras obrigatórias:
    - No máximo 30 palavras.
    - NÃO atribua a frase a nenhuma pessoa real (histórica, autor, celebridade) — é uma frase original, sem autoria, criada agora para esta aula.
    - Não coloque aspas, não use markdown, não adicione explicações nem introdução.
    - Retorne APENAS o texto da frase.
    `;

    const result = await model.generateContent(prompt);
    const quote = result.response.text().trim().replace(/^["'“]+|["'”]+$/g, '');
    return { quote: quote || fallbackQuote };
  } catch (error) {
    console.error('Erro na API Gemini (Closing Quote):', error.message);
    return { quote: fallbackQuote, warning: `Falha ao gerar a citação com IA (${error.message}). Exibindo uma citação de exemplo.` };
  }
}

// Auxiliares de parsing e fallback inteligente
function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}

function cleanCodeBlock(text) {
  return text.replace(/```html/g, '').replace(/```/g, '').trim();
}

// GERADORES FALLBACK RICOS E INTERATIVOS (Garante funcionamento perfeito mesmo sem API Key)
function generateFallbackOutline(prompt, numSlides) {
  const topic = prompt || 'Inovação e Tecnologia em 2026';
  return {
    title: topic.toUpperCase(),
    description: `Apresentação interativa sobre ${topic} com dashboards e simulações dinâmicas.`,
    slides: [
      {
        index: 1,
        title: topic,
        subtitle: 'Visão Geral e Introdução Estratégica',
        type: 'intro',
        keyPoints: ['Transformação Digital', 'Impacto Operacional', 'Oportunidades Futuras'],
        interactiveElement: 'Cards expansíveis com efeito de brilho e métricas animadas.'
      },
      {
        index: 2,
        title: 'Análise de Desempenho e Indicadores',
        subtitle: 'Dashboard de Resultados em Tempo Real',
        type: 'chart',
        keyPoints: ['Crescimento de Eficiência +42%', 'Redução de Custos Operacionais', 'Engajamento de Clientes'],
        interactiveElement: 'Gráfico interativo de rosquinha (Chart.js) com seletor de dados.'
      },
      {
        index: 3,
        title: 'Simulador Financeiro e ROI',
        subtitle: 'Projeção Interativa de Investimento',
        type: 'simulator',
        keyPoints: ['Calcule o retorno estimado', 'Ajuste os parâmetros em tempo real'],
        interactiveElement: 'Calculadora interativa com sliders de orçamento e tempo.'
      },
      {
        index: 4,
        title: 'Comparativo de Métodos e Tecnologias',
        subtitle: 'Modelo Tradicional vs Nova Abordagem',
        type: 'comparison',
        keyPoints: ['Agilidade na Execução', 'Escalabilidade Sem Fricção', 'Segurança Integrada'],
        interactiveElement: 'Tabela comparativa interativa com abas alternáveis e gráficos em barra.'
      },
      {
        index: 5,
        title: 'Conclusão e Próximos Passos',
        subtitle: 'Roteiro de Implementação',
        type: 'conclusion',
        keyPoints: ['Fase 1: Diagnóstico', 'Fase 2: Implantação Pilotada', 'Fase 3: Escala Global'],
        interactiveElement: 'Timeline de etapas interativa com progresso acumulado.'
      }
    ]
  };
}

// Fallback sem chave de API pra importação — um slide de outline por página,
// usando a primeira linha do texto extraído como título e o resto como
// pontos-chave, garantindo sempre `pages.length` slides mesmo sem IA de verdade.
function generateFallbackImportOutline(pages) {
  const slides = pages.map((pageText, i) => {
    const trimmed = (pageText || '').trim();
    const firstLine = trimmed.split('\n')[0].slice(0, 80) || `Página ${i + 1}`;
    const rest = trimmed.slice(firstLine.length).trim();
    const keyPoints = rest
      .split(/[.\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);

    return {
      index: i + 1,
      title: firstLine || `Página ${i + 1}`,
      subtitle: `Conteúdo importado (página ${i + 1} de ${pages.length})`,
      type: i === 0 ? 'intro' : i === pages.length - 1 ? 'conclusion' : 'dashboard',
      keyPoints: keyPoints.length ? keyPoints : ['Conteúdo original preservado desta página.'],
      interactiveElement: 'Cards com o conteúdo original da página, em destaque.'
    };
  });

  return {
    title: 'APRESENTAÇÃO IMPORTADA',
    description: `Apresentação reproduzida a partir de um PDF de ${pages.length} página(s).`,
    slides
  };
}

function generateFallbackSlideHtml(slideOutline, presentationTitle, index, totalSlides) {
  const slideId = `slide-${index}-${Date.now()}`;

  if (slideOutline.type === 'simulator') {
    return `
    <div class="slide-root" style="height: 100%; display: flex; flex-direction: column; justify-content: space-between; background: linear-gradient(135deg, #0b0f19 0%, #111827 100%); color: #f3f4f6; padding: 2.5rem; border-radius: 1rem; box-sizing: border-box;">
      <header style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1rem;">
        <div>
          <span style="font-size: 0.8rem; text-transform: uppercase; tracking: 0.1em; color: #10b981; font-weight: 700;">SIMULADOR INTERATIVO</span>
          <h2 style="font-size: 2rem; font-weight: 800; margin: 0.3rem 0 0 0; background: linear-gradient(90deg, #34d399, #60a5fa); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${slideOutline.title}</h2>
          <p style="margin: 0.2rem 0 0 0; color: #9ca3af; font-size: 1rem;">${slideOutline.subtitle}</p>
        </div>
        <div style="background: rgba(255,255,255,0.05); padding: 0.5rem 1rem; border-radius: 2rem; border: 1px solid rgba(255,255,255,0.1); font-weight: 600; color: #9ca3af;">
          Slide ${index}/${totalSlides}
        </div>
      </header>

      <main style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; align-items: center; margin: 1.5rem 0;">
        <div style="background: rgba(255,255,255,0.03); padding: 1.5rem; border-radius: 1rem; border: 1px solid rgba(255,255,255,0.08);">
          <h3 style="margin-top: 0; color: #38bdf8;">Controles de Simulação</h3>

          <div style="margin-bottom: 1.5rem;">
            <label style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 0.5rem;">
              <span>Orçamento Inicial (R$):</span>
              <strong id="val-budget-${slideId}">R$ 50.000</strong>
            </label>
            <input type="range" id="input-budget-${slideId}" min="10000" max="200000" step="5000" value="50000" style="width: 100%; accent-color: #3b82f6;">
          </div>

          <div style="margin-bottom: 1.5rem;">
            <label style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 0.5rem;">
              <span>Tempo de Execução (Meses):</span>
              <strong id="val-months-${slideId}">6 meses</strong>
            </label>
            <input type="range" id="input-months-${slideId}" min="1" max="24" step="1" value="6" style="width: 100%; accent-color: #10b981;">
          </div>

          <div style="background: rgba(16, 185, 129, 0.1); padding: 1rem; border-radius: 0.5rem; border-left: 4px solid #10b981;">
            <p style="margin: 0; font-size: 0.85rem; color: #a7f3d0;">💡 Ajuste os seletores acima para ver o retorno de investimento (ROI) projetado no painel ao lado.</p>
          </div>
        </div>

        <div style="background: rgba(255,255,255,0.03); padding: 1.5rem; border-radius: 1rem; border: 1px solid rgba(255,255,255,0.08); text-align: center;">
          <h3 style="margin-top: 0; color: #a78bfa;">Resultado Projetado</h3>
          <div style="font-size: 3rem; font-weight: 800; color: #34d399; margin: 1rem 0;" id="result-roi-${slideId}">R$ 142.500</div>
          <div style="font-size: 0.9rem; color: #9ca3af;" id="result-detail-${slideId}">ROI estimado de +185% em 6 meses com economia operacional de 32%</div>
        </div>
      </main>

      <footer style="display: flex; justify-content: space-between; font-size: 0.85rem; color: #6b7280; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 0.8rem;">
        <span>${presentationTitle}</span>
        <span>Posologia Interactive Presentation System</span>
      </footer>

      <script>
        (function() {
          const bInput = document.getElementById('input-budget-${slideId}');
          const mInput = document.getElementById('input-months-${slideId}');
          const bVal = document.getElementById('val-budget-${slideId}');
          const mVal = document.getElementById('val-months-${slideId}');
          const roiRes = document.getElementById('result-roi-${slideId}');
          const detailRes = document.getElementById('result-detail-${slideId}');

          function update() {
            if (!bInput || !mInput) return;
            const b = parseInt(bInput.value);
            const m = parseInt(mInput.value);
            bVal.textContent = 'R$ ' + b.toLocaleString('pt-BR');
            mVal.textContent = m + ' meses';

            const returnFactor = 1.4 + (m * 0.08);
            const total = Math.round(b * returnFactor);
            const percentage = Math.round((returnFactor - 1) * 100);

            roiRes.textContent = 'R$ ' + total.toLocaleString('pt-BR');
            detailRes.textContent = 'ROI estimado de +' + percentage + '% em ' + m + ' meses com economia operacional constante.';
          }

          if (bInput && mInput) {
            bInput.addEventListener('input', update);
            mInput.addEventListener('input', update);
          }
        })();
      </script>
    </div>
    `;
  }

  if (slideOutline.type === 'chart') {
    return `
    <div class="slide-root" style="height: 100%; display: flex; flex-direction: column; justify-content: space-between; background: linear-gradient(135deg, #090d16 0%, #151d2a 100%); color: #f3f4f6; padding: 2.5rem; border-radius: 1rem; box-sizing: border-box;">
      <header style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1rem;">
        <div>
          <span style="font-size: 0.8rem; text-transform: uppercase; tracking: 0.1em; color: #3b82f6; font-weight: 700;">DASHBOARD INTERATIVO</span>
          <h2 style="font-size: 2rem; font-weight: 800; margin: 0.3rem 0 0 0; background: linear-gradient(90deg, #60a5fa, #c084fc); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${slideOutline.title}</h2>
          <p style="margin: 0.2rem 0 0 0; color: #9ca3af; font-size: 1rem;">${slideOutline.subtitle}</p>
        </div>
        <div style="background: rgba(255,255,255,0.05); padding: 0.5rem 1rem; border-radius: 2rem; border: 1px solid rgba(255,255,255,0.1); font-weight: 600; color: #9ca3af;">
          Slide ${index}/${totalSlides}
        </div>
      </header>

      <main style="display: grid; grid-template-columns: 1fr 1.2fr; gap: 2rem; align-items: center; margin: 1rem 0;">
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 1rem;">
            ${slideOutline.keyPoints.map(kp => `
              <li style="background: rgba(255,255,255,0.04); padding: 1.2rem; border-radius: 0.75rem; border: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; gap: 1rem;">
                <div style="width: 2.5rem; height: 2.5rem; border-radius: 50%; background: linear-gradient(135deg, #3b82f6, #8b5cf6); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.1rem; flex-shrink: 0;">✓</div>
                <div style="font-size: 1rem; font-weight: 600; color: #e5e7eb;">${kp}</div>
              </li>
            `).join('')}
          </ul>
        </div>

        <div style="background: rgba(0,0,0,0.3); padding: 1.5rem; border-radius: 1rem; border: 1px solid rgba(255,255,255,0.1); position: relative; height: 280px; display: flex; align-items: center; justify-content: center;">
          <canvas id="chart-canvas-${slideId}" style="max-height: 250px; width: 100%;"></canvas>
        </div>
      </main>

      <footer style="display: flex; justify-content: space-between; font-size: 0.85rem; color: #6b7280; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 0.8rem;">
        <span>${presentationTitle}</span>
        <span>Posologia Interactive Presentation System</span>
      </footer>

      <script>
        (function() {
          function render() {
            const ctx = document.getElementById('chart-canvas-${slideId}');
            if (!ctx) return;
            if (typeof Chart === 'undefined') {
              setTimeout(render, 300);
              return;
            }
            new Chart(ctx, {
              type: 'bar',
              data: {
                labels: ['Q1', 'Q2', 'Q3', 'Q4'],
                datasets: [{
                  label: 'Crescimento de Eficiência (%)',
                  data: [18, 27, 36, 48],
                  backgroundColor: 'rgba(59, 130, 246, 0.7)',
                  borderColor: '#3b82f6',
                  borderWidth: 2,
                  borderRadius: 6
                }, {
                  label: 'Redução de Custos (%)',
                  data: [12, 19, 25, 34],
                  backgroundColor: 'rgba(16, 185, 129, 0.7)',
                  borderColor: '#10b981',
                  borderWidth: 2,
                  borderRadius: 6
                }]
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { labels: { color: '#e5e7eb' } }
                },
                scales: {
                  x: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                  y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } }
                }
              }
            });
          }
          render();
        })();
      </script>
    </div>
    `;
  }

  // Slide Padrão Interativo (com Flashcards ou Abas)
  return `
  <div class="slide-root" style="height: 100%; display: flex; flex-direction: column; justify-content: space-between; background: linear-gradient(135deg, #0d1117 0%, #161b22 100%); color: #f3f4f6; padding: 2.5rem; border-radius: 1rem; box-sizing: border-box;">
    <header style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1rem;">
      <div>
        <span style="font-size: 0.8rem; text-transform: uppercase; tracking: 0.1em; color: #a855f7; font-weight: 700;">CONCEITO CHAVE</span>
        <h2 style="font-size: 2.2rem; font-weight: 800; margin: 0.3rem 0 0 0; background: linear-gradient(90deg, #c084fc, #f472b6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${slideOutline.title}</h2>
        <p style="margin: 0.2rem 0 0 0; color: #9ca3af; font-size: 1rem;">${slideOutline.subtitle}</p>
      </div>
      <div style="background: rgba(255,255,255,0.05); padding: 0.5rem 1rem; border-radius: 2rem; border: 1px solid rgba(255,255,255,0.1); font-weight: 600; color: #9ca3af;">
        Slide ${index}/${totalSlides}
      </div>
    </header>

    <main style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; margin: 2rem 0;">
      ${slideOutline.keyPoints.map((kp, idx) => `
        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 1.5rem; border-radius: 1rem; transition: transform 0.3s, border-color 0.3s; cursor: pointer;" onmouseover="this.style.transform='translateY(-6px)'; this.style.borderColor='#a855f7'" onmouseout="this.style.transform='translateY(0)'; this.style.borderColor='rgba(255,255,255,0.08)'">
          <div style="width: 2.5rem; height: 2.5rem; border-radius: 0.5rem; background: rgba(168, 85, 247, 0.2); color: #c084fc; font-weight: 800; font-size: 1.2rem; display: flex; align-items: center; justify-content: center; margin-bottom: 1rem;">
            0${idx + 1}
          </div>
          <h3 style="margin: 0 0 0.5rem 0; font-size: 1.1rem; color: #f3f4f6;">${kp}</h3>
          <p style="margin: 0; font-size: 0.88rem; color: #9ca3af; line-height: 1.5;">Elemento interativo integrado diretamente no DOM com animações suaves e alta legibilidade.</p>
        </div>
      `).join('')}
    </main>

    <footer style="display: flex; justify-content: space-between; font-size: 0.85rem; color: #6b7280; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 0.8rem;">
      <span>${presentationTitle}</span>
      <span>Posologia Interactive Presentation System</span>
    </footer>
  </div>
  `;
}

function generateFallbackInfographic(topic) {
  const t = topic || 'o tema';
  const stats = [
    { value: '3', label: 'Pontos-chave', desc: `Principais aspectos de ${t}.` },
    { value: '85%', label: 'Retenção', desc: 'Estimativa de aprendizado com prática ativa.' },
    { value: '24h', label: 'Janela ideal', desc: 'Tempo recomendado para revisão do conteúdo.' }
  ];
  const cards = stats.map((s) => `
    <div style="flex:1;min-width:140px;background:rgba(15,23,42,0.5);border:1px solid rgba(255,255,255,0.1);border-radius:0.75rem;padding:1.2rem;text-align:center;">
      <div style="font-size:1.8rem;font-weight:800;color:#22d3ee;">${s.value}</div>
      <div style="font-size:0.85rem;font-weight:700;color:#fff;margin:0.3rem 0;">${s.label}</div>
      <div style="font-size:0.75rem;color:#9ca3af;">${s.desc}</div>
    </div>`).join('');
  return `<div style="display:flex;gap:1rem;flex-wrap:wrap;margin:1.5rem 0;">${cards}</div>`;
}

function generateEditedFallbackHtml(currentHtml, instruction) {
  // Altera sutilmente o HTML ou adiciona uma tag indicando a edição realizada
  const editBanner = `
  <div style="background: linear-gradient(90deg, #ec4899, #8b5cf6); color: white; padding: 0.5rem 1rem; border-radius: 0.5rem; font-weight: 700; font-size: 0.85rem; margin-bottom: 1rem; display: flex; align-items: center; justify-content: space-between;">
    <span>✨ Slide editado por IA: "${instruction}"</span>
    <span style="font-size: 0.75rem; opacity: 0.8;">Atualizado agora</span>
  </div>
  `;
  return currentHtml.replace('<main', editBanner + '<main');
}
