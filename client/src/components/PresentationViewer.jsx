import React, { useEffect, useRef } from 'react';

/**
 * PresentationViewer renderiza o slide HTML atual dentro de um <iframe sandbox="allow-scripts">.
 * O iframe tem origem opaca (sem allow-same-origin), então o script do slide NUNCA tem acesso
 * ao window/document reais da aplicação, a cookies, a localStorage ou às chaves de API do usuário.
 * Chart.js e Mermaid.js são servidos localmente (public/vendor) e injetados dentro do documento
 * isolado para que os slides continuem podendo desenhar gráficos e diagramas.
 *
 * Mídia embutida (imagens/vídeos/áudios locais) usa data: URIs em vez de blob: —
 * blob: é preso à origem que o criou e não atravessa essa fronteira de origem opaca.
 * allow-popups é intencionalmente adicionado (baixo risco: só permite que uma página
 * embutida via <iframe> no slide abra uma aba nova, ex. "assistir no YouTube") sem
 * reintroduzir allow-same-origin, que quebraria o isolamento acima.
 *
 * reloadKey: entrar/sair do modo tela cheia NÃO muda htmlContent (é o mesmo slide),
 * então o efeito abaixo não recarregava o iframe nessa transição — o Chart.js e
 * outros scripts sensíveis a tamanho do slide já tinham medido o container ANTES
 * do palco redimensionar para o novo tamanho da tela cheia, e não recalculavam
 * corretamente depois. Passar isFullscreen como reloadKey força um recarregamento
 * completo (documento novo) toda vez que essa transição acontece, para que o
 * script do slide meça o tamanho final já estabilizado.
 */
export default function PresentationViewer({ htmlContent, reloadKey }) {
  const iframeRef = useRef(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const content = htmlContent || '<div style="color:#9ca3af; padding:2rem;">Slide Vazio</div>';
    const needsMermaid = /mermaid/i.test(content);

    const doc = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; font-family: 'Plus Jakarta Sans', sans-serif; background: #090d16; }
  * { box-sizing: border-box; }
</style>
<script src="/vendor/chart.umd.min.js"></script>
${needsMermaid ? '<script src="/vendor/mermaid.min.js"></script>' : ''}
</head>
<body>
${content}
</body>
</html>`;

    // Espera o layout do palco (tamanho novo de tela cheia, se for o caso) se
    // assentar por um frame antes de carregar o documento, para o script do
    // slide medir o container já no tamanho final.
    let frame1, frame2;
    frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => {
        // srcdoc substitui todo o documento do iframe (novo contexto isolado a cada troca de slide)
        iframe.srcdoc = doc;
      });
    });

    return () => {
      cancelAnimationFrame(frame1);
      if (frame2) cancelAnimationFrame(frame2);
    };
  }, [htmlContent, reloadKey]);

  return (
    <iframe
      ref={iframeRef}
      title="slide-content"
      sandbox="allow-scripts allow-forms allow-popups"
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        display: 'block',
        background: '#090d16'
      }}
    />
  );
}
