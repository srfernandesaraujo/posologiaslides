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
