// Monta o placeholder editável (pergunta + 4 alternativas) inserido no canvas
// quando um slide vira "Quiz ao Vivo" (ver handleChangeSlideType em
// PresentationEditor.jsx). Antes disso o tipo só ativava o seletor de
// resposta certa (A/B/C/D) e o painel de resultados ao vivo, sem nenhum lugar
// pra digitar a pergunta/alternativas — usuário reportou não achar onde
// adicionar isso. O bloco inserido é HTML comum, editável do mesmo jeito que
// qualquer título/lista da Biblioteca de Conteúdo (ver blockCatalog.js).

// Marca o elemento raiz do bloco pra handleChangeSlideType não inserir de novo
// se o usuário só ligar/desligar o tipo "quiz" sem apagar o bloco.
export const QUIZ_PLACEHOLDER_MARKER = 'data-quiz-placeholder';

function buildOptionRow(letter) {
  return `
    <div style="display:flex; align-items:center; gap:0.75rem; padding:0.85rem 1.1rem; border-radius:0.65rem; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1);">
      <span style="flex-shrink:0; width:28px; height:28px; display:flex; align-items:center; justify-content:center; border-radius:50%; background:rgba(34,211,238,0.15); border:1px solid rgba(34,211,238,0.4); color:#67e8f9; font-size:0.8rem; font-weight:800;">${letter}</span>
      <span style="color:#e2e8f0; font-size:1.05rem; line-height:1.4;">Alternativa ${letter}</span>
    </div>`;
}

export function buildQuizPlaceholderHtml() {
  const rows = ['A', 'B', 'C', 'D'].map(buildOptionRow).join('');
  return `
<div ${QUIZ_PLACEHOLDER_MARKER}="1" style="width:100%; max-width:640px; text-align:left;">
  <h2 style="font-size:2rem; font-weight:800; color:#fff; letter-spacing:-0.01em; line-height:1.25; margin:0 0 1.5rem;">Digite a pergunta aqui</h2>
  <div style="display:flex; flex-direction:column; gap:0.65rem;">${rows}</div>
</div>`;
}
