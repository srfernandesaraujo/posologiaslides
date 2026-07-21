import React, { useRef, useEffect, useState } from 'react';

/**
 * DrawingCanvas é uma camada transparente sobre o slide que fornece ferramentas
 * de anotação (Caneta, Marca-texto, Borracha e Apontador Laser).
 * Quando a ferramenta ativa é 'pointer', pointer-events é desativado para permitir interatividade com o slide.
 */
export default function DrawingCanvas({ 
  tool = 'pointer', // 'pointer' | 'pen' | 'highlighter' | 'eraser' | 'laser'
  color = '#ef4444',
  lineWidth = 4,
  clearTrigger = 0
}) {
  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const laserPosRef = useRef(null);
  const [laserPos, setLaserPos] = useState(null);

  // Ajusta o tamanho do Canvas para o tamanho exato da tela/container
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Limpar Canvas quando acionado pelo trigger
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, [clearTrigger]);

  // Manipuladores de Eventos de Desenho
  const startDrawing = (e) => {
    if (tool === 'pointer') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (tool === 'laser') {
      setLaserPos({ x, y });
      laserPosRef.current = { x, y };
      return;
    }

    isDrawingRef.current = true;
    ctx.beginPath();
    ctx.moveTo(x, y);

    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = lineWidth * 5;
    } else if (tool === 'highlighter') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = hexToRgba(color, 0.4);
      ctx.lineWidth = lineWidth * 4;
      ctx.lineCap = 'square';
      ctx.lineJoin = 'miter';
    } else {
      // Pen
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  };

  const draw = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (tool === 'laser') {
      setLaserPos({ x, y });
      laserPosRef.current = { x, y };
      return;
    }

    if (!isDrawingRef.current || tool === 'pointer') return;
    const ctx = canvas.getContext('2d');

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
  };

  function hexToRgba(hex, alpha) {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
  }

  const isPointerMode = tool === 'pointer';

  return (
    <div 
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: isPointerMode ? 'none' : 'auto',
        zIndex: 10
      }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        style={{
          width: '100%',
          height: '100%',
          cursor: tool === 'pointer' ? 'default' : tool === 'laser' ? 'none' : 'crosshair'
        }}
      />

      {/* Apontador Laser com efeito de Ponto Brilhante */}
      {tool === 'laser' && laserPos && (
        <div
          style={{
            position: 'absolute',
            left: laserPos.x - 8,
            top: laserPos.y - 8,
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            backgroundColor: '#ff0055',
            boxShadow: '0 0 16px #ff0055, 0 0 32px #ff0055, 0 0 48px #ff0055',
            pointerEvents: 'none',
            zIndex: 20,
            transition: 'transform 0.05s linear'
          }}
        />
      )}
    </div>
  );
}
