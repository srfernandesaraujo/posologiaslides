import React, { useEffect, useRef, useState } from 'react';
import PresentationViewer from './PresentationViewer';

const NATIVE_WIDTH = 960;
const NATIVE_HEIGHT = 540; // 16:9

/**
 * Renderiza uma miniatura fiel do slide: o mesmo iframe sandboxed do
 * PresentationViewer, desenhado em tamanho real e reduzido via CSS transform
 * (como um "print" da tela), em vez de um ícone genérico ou cor lisa.
 */
export default function SlideThumbnail({ html }) {
  const containerRef = useRef(null);
  const [scale, setScale] = useState(0.2);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateScale = () => setScale(container.clientWidth / NATIVE_WIDTH);
    updateScale();

    const observer = new ResizeObserver(updateScale);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16/9',
        overflow: 'hidden',
        background: '#090d16'
      }}
    >
      <div
        style={{
          width: NATIVE_WIDTH,
          height: NATIVE_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          pointerEvents: 'none'
        }}
      >
        <PresentationViewer htmlContent={html} />
      </div>
    </div>
  );
}
