// Fontes disponíveis pro painel "Texto" da barra de ação do elemento
// selecionado (ver PresentationEditor.jsx) — só as que o iframe do slide
// também importa via Google Fonts (ver @import em PresentationViewer.jsx);
// escolher uma fonte daqui sem o import correspondente cairia no fallback
// genérico do navegador.
export const FONT_OPTIONS = [
  { id: 'default', label: 'Padrão do slide', value: '' },
  { id: 'jakarta', label: 'Plus Jakarta Sans', value: "'Plus Jakarta Sans', sans-serif" },
  { id: 'geist', label: 'Geist', value: "'Geist', sans-serif" },
  { id: 'poppins', label: 'Poppins', value: "'Poppins', sans-serif" },
  { id: 'merriweather', label: 'Merriweather', value: "'Merriweather', serif" },
  { id: 'georgia', label: 'Georgia', value: "Georgia, 'Times New Roman', serif" },
  { id: 'mono', label: 'JetBrains Mono', value: "'JetBrains Mono', monospace" }
];

// Paleta rápida de cores de texto — cobre os casos mais comuns (contraste
// claro/escuro sobre foto, e os acentos já usados no resto do app, ver
// --accent-* em styles/index.css) antes de precisar do seletor customizado.
export const TEXT_COLOR_SWATCHES = [
  '#ffffff', '#0f172a', '#f9fafb', '#22d3ee', '#10b981', '#ec4899', '#f59e0b', '#ef4444'
];

// Paleta pro fundo da CAIXA de texto (painel "Texto" → "Fundo da caixa") —
// tons sólidos e escuros/claros de bom contraste, pensados pra combinar com
// TEXT_COLOR_SWATCHES acima (ex.: fundo #0f172a + texto #ffffff).
export const BG_COLOR_SWATCHES = [
  '#0f172a', '#1e293b', '#ffffff', '#f9fafb', '#22d3ee', '#10b981', '#ec4899', '#f59e0b', '#ef4444', '#7c3aed'
];

// Pares rápidos de gradiente (from/to) — mesmo diagonal 135deg de sempre no
// app (ver blockCatalog.js/index.css), só varia a dupla de cor.
export const GRADIENT_SWATCHES = [
  { from: '#22d3ee', to: '#0ea5e9' },
  { from: '#a78bfa', to: '#6366f1' },
  { from: '#f472b6', to: '#ec4899' },
  { from: '#fbbf24', to: '#f59e0b' },
  { from: '#34d399', to: '#059669' },
  { from: '#0f172a', to: '#1e293b' }
];
