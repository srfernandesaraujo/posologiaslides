import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as LucideIcons from 'lucide-react';

// Conjunto curado (não a biblioteca lucide-react inteira, que tem milhares de
// ícones — inviável de navegar numa gaveta sem um catálogo dedicado) agrupado
// por categoria de uso no contexto de aulas de farmacologia.
export const ICON_GROUPS = [
  {
    label: 'Medicina & Farmácia',
    icons: ['Pill', 'Syringe', 'Stethoscope', 'HeartPulse', 'Thermometer', 'Brain', 'Bone', 'Eye', 'Ear', 'Droplet', 'FlaskConical', 'TestTube', 'Microscope', 'Dna', 'Bandage']
  },
  {
    label: 'Educação',
    icons: ['BookOpen', 'GraduationCap', 'Users', 'ClipboardList', 'Award', 'Lightbulb', 'Presentation', 'Trophy', 'Compass', 'Puzzle']
  },
  {
    label: 'Status & Alertas',
    icons: ['CheckCircle2', 'XCircle', 'AlertCircle', 'AlertTriangle', 'AlertOctagon', 'HelpCircle', 'Ban', 'BadgeCheck', 'Info', 'Smile', 'Frown']
  },
  {
    label: 'Interface & Setas',
    icons: ['ArrowRight', 'ArrowUpRight', 'Star', 'ThumbsUp', 'ThumbsDown', 'TrendingUp', 'TrendingDown', 'Clock', 'Flag', 'MapPin', 'ExternalLink', 'Zap', 'Shield', 'Lock', 'Unlock', 'Sparkles', 'Rocket', 'Target', 'Plus', 'Minus']
  }
];

export const ALL_ICON_NAMES = ICON_GROUPS.flatMap((g) => g.icons);

export function getIconComponent(name) {
  return LucideIcons[name] || LucideIcons.Circle;
}

// Serializa o ícone (componente React) pra uma string SVG estática, pra
// embutir direto no HTML do slide — o slide roda num iframe isolado sem
// acesso ao React da aplicação, então não dá pra inserir o componente vivo.
export function buildIconHtml({ icon, color, size } = {}) {
  const IconComponent = getIconComponent(icon);
  const svg = renderToStaticMarkup(
    createElement(IconComponent, { size: Number(size) || 48, color: color || '#22d3ee', strokeWidth: 2 })
  );
  return `<div style="display:inline-flex;margin:0.5rem;">${svg}</div>`;
}
