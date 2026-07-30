import React, { useState, useEffect } from 'react';
import { Palette, X, Check, Sparkles, Layers } from 'lucide-react';
import { getSlideBackground } from '../lib/slideHtmlUtils';

// Palette presets
const PRESET_BACKGROUNDS = [
  { name: 'Escuro Padrão', value: '#0b1220' },
  { name: 'Obsidian Cyan', value: '#070d19' },
  { name: 'Preto Absoluto', value: '#000000' },
  { name: 'Vinho Profundo', value: '#1a0914' },
  { name: 'Verde Botânico', value: '#061a14' },
  { name: 'Grafite Nobre', value: '#1e293b' },
  { name: 'Claro Clean', value: '#f8fafc' },
  { name: 'Gradiente Cyan-Roxo', value: 'linear-gradient(135deg, #0b1220 0%, #1e1b4b 100%)' },
  { name: 'Gradiente Aurora', value: 'linear-gradient(135deg, #070d19 0%, #064e3b 100%)' },
  { name: 'Gradiente Vulcão', value: 'linear-gradient(135deg, #0b1220 0%, #451a03 100%)' },
  { name: 'Gradiente Neon', value: 'linear-gradient(135deg, #180b20 0%, #06b6d4 100%)' },
  { name: 'Gradiente Noite', value: 'linear-gradient(135deg, #020617 0%, #0f172a 100%)' }
];

export default function SlideBackgroundModal({ isOpen, onClose, currentSlideHtml, onApplyCurrent, onApplyAll }) {
  const [selectedBg, setSelectedBg] = useState('#0b1220');
  const [customColor, setCustomColor] = useState('#0b1220');

  useEffect(() => {
    if (isOpen && currentSlideHtml) {
      const currentBg = getSlideBackground(currentSlideHtml);
      setSelectedBg(currentBg);
      if (currentBg.startsWith('#')) {
        setCustomColor(currentBg);
      }
    }
  }, [isOpen, currentSlideHtml]);

  if (!isOpen) return null;

  const handleCustomChange = (color) => {
    setCustomColor(color);
    setSelectedBg(color);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        style={{ maxWidth: '600px', width: '95%' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'linear-gradient(135deg, #06b6d4, #a78bfa)', padding: '0.5rem', borderRadius: '0.5rem' }}>
              <Palette size={22} color="#071019" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>Cor de Fundo do Slide</h2>
              <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>
                Escolha a cor ou gradiente de fundo para personalizar a estética
              </p>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Pré-visualização da Cor Selecionada */}
        <div
          style={{
            height: '70px',
            borderRadius: '0.6rem',
            background: selectedBg,
            border: '1px solid rgba(255,255,255,0.2)',
            display: 'flex',
            alignItems: 'center',
            justify: 'center',
            marginBottom: '1.2rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            transition: 'background 0.2s ease'
          }}
        >
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: selectedBg === '#f8fafc' ? '#0f172a' : '#ffffff', textShadow: selectedBg === '#f8fafc' ? 'none' : '0 1px 4px rgba(0,0,0,0.6)' }}>
            Prévia: {selectedBg}
          </span>
        </div>

        {/* Swatches de Cores & Gradientes */}
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#9ca3af', marginBottom: '0.5rem' }}>
          Opções Pré-definidas
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.6rem', marginBottom: '1.2rem' }}>
          {PRESET_BACKGROUNDS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => setSelectedBg(preset.value)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.4rem 0.6rem',
                borderRadius: '0.5rem',
                border: selectedBg === preset.value ? '2px solid #22d3ee' : '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.03)',
                color: '#ffffff',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              <span
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  background: preset.value,
                  border: '1px solid rgba(255,255,255,0.3)',
                  flexShrink: 0
                }}
              />
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {preset.name}
              </span>
            </button>
          ))}
        </div>

        {/* Custom Color Picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', padding: '0.6rem 0.8rem', background: 'rgba(255,255,255,0.03)', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.08)' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#e2e8f0', flex: 1 }}>
            Escolher cor customizada (Hex):
          </label>
          <input
            type="color"
            value={customColor}
            onChange={(e) => handleCustomChange(e.target.value)}
            style={{ width: '36px', height: '36px', border: 'none', borderRadius: '0.4rem', cursor: 'pointer', background: 'none' }}
          />
          <input
            type="text"
            className="chat-input"
            value={customColor}
            onChange={(e) => handleCustomChange(e.target.value)}
            style={{ width: '90px', fontSize: '0.8rem', padding: '0.3rem 0.5rem', textTransform: 'uppercase' }}
          />
        </div>

        {/* Rodapé de Ações */}
        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', paddingTop: '0.8rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button className="btn-icon" onClick={onClose} style={{ width: 'auto', padding: '0.5rem 1rem' }}>
            Cancelar
          </button>
          <button
            className="btn-primary"
            onClick={() => { onApplyCurrent(selectedBg); onClose(); }}
            style={{ fontSize: '0.82rem', padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.1)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.2)' }}
          >
            <Check size={16} /> Aplicar neste Slide
          </button>
          <button
            className="btn-primary"
            onClick={() => { onApplyAll(selectedBg); onClose(); }}
            style={{ fontSize: '0.82rem', padding: '0.5rem 1.2rem', gap: '0.4rem' }}
          >
            <Layers size={16} /> Aplicar em TODOS os Slides
          </button>
        </div>
      </div>
    </div>
  );
}
