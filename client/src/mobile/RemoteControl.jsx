import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../lib/api';
import { Smartphone, ChevronLeft, ChevronRight, StickyNote } from 'lucide-react';

// Tela mobile do CONTROLE REMOTO — mesmo espírito visual/estrutural de
// StudentJoin.jsx (tema escuro, PIN pego da URL se veio de QR Code), mas um
// papel bem diferente: em vez de responder quiz, manda comandos de navegação
// pro apresentador (ver join_as_remote/remote_navigate em
// server/sockets/sessionSocket.js) e mostra o título + anotações do
// apresentador do slide atual, útil pra quem se afasta do computador durante
// a aula.
export default function RemoteControl() {
  const [socket, setSocket] = useState(null);
  const [pin, setPin] = useState('');
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [sessionTitle, setSessionTitle] = useState('');
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [totalSlides, setTotalSlides] = useState(null);
  const [slideTitle, setSlideTitle] = useState('');
  const [slideNotes, setSlideNotes] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pinParam = params.get('pin');
    if (pinParam) setPin(pinParam);

    const newSocket = io(API_URL || window.location.origin);
    setSocket(newSocket);

    newSocket.on('remote_joined', ({ title, currentSlideIndex, totalSlides, slideTitle, slideNotes }) => {
      setConnected(true);
      setError('');
      setSessionTitle(title || '');
      setCurrentSlideIndex(currentSlideIndex || 0);
      setTotalSlides(totalSlides || null);
      setSlideTitle(slideTitle || '');
      setSlideNotes(slideNotes || '');
    });

    newSocket.on('sync_slide', ({ currentSlideIndex, totalSlides, slideTitle, slideNotes }) => {
      setCurrentSlideIndex(currentSlideIndex || 0);
      if (totalSlides) setTotalSlides(totalSlides);
      setSlideTitle(slideTitle || '');
      setSlideNotes(slideNotes || '');
    });

    newSocket.on('join_error', ({ message }) => {
      setError(message);
    });

    return () => newSocket.close();
  }, []);

  const handleConnect = (e) => {
    e.preventDefault();
    if (!pin || !socket) return;
    setError('');
    socket.emit('join_as_remote', { pin });
  };

  const handleNavigate = (direction) => {
    if (socket) socket.emit('remote_navigate', { pin, direction });
  };

  if (!connected) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #090d16 0%, #111827 100%)', color: '#fff', padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '2rem', textAlign: 'center' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'linear-gradient(135deg, #22d3ee, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
            <Smartphone size={28} color="#fff" />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.3rem' }}>Controle Remoto</h2>
          <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '1.5rem' }}>Digite o PIN exibido no computador pra controlar a apresentação daqui</p>

          <form onSubmit={handleConnect} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input
              type="text"
              className="chat-input"
              placeholder="Código PIN (ex: 849201)"
              style={{ width: '100%', fontSize: '1.2rem', textAlign: 'center', letterSpacing: '0.1em', fontWeight: 700 }}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
            {error && <div style={{ color: '#f87171', fontSize: '0.85rem' }}>{error}</div>}
            <button type="submit" className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '0.8rem', fontSize: '1rem' }}>
              <Smartphone size={18} /> Conectar
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#090d16', color: '#fff', padding: '1.25rem', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div>
          <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700 }}>● CONECTADO</span>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: '0.2rem 0 0 0' }}>{sessionTitle}</h3>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.08)', padding: '0.3rem 0.8rem', borderRadius: '1rem', fontSize: '0.8rem', fontWeight: 700 }}>
          {totalSlides ? `${currentSlideIndex + 1} / ${totalSlides}` : `Slide ${currentSlideIndex + 1}`}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', margin: '1.5rem 0', gap: '1.5rem' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>{slideTitle || 'Slide atual'}</h2>
        </div>

        {slideNotes && (
          <div style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.25)', borderRadius: '0.75rem', padding: '1rem', maxHeight: '35vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#38bdf8', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
              <StickyNote size={14} /> Suas anotações
            </div>
            <p style={{ fontSize: '0.95rem', color: '#e5e7eb', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.5 }}>{slideNotes}</p>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <button
          onClick={() => handleNavigate('prev')}
          style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', padding: '1.5rem', borderRadius: '1rem', fontSize: '1.1rem', fontWeight: 700, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}
        >
          <ChevronLeft size={32} /> Anterior
        </button>
        <button
          onClick={() => handleNavigate('next')}
          style={{ background: 'linear-gradient(135deg, #22d3ee, #3b82f6)', color: '#fff', border: 'none', padding: '1.5rem', borderRadius: '1rem', fontSize: '1.1rem', fontWeight: 700, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', boxShadow: '0 8px 20px rgba(34,211,238,0.3)' }}
        >
          <ChevronRight size={32} /> Próximo
        </button>
      </div>

      <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#6b7280', marginTop: '1rem' }}>
        Posologia Slides — Controle Remoto
      </div>
    </div>
  );
}
