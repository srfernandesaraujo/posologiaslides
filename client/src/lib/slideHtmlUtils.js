// Gera um sufixo curto e único para escopar ids/classes de um bloco inserido
// dentro do HTML do slide — permite inserir o mesmo bloco mais de uma vez sem
// colisão de id. Compartilhado entre os catálogos que geram HTML com <script>
// próprio (widgets interativos, gráficos, diagramas Mermaid).
export function uniqueId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
