import React, { useState, useEffect } from 'react';
import { Key, Shield, Save, X, Check, Loader2 } from 'lucide-react';
import { apiFetch } from '../lib/api';

export default function SettingsModal({ isOpen, onClose }) {
  const [geminiKey, setGeminiKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setLoading(true);
    apiFetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setGeminiKey(data.geminiApiKey || '');
          setOpenaiKey(data.openaiApiKey || '');
          setAnthropicKey(data.anthropicApiKey || '');
        } else {
          setError(data.error || 'Falha ao carregar configurações.');
        }
      })
      .catch(() => setError('Não foi possível carregar suas chaves salvas.'))
      .finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const res = await apiFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          geminiApiKey: geminiKey.trim(),
          openaiApiKey: openaiKey.trim(),
          anthropicApiKey: anthropicKey.trim()
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Falha ao salvar.');

      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        onClose();
      }, 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'linear-gradient(135deg, #22d3ee, #3b82f6)', padding: '0.5rem', borderRadius: '0.5rem' }}>
              <Key size={24} color="#fff" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Configuração de Chaves de API (IA)</h2>
              <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 0 }}>Cadastre suas chaves para usar modelos Gemini, OpenAI ou Anthropic — salvas na sua conta, disponíveis em qualquer dispositivo</p>
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

          {error && (
            <div style={{ fontSize: '0.82rem', color: '#f87171', background: 'rgba(248,113,113,0.1)', padding: '0.6rem', borderRadius: '0.4rem' }}>
              {error}
            </div>
          )}

          <div style={{ background: 'rgba(34, 211, 238, 0.1)', padding: '0.8rem', borderRadius: '0.5rem', borderLeft: '4px solid #22d3ee', fontSize: '0.82rem', color: '#cffafe' }}>
            🔒 <strong>Segurança:</strong> Suas chaves de API ficam salvas na sua conta (Firestore, vinculadas ao seu login) — disponíveis automaticamente em qualquer dispositivo em que você entrar, sem precisar configurar de novo.
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button type="button" className="btn-icon" onClick={onClose} style={{ width: 'auto', padding: '0 1rem' }}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={loading || saving}>
              {saved ? <Check size={18} /> : saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              {saved ? 'Salvo!' : saving ? 'Salvando...' : 'Salvar Chaves'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
