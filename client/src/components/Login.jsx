import React, { useState } from 'react';
import { Presentation, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await login();
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError('Não foi possível entrar com essa conta Google.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2rem', padding: '1.5rem', overflow: 'hidden' }}>
      <div className="ambient-glow" />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Presentation size={32} color="var(--accent-primary)" />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700 }}>Posologia Slides</span>
      </div>

      <div className="glass-panel" style={{ position: 'relative', zIndex: 1, padding: '2.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', maxWidth: '360px', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 600 }}>Entre para acessar suas apresentações</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Suas pastas e apresentações ficam salvas na sua conta e isoladas de outros professores.
        </p>

        <button className="btn-primary" onClick={handleLogin} disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
          <LogIn size={18} /> {loading ? 'Entrando...' : 'Entrar com Google'}
        </button>

        {error && <p style={{ color: '#f87171', fontSize: '0.85rem' }}>{error}</p>}
      </div>
    </div>
  );
}
