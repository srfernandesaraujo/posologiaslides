import { BLOCK_CATALOG } from './blockCatalog';
import { LAYOUT_CATALOG } from './layoutCatalog';
import { DIAGRAM_CATALOG } from './diagramCatalog';
import { WIDGET_CATALOG } from './widgetCatalog';
import { appendIntoRoot } from './slideHtmlUtils';

const findById = (catalog, id) => catalog.find((item) => item.id === id);
const blockHtml = (id, config) => findById(BLOCK_CATALOG, id).buildHtml(config);
const layoutHtml = (id, config) => findById(LAYOUT_CATALOG, id).buildHtml(config);
const diagramHtml = (id, config) => findById(DIAGRAM_CATALOG, id).buildHtml(config);
const widgetHtml = (id, config) => findById(WIDGET_CATALOG, id).buildHtml(config);

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
// Atraso escalonado por peça (ver SYSTEM_PROMPT regra 6 em server/services/
// aiService.js — mesma convenção de entrada em cascata usada pelos slides
// gerados por IA) — usado só nas peças que este arquivo escreve à mão
// (título, hero, duelo, timeline...); peças vindas dos catálogos existentes
// (gráfico, simulador, grade de cards) já têm sua própria coreografia
// interna e não precisam de mais uma camada por cima.
const fadeUp = (i) => `animation:pos-fade-in-up 0.5s ${EASE} ${(i * 0.08).toFixed(2)}s both;`;

const BG = {
  violetCyan: 'radial-gradient(circle at 15% 15%, rgba(167,139,250,0.16), transparent 50%), radial-gradient(circle at 85% 85%, rgba(34,211,238,0.14), transparent 50%), #0b0f19',
  emeraldAmber: 'radial-gradient(circle at 85% 15%, rgba(52,211,153,0.14), transparent 50%), radial-gradient(circle at 15% 85%, rgba(251,191,36,0.12), transparent 50%), #0b0f19',
  cyanRose: 'radial-gradient(circle at 20% 80%, rgba(34,211,238,0.14), transparent 50%), radial-gradient(circle at 80% 20%, rgba(244,114,182,0.12), transparent 50%), #0b0f19',
  flat: 'linear-gradient(135deg, #0b0f19 0%, #111827 100%)',
  flatDeep: 'linear-gradient(160deg, #0a0e17 0%, #131a2b 100%)'
};

const ACCENTS = {
  cyan: { bg: 'rgba(34,211,238,0.12)', border: 'rgba(34,211,238,0.3)', fg: '#67e8f9', solid: '#22d3ee' },
  violet: { bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.3)', fg: '#c4b5fd', solid: '#a78bfa' },
  emerald: { bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.3)', fg: '#6ee7b7', solid: '#34d399' },
  amber: { bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)', fg: '#fcd34d', solid: '#fbbf24' }
};

// ---------------------------------------------------------------------------
// Peças reutilizadas entre templates (título, tag, texto, placeholder de
// imagem, colunas) — mais simples que os catálogos existentes porque não
// levam formulário de configuração: viram HTML puro, editável depois via
// "Editar HTML" do elemento selecionado (mesmo caminho já usado pra qualquer
// elemento sem metadado de catálogo, ver PresentationEditor.jsx).
// ---------------------------------------------------------------------------

function tagChip(text, accent = 'cyan', delayIndex = 0) {
  const a = ACCENTS[accent];
  return `<span style="display:inline-block;padding:0.35rem 0.9rem;border-radius:999px;background:${a.bg};border:1px solid ${a.border};color:${a.fg};font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;${fadeUp(delayIndex)}">${text}</span>`;
}

function heading(text, size, delayIndex) {
  return `<h1 style="font-size:${size};font-weight:800;line-height:1.15;margin:0;color:#fff;letter-spacing:-0.01em;max-width:900px;${fadeUp(delayIndex)}">${text}</h1>`;
}

function paragraph(text, delayIndex, size = '1.02rem') {
  return `<p style="font-size:${size};color:#94a3b8;line-height:1.65;margin:0;max-width:640px;${fadeUp(delayIndex)}">${text}</p>`;
}

function imagePlaceholder(hint) {
  return `
<div style="flex:1;min-height:280px;border-radius:1rem;border:2px dashed rgba(255,255,255,0.18);background:rgba(255,255,255,0.02);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.75rem;text-align:center;padding:2rem;box-sizing:border-box;">
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4b5563" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
  <div style="color:#6b7280;font-size:0.85rem;max-width:260px;">${hint || 'Substitua por uma imagem real — abra a Biblioteca de Mídias e insira a foto/diagrama.'}</div>
</div>`;
}

function twoColumns(leftHtml, rightHtml, ratio = '1fr 1fr', delayIndex = 1) {
  return `
<div style="display:grid;grid-template-columns:${ratio};gap:2.5rem;align-items:center;width:100%;${fadeUp(delayIndex)}">
  <div style="display:flex;flex-direction:column;gap:1rem;min-width:0;">${leftHtml}</div>
  <div style="display:flex;flex-direction:column;gap:1rem;min-width:0;">${rightHtml}</div>
</div>`;
}

// Monta o `.slide-root` vazio e insere cada peça em sequência via
// `appendIntoRoot` — a MESMA função usada quando o professor insere um bloco
// pela Biblioteca de Conteúdo. Peças vindas de um catálogo (source/config
// preenchidos) já saem com "Editar campos" pronto; peças escritas à mão neste
// arquivo (título, hero, duelo...) ficam editáveis via "Editar HTML".
function assemble(rootStyle, pieces) {
  let html = `<div class="slide-root" style="${rootStyle}"></div>`;
  pieces.forEach(({ html: pieceHtml, source, config }) => {
    html = appendIntoRoot(html, pieceHtml, source ? { source, config } : undefined);
  });
  return html;
}

const ROOT_BASE = 'height:100%;box-sizing:border-box;position:relative;';

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function buildTitleCenter() {
  return assemble(
    `${ROOT_BASE}display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:1.25rem;padding:4rem;background:${BG.violetCyan};`,
    [
      { html: tagChip('Categoria do Módulo', 'violet', 0) },
      { html: heading('Título Central da Apresentação', '3.2rem', 1) },
      { html: paragraph('Subtítulo ou contexto breve de uma linha para situar a turma.', 2, '1.1rem') }
    ]
  );
}

function buildTitleTopContent() {
  return assemble(
    `${ROOT_BASE}display:flex;flex-direction:column;gap:1.5rem;padding:3.5rem 4.5rem;justify-content:center;background:${BG.flat};`,
    [
      { html: tagChip('Tópico', 'cyan', 0) },
      { html: heading('Título do Slide', '2.5rem', 1) },
      {
        html: layoutHtml('markers-arrow', { items: 'Primeiro ponto-chave sobre o tema\nSegundo ponto-chave sobre o tema\nTerceiro ponto-chave sobre o tema' }),
        source: 'layouts:markers-arrow',
        config: { items: 'Primeiro ponto-chave sobre o tema\nSegundo ponto-chave sobre o tema\nTerceiro ponto-chave sobre o tema' }
      }
    ]
  );
}

function buildTextImage() {
  const left = [
    heading('Título do Slide', '2rem', 0),
    paragraph('Explique aqui o conceito que a imagem ao lado ilustra — um ou dois parágrafos curtos.', 1)
  ].join('');
  return assemble(
    `${ROOT_BASE}display:flex;flex-direction:column;gap:1.5rem;padding:3.5rem 4.5rem;justify-content:center;background:${BG.cyanRose};`,
    [
      { html: tagChip('Tópico', 'cyan', 0) },
      { html: twoColumns(left, imagePlaceholder(), '1fr 1fr', 1) }
    ]
  );
}

function buildTextChart() {
  const left = [
    heading('Título do Slide', '2rem', 0),
    paragraph('Comente os dados do gráfico ao lado — o que ele mostra e por que importa.', 1)
  ].join('');
  return assemble(
    `${ROOT_BASE}display:flex;flex-direction:column;gap:1.5rem;padding:3.5rem 4.5rem;justify-content:center;background:${BG.flat};`,
    [
      { html: tagChip('Dados', 'emerald', 0) },
      { html: twoColumns(left, diagramHtml('chart-builder'), '1fr 1.2fr', 1) }
    ]
  );
}

function buildTextSimulator() {
  return assemble(
    `${ROOT_BASE}display:flex;flex-direction:column;gap:1.25rem;padding:3.5rem 4.5rem;justify-content:center;background:${BG.emeraldAmber};`,
    [
      { html: tagChip('Simulador', 'cyan', 0) },
      { html: heading('Título do Slide', '2rem', 1) },
      { html: paragraph('Ajuste os controles abaixo pra explorar o comportamento ao vivo com a turma.', 2) },
      { html: widgetHtml('dose-simulator'), source: 'interativos:dose-simulator', config: {} }
    ]
  );
}

function buildOnlyElementsGrid() {
  const items = 'Primeiro ponto | Breve explicação do primeiro ponto.\nSegundo ponto | Breve explicação do segundo ponto.\nTerceiro ponto | Breve explicação do terceiro ponto.';
  return assemble(
    `${ROOT_BASE}display:flex;flex-direction:column;gap:1.5rem;padding:3.5rem 4.5rem;justify-content:center;background:${BG.flatDeep};`,
    [
      { html: tagChip('Visão Geral', 'violet', 0) },
      { html: layoutHtml('boxes-solid', { items }), source: 'layouts:boxes-solid', config: { items } }
    ]
  );
}

function buildTextOtherElements() {
  const calloutText = 'Destaque aqui um dado, alerta ou observação importante relacionada ao texto ao lado.';
  const tableRows = 'Parâmetro | Valor\nItem 1 | —\nItem 2 | —';
  const left = [
    heading('Título do Slide', '2rem', 0),
    paragraph('Desenvolva o texto principal do slide aqui — um ou dois parágrafos.', 1)
  ].join('');
  const right = [
    blockHtml('info-box', { text: calloutText }),
    blockHtml('table', { rows: tableRows })
  ].join('');
  return assemble(
    `${ROOT_BASE}display:flex;flex-direction:column;gap:1.5rem;padding:3.5rem 4.5rem;justify-content:center;background:${BG.cyanRose};`,
    [
      { html: tagChip('Detalhes', 'amber', 0) },
      { html: twoColumns(left, right, '1fr 1fr', 1) }
    ]
  );
}

// Cartão de identificação do paciente (idade/sexo/queixa/comorbidades) — pares
// rótulo/valor em linhas, não uma tabela, pra ficar compacto ao lado da
// vinheta do caso sem competir visualmente com a tabela de exames.
function patientCard(delayIndex) {
  const fields = [
    ['Idade', '58 anos'],
    ['Sexo', 'Feminino'],
    ['Queixa principal', 'Dor torácica'],
    ['Comorbidades', 'HAS, DM2']
  ];
  const rows = fields.map(([label, value]) => `
    <div style="display:flex;justify-content:space-between;gap:1rem;padding:0.55rem 0;border-bottom:1px solid rgba(255,255,255,0.08);">
      <span style="color:#9ca3af;font-size:0.82rem;font-weight:600;">${label}</span>
      <span style="color:#e2e8f0;font-size:0.88rem;font-weight:700;text-align:right;">${value}</span>
    </div>`).join('');
  return `
<div style="padding:1.5rem;border-radius:1rem;background:rgba(15,23,42,0.55);border:1px solid rgba(167,139,250,0.3);${fadeUp(delayIndex)}">
  <div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.6rem;">
    <div style="width:2.4rem;height:2.4rem;flex-shrink:0;border-radius:50%;background:rgba(167,139,250,0.15);display:flex;align-items:center;justify-content:center;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>
    </div>
    <div style="font-size:0.72rem;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#c4b5fd;">Identificação do Paciente</div>
  </div>
  ${rows}
</div>`;
}

// Pergunta disparada pra turma discutir o caso — âmbar (mesma cor de alerta/
// atenção usada em warning-box no BLOCK_CATALOG) pra destacar do resto do
// slide sem parecer um dado clínico a mais.
function discussionQuestion(text, delayIndex) {
  return `
<div style="padding:1.1rem 1.4rem;border-radius:0.75rem;background:rgba(251,191,36,0.08);border-left:3px solid rgba(251,191,36,0.7);${fadeUp(delayIndex)}">
  <div style="font-size:0.7rem;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:#fbbf24;margin-bottom:0.35rem;">Pergunta para discussão</div>
  <p style="margin:0;color:#f1f5f9;font-size:1rem;font-weight:600;line-height:1.5;">${text}</p>
</div>`;
}

function buildClinicalCase() {
  const vignette = 'Paciente relata início dos sintomas há 3 dias, com piora progressiva nas últimas horas. Nega episódios semelhantes anteriores. Em uso regular das medicações listadas a seguir.';
  const examRows = 'Parâmetro | Resultado\nPA | 150/95 mmHg\nFC | 92 bpm\nGlicemia | 210 mg/dL';
  const left = [
    heading('Caso Clínico', '2rem', 0),
    patientCard(1)
  ].join('');
  const right = [
    paragraph(vignette, 1),
    blockHtml('table', { rows: examRows })
  ].join('');
  return assemble(
    `${ROOT_BASE}display:flex;flex-direction:column;gap:1.25rem;padding:3.5rem 4.5rem;justify-content:center;background:${BG.flatDeep};`,
    [
      { html: tagChip('Caso Clínico', 'violet', 0) },
      { html: twoColumns(left, right, '0.85fr 1.15fr', 1) },
      { html: discussionQuestion('Qual seria a conduta terapêutica mais adequada para este caso, considerando o quadro apresentado?', 2) }
    ]
  );
}

// Linha de alternativa lettered (A/B/C/D) — usada pelo template "Caso
// Clínico · Pergunta" pra listar opções de conduta sem virar uma pergunta de
// múltipla escolha "funcional" de verdade (é só o enunciado visual; a
// discussão acontece ao vivo com a turma, não tem lógica de resposta certa
// embutida no slide).
function optionRow(letter, text, delayIndex) {
  return `
<div style="display:flex;align-items:center;gap:0.9rem;padding:0.9rem 1.1rem;border-radius:0.6rem;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);${fadeUp(delayIndex)}">
  <div style="width:2rem;height:2rem;flex-shrink:0;border-radius:50%;background:rgba(34,211,238,0.12);border:1px solid rgba(34,211,238,0.35);display:flex;align-items:center;justify-content:center;color:#67e8f9;font-weight:800;font-size:0.9rem;">${letter}</div>
  <div style="color:#e2e8f0;font-size:0.95rem;font-weight:600;">${text}</div>
</div>`;
}

// Variação "Evolução/Continuação" — pra quando o caso já foi apresentado
// num slide anterior e este só traz o desdobramento (retorno do paciente,
// resultado de exame pedido, resposta ao tratamento...), sem repetir
// identificação nem uma tabela de dados nova. Só texto corrido + pergunta.
function buildClinicalCaseFollowup() {
  const evolution = 'Paciente retorna após 48 horas com melhora parcial dos sintomas. Refere persistência de dor leve, sem novos sinais de alarme. Exame físico sem alterações significativas em relação à avaliação anterior.';
  return assemble(
    `${ROOT_BASE}display:flex;flex-direction:column;gap:1.5rem;padding:3.5rem 4.5rem;justify-content:center;background:${BG.flatDeep};`,
    [
      { html: tagChip('Caso Clínico', 'violet', 0) },
      { html: heading('Evolução do Caso', '2rem', 1) },
      { html: paragraph(evolution, 2, '1.08rem') },
      { html: discussionQuestion('O que muda na conduta a partir dessa evolução?', 3) }
    ]
  );
}

// Variação "Pergunta" — vinheta curta seguida de uma pergunta grande em
// destaque (protagonista do slide, não uma caixinha no rodapé) com
// alternativas de conduta pra guiar a discussão em turma, sem identificação
// do paciente nem tabela de exames.
function buildClinicalCaseQuestion() {
  const vignette = 'Paciente relata início dos sintomas há 3 dias, com piora progressiva nas últimas horas. Em uso regular das medicações listadas em prontuário.';
  const options = [
    ['A', 'Manter a conduta atual e reavaliar em 48 horas'],
    ['B', 'Ajustar a dose da medicação em uso'],
    ['C', 'Substituir por outra classe terapêutica'],
    ['D', 'Encaminhar para avaliação especializada']
  ];
  return assemble(
    `${ROOT_BASE}display:flex;flex-direction:column;gap:1.25rem;padding:3.5rem 4.5rem;justify-content:center;background:${BG.violetCyan};`,
    [
      { html: tagChip('Caso Clínico', 'violet', 0) },
      { html: paragraph(vignette, 1, '1.05rem') },
      { html: `<p style="font-size:1.6rem;font-weight:800;color:#fff;line-height:1.35;margin:0.15rem 0 0.25rem;max-width:820px;${fadeUp(2)}">Qual seria a conduta mais adequada diante deste quadro?</p>` },
      { html: `<div style="display:flex;flex-direction:column;gap:0.6rem;width:100%;max-width:680px;">${options.map(([letter, text], i) => optionRow(letter, text, 3 + i)).join('')}</div>` }
    ]
  );
}

function buildComparisonDuel() {
  const side = (title, accent, items) => {
    const a = ACCENTS[accent];
    const li = items.map((t) => `<li style="margin:0.5rem 0;color:#e2e8f0;font-size:0.95rem;line-height:1.5;">${t}</li>`).join('');
    return `
<div style="flex:1;padding:1.75rem;border-radius:1rem;background:rgba(15,23,42,0.55);border:1px solid ${a.border};">
  <div style="font-size:0.72rem;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:${a.fg};margin-bottom:0.75rem;">${title}</div>
  <ul style="margin:0;padding-left:1.2rem;list-style:disc;">${li}</ul>
</div>`;
  };

  const duel = `
<div style="display:flex;align-items:stretch;gap:1.25rem;width:100%;${fadeUp(1)}">
  ${side('Opção A', 'cyan', ['Primeira característica', 'Segunda característica', 'Terceira característica'])}
  <div style="flex-shrink:0;align-self:center;width:2.6rem;height:2.6rem;border-radius:50%;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;font-weight:800;color:#9ca3af;font-size:0.8rem;">VS</div>
  ${side('Opção B', 'amber', ['Primeira característica', 'Segunda característica', 'Terceira característica'])}
</div>`;

  return assemble(
    `${ROOT_BASE}display:flex;flex-direction:column;gap:1.5rem;padding:3.5rem 4.5rem;justify-content:center;background:${BG.flat};`,
    [
      { html: tagChip('Comparação', 'cyan', 0) },
      { html: heading('Título da Comparação', '2rem', 0) },
      { html: duel }
    ]
  );
}

function buildHeroStat() {
  return assemble(
    `${ROOT_BASE}display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:0.75rem;padding:4rem;background:${BG.violetCyan};`,
    [
      { html: tagChip('Dado em Destaque', 'violet', 0) },
      { html: `<div style="font-size:7rem;font-weight:800;line-height:1;background:linear-gradient(90deg,#22d3ee,#a78bfa);-webkit-background-clip:text;background-clip:text;color:transparent;${fadeUp(1)}">92%</div>` },
      { html: `<div style="font-size:1.25rem;font-weight:700;color:#fff;${fadeUp(2)}">Rótulo do dado</div>` },
      { html: paragraph('Uma frase de contexto explicando de onde vem esse número e por que ele importa.', 3) }
    ]
  );
}

function buildProcessDiagram() {
  const steps = ['Primeira etapa', 'Segunda etapa', 'Terceira etapa', 'Quarta etapa'];
  const stepsHtml = steps.map((label, i) => `
    ${i > 0 ? `<div style="flex:0 0 2.2rem;height:2px;background:linear-gradient(90deg,rgba(34,211,238,0.5),rgba(34,211,238,0.1));align-self:center;"></div>` : ''}
    <div style="flex:1;min-width:140px;display:flex;flex-direction:column;align-items:center;gap:0.6rem;text-align:center;">
      <div style="width:3rem;height:3rem;border-radius:50%;background:rgba(34,211,238,0.12);border:1px solid rgba(34,211,238,0.35);display:flex;align-items:center;justify-content:center;color:#67e8f9;font-weight:800;font-size:1.1rem;">${i + 1}</div>
      <div style="color:#e2e8f0;font-size:0.92rem;font-weight:600;line-height:1.4;">${label}</div>
    </div>`).join('');

  return assemble(
    `${ROOT_BASE}display:flex;flex-direction:column;gap:2.5rem;padding:3.5rem 4.5rem;justify-content:center;background:${BG.flatDeep};`,
    [
      { html: tagChip('Processo', 'cyan', 0) },
      { html: heading('Título do Processo', '2rem', 0) },
      { html: `<div style="display:flex;align-items:flex-start;flex-wrap:wrap;gap:0.5rem;width:100%;${fadeUp(1)}">${stepsHtml}</div>` }
    ]
  );
}

function buildTimeline() {
  const phases = ['Fase 1', 'Fase 2', 'Fase 3', 'Fase 4'];
  const dotsHtml = phases.map((label, i) => `
    <div style="flex:1;position:relative;display:flex;flex-direction:column;align-items:center;">
      <div style="width:1rem;height:1rem;border-radius:50%;background:#22d3ee;box-shadow:0 0 0 4px rgba(34,211,238,0.18);margin-bottom:0.75rem;"></div>
      <div style="color:#fff;font-weight:700;font-size:0.95rem;margin-bottom:0.3rem;">${label}</div>
      <div style="color:#9ca3af;font-size:0.8rem;text-align:center;max-width:150px;">Breve descrição desta fase.</div>
    </div>`).join('');

  return assemble(
    `${ROOT_BASE}display:flex;flex-direction:column;gap:2.5rem;padding:3.5rem 4.5rem;justify-content:center;background:${BG.emeraldAmber};`,
    [
      { html: tagChip('Linha do Tempo', 'emerald', 0) },
      { html: heading('Título da Sequência', '2rem', 0) },
      { html: `<div style="position:relative;display:flex;width:100%;${fadeUp(1)}"><div style="position:absolute;top:0.5rem;left:5%;right:5%;height:2px;background:rgba(34,211,238,0.25);"></div>${dotsHtml}</div>` }
    ]
  );
}

function buildFlashcards() {
  return assemble(
    `${ROOT_BASE}display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.25rem;padding:3.5rem;background:${BG.flat};`,
    [
      { html: tagChip('Revisão Rápida', 'cyan', 0) },
      { html: heading('Flashcards', '2rem', 1) },
      { html: widgetHtml('flashcards'), source: 'interativos:flashcards', config: {} }
    ]
  );
}

function buildQuoteHighlight() {
  return assemble(
    `${ROOT_BASE}display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;padding:4rem 6rem;background:${BG.cyanRose};`,
    [
      { html: tagChip('Insight', 'violet', 0) },
      { html: `<p style="font-size:2rem;font-weight:600;font-style:italic;color:#f1f5f9;line-height:1.4;text-align:center;max-width:820px;border-left:none;margin:0;${fadeUp(1)}">"Uma frase-chave que resume o conceito central deste tema."</p>` }
    ]
  );
}

function buildConclusionRecap() {
  const items = 'Primeiro conceito revisado\nSegundo conceito revisado\nTerceiro conceito revisado';
  return assemble(
    `${ROOT_BASE}display:flex;flex-direction:column;gap:1.5rem;padding:3.5rem 4.5rem;justify-content:center;background:${BG.emeraldAmber};`,
    [
      { html: tagChip('Resumo', 'emerald', 0) },
      { html: heading('O que vimos hoje', '2.2rem', 1) },
      { html: layoutHtml('markers-large', { items }), source: 'layouts:markers-large', config: { items } },
      { html: paragraph('Dúvidas? Vamos discutir antes de encerrar.', 3, '0.95rem') }
    ]
  );
}

function buildAcademicCalendar() {
  return assemble(
    `${ROOT_BASE}display:flex;flex-direction:column;gap:1.25rem;padding:3.5rem 4.5rem;justify-content:center;background:${BG.violetCyan};`,
    [
      { html: tagChip('Planejamento Acadêmico', 'violet', 0) },
      { html: widgetHtml('academic-calendar'), source: 'interativos:academic-calendar', config: {} }
    ]
  );
}

export const SLIDE_TEMPLATE_CATALOG = [
  { id: 'title-center', title: 'Título Centralizado', description: 'Capa ou abertura de seção — título grande no meio, com tag e subtítulo.', category: 'Título', iconName: 'Type', layoutTag: 'titulo-central', buildHtml: buildTitleCenter },
  { id: 'title-top-content', title: 'Título no Topo + Lista', description: 'Cabeçalho no alto seguido de uma lista de pontos-chave.', category: 'Título', iconName: 'Heading1', layoutTag: 'titulo-topo', buildHtml: buildTitleTopContent },
  { id: 'academic-calendar', title: 'Cronograma · Calendário Acadêmico', description: 'Calendário interativo para exibir o cronograma das aulas e avaliações aos alunos.', category: 'Conteúdo', iconName: 'CalendarDays', layoutTag: 'cronograma-calendario', buildHtml: buildAcademicCalendar },
  { id: 'text-image', title: 'Texto + Imagem', description: 'Texto de um lado, área reservada para foto/diagrama do outro.', category: 'Conteúdo', iconName: 'Image', layoutTag: 'texto-imagem', buildHtml: buildTextImage },
  { id: 'text-chart', title: 'Texto + Gráfico', description: 'Texto explicativo ao lado de um gráfico já funcional (Chart.js).', category: 'Dados', iconName: 'BarChart3', layoutTag: 'texto-grafico', buildHtml: buildTextChart },
  { id: 'text-simulator', title: 'Texto + Simulador', description: 'Texto de contexto seguido de um simulador de sliders já funcional.', category: 'Dados', iconName: 'Activity', layoutTag: 'simulador-slider', buildHtml: buildTextSimulator },
  { id: 'only-elements-grid', title: 'Somente Elementos (Grade)', description: 'Grade de cartões, sem bloco de texto corrido — direto ao ponto.', category: 'Elementos', iconName: 'LayoutGrid', layoutTag: 'grade-elementos', buildHtml: buildOnlyElementsGrid },
  { id: 'text-other-elements', title: 'Texto + Outros Elementos', description: 'Texto de um lado, destaque + tabela do outro.', category: 'Conteúdo', iconName: 'StickyNote', layoutTag: 'texto-elementos', buildHtml: buildTextOtherElements },
  { id: 'clinical-case', title: 'Caso Clínico · Completo', description: 'Identificação do paciente, vinheta, dados de exame e pergunta pra discussão em turma.', category: 'Caso Clínico', iconName: 'Stethoscope', layoutTag: 'caso-clinico', buildHtml: buildClinicalCase },
  { id: 'clinical-case-followup', title: 'Caso Clínico · Evolução', description: 'Continuação de um caso já apresentado — só a evolução do quadro e uma pergunta, sem repetir identificação/exames.', category: 'Caso Clínico', iconName: 'Stethoscope', layoutTag: 'caso-clinico-evolucao', buildHtml: buildClinicalCaseFollowup },
  { id: 'clinical-case-question', title: 'Caso Clínico · Pergunta', description: 'Vinheta curta com a pergunta de conduta em destaque e alternativas — foco na discussão, sem dados de identificação.', category: 'Caso Clínico', iconName: 'Stethoscope', layoutTag: 'caso-clinico-pergunta', buildHtml: buildClinicalCaseQuestion },
  { id: 'comparison-duel', title: 'Comparação em Duelo', description: 'Dois blocos lado a lado com contraste forte — ideal pra comparar opções.', category: 'Elementos', iconName: 'Columns2', layoutTag: 'comparacao-duelo', buildHtml: buildComparisonDuel },
  { id: 'hero-stat', title: 'Hero de Dado', description: 'Um número gigante como protagonista visual, com contexto mínimo.', category: 'Dados', iconName: 'Hash', layoutTag: 'hero-stat', buildHtml: buildHeroStat },
  { id: 'process-diagram', title: 'Diagrama de Processo', description: 'Etapas numeradas conectadas — mecanismos, vias, sequências.', category: 'Elementos', iconName: 'Workflow', layoutTag: 'diagrama-processo', buildHtml: buildProcessDiagram },
  { id: 'timeline', title: 'Linha do Tempo', description: 'Marcos horizontais conectados — fases ou sequência temporal.', category: 'Elementos', iconName: 'History', layoutTag: 'timeline', buildHtml: buildTimeline },
  { id: 'flashcards', title: 'Flashcards', description: 'Cartões giratórios de pergunta/resposta — clique pra virar.', category: 'Elementos', iconName: 'Layers', layoutTag: 'flashcards', buildHtml: buildFlashcards },
  { id: 'quote-highlight', title: 'Citação em Destaque', description: 'Frase grande centralizada — mensagem-chave ou insight conceitual.', category: 'Título', iconName: 'Quote', layoutTag: 'citacao-destaque', buildHtml: buildQuoteHighlight },
  { id: 'conclusion-recap', title: 'Encerramento / Resumo', description: 'Recapitulação numerada dos principais pontos da aula.', category: 'Encerramento', iconName: 'CheckCircle2', layoutTag: 'encerramento', buildHtml: buildConclusionRecap }
];
