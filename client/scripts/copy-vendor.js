import { copyFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

// Copia os bundles de navegador do Chart.js e Mermaid.js para public/vendor,
// de onde são servidos como <script src="..."> dentro do iframe sandbox dos slides.
// Rode novamente após atualizar as versões de chart.js/mermaid no package.json.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'public', 'vendor');

mkdirSync(outDir, { recursive: true });

const files = [
  ['node_modules/chart.js/dist/chart.umd.min.js', 'chart.umd.min.js'],
  ['node_modules/mermaid/dist/mermaid.min.js', 'mermaid.min.js'],
];

for (const [src, dest] of files) {
  copyFileSync(path.join(root, src), path.join(outDir, dest));
  console.log(`Copiado: ${dest}`);
}
