import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { QRCodeSVG } from 'qrcode.react';

function buildHeading(level, defaultText, size, weight) {
  return (config = {}) => {
    const text = (config.text || defaultText).trim();
    return `<h${level} style="font-size:${size};font-weight:${weight};color:#fff;letter-spacing:-0.01em;line-height:1.2;margin:0 0 0.75rem;">${text}</h${level}>`;
  };
}

function buildQuote(config = {}) {
  const text = (config.text || 'Uma citação marcante vai aqui.').trim();
  const author = (config.author || '').trim();
  return `
<blockquote style="margin:1.5rem 0;padding:0 0 0 1.25rem;border-left:3px solid #22d3ee;">
  <p style="font-size:1.3rem;font-weight:600;font-style:italic;color:#e2e8f0;line-height:1.5;margin:0;">"${text}"</p>
  ${author ? `<footer style="margin-top:0.6rem;font-size:0.85rem;color:#9ca3af;">— ${author}</footer>` : ''}
</blockquote>`;
}

function buildLabel(config = {}) {
  const text = (config.text || 'Rótulo').trim();
  return `<span style="display:inline-block;padding:0.3rem 0.8rem;border-radius:999px;background:rgba(34,211,238,0.12);border:1px solid rgba(34,211,238,0.3);color:#67e8f9;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 1rem;">${text}</span>`;
}

function buildTable(config = {}) {
  const raw = (config.rows || 'Coluna A | Coluna B | Coluna C\nLinha 1 | Valor | Valor\nLinha 2 | Valor | Valor').trim();
  const [header, ...body] = raw.split('\n').map((line) => line.split('|').map((cell) => cell.trim()));

  const headHtml = (header || []).map((cell) =>
    `<th style="text-align:left;padding:0.6rem 0.9rem;background:rgba(34,211,238,0.1);color:#67e8f9;font-size:0.75rem;font-weight:800;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid rgba(255,255,255,0.12);">${cell}</th>`
  ).join('');
  const bodyHtml = body.map((row) =>
    `<tr>${row.map((cell) => `<td style="padding:0.6rem 0.9rem;color:#e2e8f0;font-size:0.9rem;border-bottom:1px solid rgba(255,255,255,0.06);">${cell}</td>`).join('')}</tr>`
  ).join('');

  return `
<div style="margin:1.5rem 0;max-width:640px;border-radius:0.75rem;overflow:hidden;border:1px solid rgba(255,255,255,0.1);">
  <table style="width:100%;border-collapse:collapse;background:rgba(15,23,42,0.4);">
    <thead><tr>${headHtml}</tr></thead>
    <tbody>${bodyHtml}</tbody>
  </table>
</div>`;
}

function parseLines(raw, fallback) {
  return (raw || fallback).split('\n').map((s) => s.trim()).filter(Boolean);
}

function buildBulletList(config = {}) {
  const items = parseLines(config.items, 'Primeiro ponto\nSegundo ponto\nTerceiro ponto');
  const li = items.map((i) => `<li style="margin:0.5rem 0;color:#e2e8f0;font-size:1rem;line-height:1.5;">${i}</li>`).join('');
  return `<ul style="margin:1rem 0;padding-left:1.4rem;list-style:disc;">${li}</ul>`;
}

function buildNumberedList(config = {}) {
  const items = parseLines(config.items, 'Primeiro passo\nSegundo passo\nTerceiro passo');
  const li = items.map((i) => `<li style="margin:0.5rem 0;color:#e2e8f0;font-size:1rem;line-height:1.5;">${i}</li>`).join('');
  return `<ol style="margin:1rem 0;padding-left:1.4rem;list-style:decimal;">${li}</ol>`;
}

function buildTaskList(config = {}) {
  const items = parseLines(config.items, 'Revisar mecanismo de ação\nDefinir dose de ataque\nDiscutir efeitos adversos');
  const li = items.map((i) =>
    `<li style="display:flex;align-items:flex-start;gap:0.6rem;margin:0.5rem 0;color:#e2e8f0;font-size:1rem;line-height:1.4;"><input type="checkbox" style="margin-top:0.3rem;accent-color:#22d3ee;width:16px;height:16px;flex-shrink:0;" /><span>${i}</span></li>`
  ).join('');
  return `<ul style="margin:1rem 0;padding-left:0;list-style:none;">${li}</ul>`;
}

function buildCallout(label, color, bgColor, borderColor, defaultText) {
  return (config = {}) => {
    const text = (config.text || defaultText).trim();
    return `
<div style="margin:1.25rem 0;padding:1rem 1.25rem;border-radius:0.6rem;background:${bgColor};border-left:3px solid ${borderColor};">
  <div style="font-size:0.7rem;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:${color};margin-bottom:0.35rem;">${label}</div>
  <p style="margin:0;color:#e2e8f0;font-size:0.92rem;line-height:1.5;">${text}</p>
</div>`;
  };
}

function buildButton(config = {}) {
  const label = (config.label || 'Saiba mais').trim();
  const url = (config.url || '#').trim();
  return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin:1rem 0;padding:0.7rem 1.4rem;border-radius:0.6rem;font-weight:700;font-size:0.92rem;text-decoration:none;background:linear-gradient(135deg,#22d3ee,#06b6d4);color:#071019;">${label}</a>`;
}

function buildQrCode(config = {}) {
  const url = (config.url || 'https://').trim();
  const label = (config.label || '').trim();
  // QRCodeSVG é puro JS (sem canvas/DOM) — dá pra serializar direto pra string
  // e embutir como SVG estático no HTML do slide, sem precisar rodar nada
  // dentro do iframe sandboxed.
  const svg = renderToStaticMarkup(
    createElement(QRCodeSVG, { value: url, size: 176, bgColor: '#ffffff', fgColor: '#0f172a', level: 'M', marginSize: 2 })
  );
  return `
<div style="display:inline-flex;flex-direction:column;align-items:center;gap:0.6rem;margin:1.25rem 0;padding:1.1rem;background:#ffffff;border-radius:0.9rem;">
  ${svg}
  ${label ? `<div style="font-size:0.8rem;font-weight:700;color:#0f172a;">${label}</div>` : ''}
</div>`;
}

export const BLOCK_CATALOG = [
  {
    id: 'title',
    title: 'Título',
    description: 'Título grande de destaque para abrir o slide.',
    iconName: 'Type',
    configFields: [{ key: 'text', label: 'Texto', type: 'text', default: 'Título do Slide' }],
    buildHtml: buildHeading(1, 'Título do Slide', '2.6rem', 800)
  },
  {
    id: 'heading-1',
    title: 'Cabeçalho 1',
    description: 'Título de seção.',
    iconName: 'Heading1',
    configFields: [{ key: 'text', label: 'Texto', type: 'text', default: 'Cabeçalho 1' }],
    buildHtml: buildHeading(1, 'Cabeçalho 1', '2.1rem', 800)
  },
  {
    id: 'heading-2',
    title: 'Cabeçalho 2',
    description: 'Subtítulo de seção.',
    iconName: 'Heading2',
    configFields: [{ key: 'text', label: 'Texto', type: 'text', default: 'Cabeçalho 2' }],
    buildHtml: buildHeading(2, 'Cabeçalho 2', '1.6rem', 700)
  },
  {
    id: 'heading-3',
    title: 'Cabeçalho 3',
    description: 'Título de subseção menor.',
    iconName: 'Heading3',
    configFields: [{ key: 'text', label: 'Texto', type: 'text', default: 'Cabeçalho 3' }],
    buildHtml: buildHeading(3, 'Cabeçalho 3', '1.25rem', 700)
  },
  {
    id: 'quote',
    title: 'Bloco de Citação',
    description: 'Citação em destaque, com autor opcional.',
    iconName: 'Quote',
    configFields: [
      { key: 'text', label: 'Citação', type: 'textarea', default: 'Uma citação marcante vai aqui.' },
      { key: 'author', label: 'Autor (opcional)', type: 'text', default: '' }
    ],
    buildHtml: buildQuote
  },
  {
    id: 'label',
    title: 'Rótulo',
    description: 'Etiqueta pequena, ótima acima de um título.',
    iconName: 'Tag',
    configFields: [{ key: 'text', label: 'Texto', type: 'text', default: 'Rótulo' }],
    buildHtml: buildLabel
  },
  {
    id: 'table',
    title: 'Tabela',
    description: 'Tabela simples — primeira linha vira o cabeçalho.',
    iconName: 'Table2',
    configFields: [
      {
        key: 'rows',
        label: 'Linhas — uma por linha, células separadas por "|"',
        type: 'textarea',
        default: 'Coluna A | Coluna B | Coluna C\nLinha 1 | Valor | Valor\nLinha 2 | Valor | Valor'
      }
    ],
    buildHtml: buildTable
  },
  {
    id: 'bullet-list',
    title: 'Lista com Marcadores',
    description: 'Lista simples com marcadores.',
    iconName: 'List',
    configFields: [{ key: 'items', label: 'Itens — um por linha', type: 'textarea', default: 'Primeiro ponto\nSegundo ponto\nTerceiro ponto' }],
    buildHtml: buildBulletList
  },
  {
    id: 'numbered-list',
    title: 'Lista Numerada',
    description: 'Lista de passos em ordem.',
    iconName: 'ListOrdered',
    configFields: [{ key: 'items', label: 'Itens — um por linha', type: 'textarea', default: 'Primeiro passo\nSegundo passo\nTerceiro passo' }],
    buildHtml: buildNumberedList
  },
  {
    id: 'task-list',
    title: 'Lista de Tarefas',
    description: 'Checklist visual — clicável, mas não fica salvo.',
    iconName: 'ListChecks',
    configFields: [{ key: 'items', label: 'Tarefas — uma por linha', type: 'textarea', default: 'Revisar mecanismo de ação\nDefinir dose de ataque\nDiscutir efeitos adversos' }],
    buildHtml: buildTaskList
  },
  {
    id: 'note-box',
    title: 'Caixa de Observação',
    description: 'Destaque neutro para uma observação.',
    iconName: 'StickyNote',
    configFields: [{ key: 'text', label: 'Texto', type: 'textarea', default: 'Texto da observação.' }],
    buildHtml: buildCallout('Nota', '#cbd5e1', 'rgba(148,163,184,0.08)', 'rgba(148,163,184,0.6)', 'Texto da observação.')
  },
  {
    id: 'info-box',
    title: 'Caixa de Informações',
    description: 'Destaque azul para um dado importante.',
    iconName: 'Info',
    configFields: [{ key: 'text', label: 'Texto', type: 'textarea', default: 'Texto informativo.' }],
    buildHtml: buildCallout('Informação', '#22d3ee', 'rgba(34,211,238,0.08)', 'rgba(34,211,238,0.7)', 'Texto informativo.')
  },
  {
    id: 'warning-box',
    title: 'Caixa de Aviso',
    description: 'Destaque âmbar para um alerta (ex.: contraindicação).',
    iconName: 'AlertTriangle',
    configFields: [{ key: 'text', label: 'Texto', type: 'textarea', default: 'Texto de alerta.' }],
    buildHtml: buildCallout('Aviso', '#f59e0b', 'rgba(245,158,11,0.08)', 'rgba(245,158,11,0.7)', 'Texto de alerta.')
  },
  {
    id: 'button',
    title: 'Botão',
    description: 'Botão de link — abre a URL em nova aba.',
    iconName: 'Link2',
    configFields: [
      { key: 'label', label: 'Texto do botão', type: 'text', default: 'Saiba mais' },
      { key: 'url', label: 'URL de destino', type: 'text', default: 'https://' }
    ],
    buildHtml: buildButton
  },
  {
    id: 'qr-code',
    title: 'Código QR',
    description: 'Gera um QR code estático apontando pra uma URL.',
    iconName: 'QrCode',
    configFields: [
      { key: 'url', label: 'URL de destino', type: 'text', default: 'https://' },
      { key: 'label', label: 'Legenda (opcional)', type: 'text', default: '' }
    ],
    buildHtml: buildQrCode
  }
];
