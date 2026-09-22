import React, { useEffect, useRef, useState } from 'react';
import PresentationViewer from './PresentationViewer';

const NATIVE_WIDTH = 960;
const NATIVE_HEIGHT = 540; // 16:9

/**
 * Renderiza uma miniatura do slide. Com `thumbnail` (data URI JPEG já
 * gerada no autosave, ver lib/thumbnailCapture.js), é só uma <img> — leve,
 * sem montar iframe nenhum. Sem ela (apresentações salvas antes desta
 * feature, ou ainda sem uma miniatura gerada), cai pro fallback antigo: o
 * mesmo iframe sandboxed do PresentationViewer, desenhado em tamanho real e
 * reduzido via CSS transform, como um "print" da tela.
 */
export default function SlideThumbnail({ html, thumbnail }) {
  const containerRef = useRef(null);
  const [scale, setScale] = useState(0.2);

  useEffect(() => {
    if (thumbnail) return;
    const container = containerRef.current;
    if (!container) return;

    const updateScale = () => setScale(container.clientWidth / NATIVE_WIDTH);
    updateScale();

    const observer = new ResizeObserver(updateScale);
    observer.observe(container);
    return () => observer.disconnect();
  }, [thumbnail]);

  if (thumbnail) {
    return (
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', overflow: 'hidden', background: '#090d16' }}>
        <img
          src={thumbnail}
          alt=""
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
    );
  }

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
        <PresentationViewer htmlContent={html} staticPreview />
      </div>
    </div>
  );
}
