// Monta o HTML do slide de encerramento virtual, exibido após o último slide
// real da apresentação (nunca é salvo em presentation.slides — ver
// PresentationEditor). Reaproveita as mesmas keyframes (pos-fade-in-up,
// pos-pulse) que o PresentationViewer já injeta em todo documento de slide,
// para herdar a mesma linguagem visual das animações de entrada da IA.
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Identificador da mensagem que o link "Aula Relacionada" manda pro app
// principal ao ser clicado (ver listener em PresentationEditor.jsx) — mesmo
// padrão de ponte iframe→pai já usado por SLIDE_EDITOR_MESSAGE_SOURCE em
// PresentationViewer.jsx, só que este script roda SEMPRE (não só em modo
// editável), já que o slide de encerramento aparece tanto editando quanto
// apresentando de verdade.
export const RELATED_LINK_MESSAGE_SOURCE = 'posologia-related-link';

function buildRelatedLinkBlock(relatedPresentation) {
  if (!relatedPresentation?.id) return '';
  const title = escapeHtml(relatedPresentation.title || 'Próxima aula');
  // O id vem do Firestore (doc id, sempre alfanumérico) — ainda assim passa
  // por JSON.stringify (não interpolação crua) ao entrar no <script>, pra
  // nunca depender dessa suposição pra evitar quebrar o script.
  const idJson = JSON.stringify(relatedPresentation.id);

  return `
    <button id="posologia-related-link-btn" type="button" style="margin-top:1.5rem; display:inline-flex; align-items:center; gap:0.5rem; padding:0.7rem 1.3rem; border-radius:999px; border:1px solid rgba(52,211,153,0.4); background:rgba(52,211,153,0.1); color:#6ee7b7; font-size:0.9rem; font-weight:700; font-family:inherit; cursor:pointer; animation: pos-fade-in-up 0.5s ease 0.32s both;">
      <span>Próxima aula: ${title}</span>
      <span style="font-size:1.05rem; line-height:1;">&rarr;</span>
    </button>
    <script>
      (function () {
        var btn = document.getElementById('posologia-related-link-btn');
        if (!btn) return;
        btn.addEventListener('click', function () {
          window.parent.postMessage({ source: '${RELATED_LINK_MESSAGE_SOURCE}', type: 'open-related', id: ${idJson} }, '*');
        });
      })();
    </script>`;
}

export function buildClosingSlideHtml({ presentationTitle, userName, quote, quoteLoading, relatedPresentation }) {
  const title = escapeHtml(presentationTitle || 'Apresentação');
  const author = escapeHtml(userName);

  const quoteBlock = quoteLoading
    ? `<p style="font-size:1.1rem; font-style:italic; color:#9ca3af; margin:0.3rem 0 0; line-height:1.6; animation: pos-pulse 1.6s ease-in-out infinite;">Preparando uma reflexão final sobre o tema desta aula...</p>`
    : `<p style="font-size:1.15rem; font-style:italic; color:#e5e7eb; margin:0.3rem 0 0; line-height:1.6;">${escapeHtml(quote)}</p>`;

  return `
  <div class="slide-root" style="height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; background: linear-gradient(135deg, #090d16 0%, #111827 60%, #0d1a17 100%); color:#f3f4f6; padding:3rem; border-radius:1rem; box-sizing:border-box; position:relative; overflow:hidden;">
    <div style="position:absolute; inset:0; background: radial-gradient(circle at 50% 15%, rgba(16,185,129,0.14), transparent 60%); pointer-events:none;"></div>

    <span style="font-size:0.8rem; text-transform:uppercase; letter-spacing:0.14em; color:#34d399; font-weight:700; animation: pos-fade-in-up 0.5s ease both;">Encerramento</span>

    <h1 style="font-size:2.4rem; font-weight:800; margin:0.5rem 0 0; background:linear-gradient(90deg,#34d399,#22d3ee); -webkit-background-clip:text; -webkit-text-fill-color:transparent; animation: pos-fade-in-up 0.5s ease 0.08s both;">
      ${title}
    </h1>

    <p style="font-size:1.05rem; color:#9ca3af; margin:0.6rem 0 2rem; animation: pos-fade-in-up 0.5s ease 0.16s both;">
      Obrigado pela participação${author ? ` — apresentado por ${author}` : ''}.
    </p>

    <div style="max-width:640px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); border-radius:1rem; padding:1.8rem 2.2rem; backdrop-filter: blur(12px); position:relative; animation: pos-fade-in-up 0.5s ease 0.24s both;">
      <div style="font-size:2.6rem; line-height:1; color:#22d3ee; opacity:0.5; font-family:Georgia, serif;">&ldquo;</div>
      ${quoteBlock}
    </div>

    ${buildRelatedLinkBlock(relatedPresentation)}
  </div>
  `;
}
