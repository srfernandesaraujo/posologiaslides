import { useEffect, useRef, useState } from 'react';

// Generaliza o padrão já usado em SlideThumbnail.jsx (canvas nativo fixo +
// transform:scale) para qualquer container: observa o tamanho real da caixa
// em `outerRef` e calcula o fator de escala que faz um canvas de
// `nativeWidth x nativeHeight` caber nela por inteiro, com `bottomReserve`
// (px reais) sempre deixados livres na parte de baixo — espaço garantido
// pra UI que não deve encolher com o slide (ex. a barra de ferramentas).
export default function useCanvasFit(nativeWidth, nativeHeight, { bottomReserve = 0 } = {}) {
  const outerRef = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const node = outerRef.current;
    if (!node) return;

    const updateScale = () => {
      const availableHeight = Math.max(0, node.clientHeight - bottomReserve);
      setScale(Math.min(node.clientWidth / nativeWidth, availableHeight / nativeHeight));
    };
    updateScale();

    const observer = new ResizeObserver(updateScale);
    observer.observe(node);
    return () => observer.disconnect();
  }, [nativeWidth, nativeHeight, bottomReserve]);

  return { outerRef, scale };
}
