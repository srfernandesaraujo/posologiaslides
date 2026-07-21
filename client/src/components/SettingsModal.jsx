import React, { useState, useEffect } from 'react';
import { Key, Shield, Save, X, Check } from 'lucide-react';

export default function SettingsModal({ isOpen, onClose }) {
  const [geminiKey, setGeminiKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setGeminiKey(localStorage.getItem('gemini_api_key') || '');
    setOpenaiKey(localStorage.getItem('openai_api_key') || '');
    setAnthropicKey(localStorage.getItem('anthropic_api_key') || '');
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = (e) => {
    e.preventDefault();
    localStorage.setItem('gemini_api_key', geminiKey.trim());
    localStorage.setItem('openai_api_key', openaiKey.trim());
    localStorage.setItem('anthropic_api_key', anthropicKey.trim());

    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)', padding: '0.5rem', borderRadius: '0.5rem' }}>
              <Key size={24} color="#fff" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Configuração de Chaves de API (IA)</h2>
              <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 0 }}>Cadastre suas chaves para usar modelos Gemini, OpenAI ou Anthropic</p>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 700, color: '#e5e7eb', marginBottom: '0.4rem' }}>
              Google Gemini API Key (Recomendado)
            </label>
            <input
              type="password"
              className="chat-input"
              style={{ width: '100%' }}
              placeholder="AIzaSy..."
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 700, color: '#e5e7eb', marginBottom: '0.4rem' }}>
              OpenAI API Key (GPT-4o)
            </label>
            <input
              type="password"
              className="chat-input"
              style={{ width: '100%' }}
              placeholder="sk-..."
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 700, color: '#e5e7eb', marginBottom: '0.4rem' }}>
              Anthropic Claude API Key
            </label>
            <input
              type="password"
              className="chat-input"
              style={{ width: '100%' }}
              placeholder="sk-ant-..."
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
            />
          </div>

          <div style={{ background: 'rgba(168, 85, 247, 0.1)', padding: '0.8rem', borderRadius: '0.5rem', borderLeft: '4px solid #a855f7', fontSize: '0.82rem', color: '#e9d5ff' }}>
            🔒 <strong>Segurança:</strong> Suas chaves de API são armazenadas localmente no seu navegador e enviadas diretamente às rotas seguras do servidor.
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button type="button" className="btn-icon" onClick={onClose} style={{ width: 'auto', padding: '0 1rem' }}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              {saved ? <Check size={18} /> : <Save size={18} />}
              {saved ? 'Salvo!' : 'Salvar Chaves'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
