import { useCallback, useRef, useState } from 'react';

// Generaliza o padrão já usado em SlideThumbnail.jsx (canvas nativo fixo +
// transform:scale) para qualquer container: observa o tamanho real da caixa
// em `outerRef` e calcula o fator de escala que faz um canvas de
// `nativeWidth x nativeHeight` caber nela por inteiro, com `bottomReserve`
// (px reais) sempre deixados livres na parte de baixo — espaço garantido
// pra UI que não deve encolher com o slide (ex. a barra de ferramentas).
//
// `outerRef` é uma CALLBACK ref (não um ref comum) de propósito: um
// `useRef` + `useEffect` com array de dependências fixo (nativeWidth/Height/
// bottomReserve, que nunca mudam) só roda a lógica de medição UMA vez, logo
// depois da primeira renderização — se o elemento com `ref={outerRef}` ainda
// nem existir nessa primeira renderização (ex.: uma tela de carregamento com
// "return" antecipado antes do palco de verdade aparecer, como em
// PublicPresentationView.jsx), o efeito lê `outerRef.current` como null,
// desiste, e NUNCA MAIS roda de novo — a escala fica travada no valor padrão
// (1) pra sempre, mesmo depois do elemento real aparecer. Uma callback ref
// não tem esse problema: o React a chama toda vez que o elemento é
// anexado/desanexado do DOM, não importa em qual renderização isso acontece.
export default function useCanvasFit(nativeWidth, nativeHeight, { bottomReserve = 0 } = {}) {
  const [scale, setScale] = useState(1);
  const nodeRef = useRef(null);
  const observerRef = useRef(null);

  const updateScale = useCallback(() => {
    const node = nodeRef.current;
    if (!node) return;
    const availableHeight = Math.max(0, node.clientHeight - bottomReserve);
    setScale(Math.min(node.clientWidth / nativeWidth, availableHeight / nativeHeight));
  }, [nativeWidth, nativeHeight, bottomReserve]);

  const outerRef = useCallback((node) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    nodeRef.current = node;
    if (!node) return;
    updateScale();
    observerRef.current = new ResizeObserver(updateScale);
    observerRef.current.observe(node);
  }, [updateScale]);

  // Preserva o uso já existente de `outerRef.current` (ex.:
  // `stageRef.current.requestFullscreen()`) — outerRef funciona tanto como
  // `ref={outerRef}` (callback ref) quanto como leitura direta do nó atual.
  Object.defineProperty(outerRef, 'current', {
    get: () => nodeRef.current,
    configurable: true
  });

  return { outerRef, scale };
}
