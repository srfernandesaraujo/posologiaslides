import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../lib/api';
import { Smartphone, Send, CheckCircle2, Sparkles, Users } from 'lucide-react';

export default function StudentJoin() {
  const [socket, setSocket] = useState(null);
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [joined, setJoined] = useState(false);
  const [sessionTitle, setSessionTitle] = useState('');
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [slideType, setSlideType] = useState(null);
  const [hotspotImageUrl, setHotspotImageUrl] = useState(null);
  const [branches, setBranches] = useState(null);
  const [scoreFeedback, setScoreFeedback] = useState(null);

  // Estados de resposta do aluno
  const [quizChoice, setQuizChoice] = useState('');
  const [wordInput, setWordInput] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    // Tenta obter PIN da URL caso o aluno tenha escaneado o QR Code
    const params = new URLSearchParams(window.location.search);
    const pinParam = params.get('pin');
    if (pinParam) setPin(pinParam);

    const newSocket = io(API_URL || window.location.origin);
    setSocket(newSocket);

    newSocket.on('joined_successfully', ({ title, currentSlideIndex, slideType, hotspotImageUrl, branches }) => {
      setJoined(true);
      setSessionTitle(title);
      setCurrentSlideIndex(currentSlideIndex);
      setSlideType(slideType || null);
      setHotspotImageUrl(hotspotImageUrl || null);
      setBranches(branches || null);
    });

    newSocket.on('sync_slide', ({ currentSlideIndex, slideType, hotspotImageUrl, branches }) => {
      setCurrentSlideIndex(currentSlideIndex);
      setSlideType(slideType || null);
      setHotspotImageUrl(hotspotImageUrl || null);
      setBranches(branches || null);
      setSubmitted(false); // Reseta estado de envio para o novo slide
      setScoreFeedback(null);
    });

    newSocket.on('response_scored', ({ correct, points }) => {
      setScoreFeedback({ correct, points });
    });

    newSocket.on('join_error', ({ message }) => {
      alert(message);
    });

    return () => newSocket.close();
  }, []);

  const handleJoin = (e) => {
    e.preventDefault();
    if (!pin || !name.trim()) {
      alert('Digite o PIN e seu nome.');
      return;
    }
    if (socket) {
      socket.emit('join_session', { pin, name: name.trim() });
    }
  };

  const handleSendQuiz = (choice) => {
    setQuizChoice(choice);
    setSubmitted(true);
    if (socket) {
      socket.emit('submit_response', {
        pin,
        slideIndex: currentSlideIndex,
        responseType: slideType === 'tbl' ? 'tbl' : 'quiz',
        answer: choice
      });
    }
  };

  const handleSendBranchVote = (idx) => {
    setSubmitted(true);
    if (socket) {
      socket.emit('submit_response', {
        pin,
        slideIndex: currentSlideIndex,
        responseType: 'branch',
        answer: idx
      });
    }
  };

  const handleHotspotTap = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setSubmitted(true);
    if (socket) {
      socket.emit('submit_response', {
        pin,
        slideIndex: currentSlideIndex,
        responseType: 'hotspot',
        answer: { x, y }
      });
    }
  };

  const handleSendWord = (e) => {
    e.preventDefault();
    if (!wordInput.trim()) return;
    setSubmitted(true);
    if (socket) {
      socket.emit('submit_response', {
        pin,
        slideIndex: currentSlideIndex,
        responseType: 'wordcloud',
        answer: wordInput.trim()
      });
    }
  };

  if (!joined) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #090d16 0%, #111827 100%)', color: '#fff', padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '2rem', textAlign: 'center' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'linear-gradient(135deg, #22d3ee, #3b82f6)', display: 'flex', alignItems: 'center', justify: 'center', margin: '0 auto 1rem auto' }}>
            <Smartphone size={28} color="#fff" />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.3rem' }}>Participar da Apresentação</h2>
          <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '1.5rem' }}>Digite o PIN exibido no telão para interagir em tempo real</p>

          <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <input
                type="text"
                className="chat-input"
                placeholder="Código PIN (ex: 849201)"
                style={{ width: '100%', fontSize: '1.2rem', textAlign: 'center', letterSpacing: '0.1em', fontWeight: 700 }}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
              />
            </div>
            <div>
              <input
                type="text"
                className="chat-input"
                placeholder="Seu Nome ou Apelido"
                style={{ width: '100%', fontSize: '1rem', textAlign: 'center' }}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '0.8rem', fontSize: '1rem' }}>
              <Sparkles size={18} /> Entrar na Sessão
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#090d16', color: '#fff', padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
      {/* Top Header Mobile */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div>
          <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700 }}>● CONECTADO</span>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: '0.2rem 0 0 0' }}>{sessionTitle}</h3>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.08)', padding: '0.3rem 0.8rem', borderRadius: '1rem', fontSize: '0.8rem', fontWeight: 700 }}>
          {name}
        </div>
      </div>

      {/* Área Central de Resposta */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', margin: '2rem 0' }}>
        {submitted ? (
          <div style={{ textAlign: 'center', background: scoreFeedback && !scoreFeedback.correct ? 'rgba(248, 113, 113, 0.1)' : 'rgba(16, 185, 129, 0.1)', border: `1px solid ${scoreFeedback && !scoreFeedback.correct ? '#f87171' : '#10b981'}`, padding: '2rem', borderRadius: '1rem' }}>
            <CheckCircle2 size={48} color={scoreFeedback && !scoreFeedback.correct ? '#f87171' : '#10b981'} style={{ margin: '0 auto 1rem auto' }} />
            {scoreFeedback ? (
              <>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: scoreFeedback.correct ? '#34d399' : '#fca5a5' }}>
                  {scoreFeedback.correct ? `Correto! +${scoreFeedback.points} pontos` : 'Não foi dessa vez'}
                </h3>
                <p style={{ fontSize: '0.9rem', color: '#a7f3d0', margin: '0.5rem 0 0 0' }}>Confira o ranking no telão do professor.</p>
              </>
            ) : (
              <>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#34d399' }}>Resposta Enviada!</h3>
                <p style={{ fontSize: '0.9rem', color: '#a7f3d0', margin: '0.5rem 0 0 0' }}>Sua resposta foi computada e já está aparecendo no telão do professor.</p>
              </>
            )}
          </div>
        ) : branches && branches.length > 0 ? (
          <div style={{ width: '100%', maxWidth: '420px' }}>
            <h4 style={{ textAlign: 'center', fontSize: '1.1rem', color: '#9ca3af', marginBottom: '0.4rem' }}>
              Tomada de Decisão Clínica
            </h4>
            <p style={{ textAlign: 'center', fontSize: '0.8rem', color: '#6b7280', marginBottom: '1.25rem' }}>
              Vote na conduta que você seguiria:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {branches.map((b, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendBranchVote(idx)}
                  style={{
                    background: idx === 0 ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #3b82f6, #2563eb)',
                    color: '#fff',
                    border: 'none',
                    padding: '1rem 1.1rem',
                    borderRadius: '0.75rem',
                    fontSize: '1rem',
                    fontWeight: 700,
                    textAlign: 'left',
                    cursor: 'pointer',
                    boxShadow: '0 8px 20px rgba(0,0,0,0.4)'
                  }}
                >
                  {b.optionText || `Opção ${idx + 1}`}
                </button>
              ))}
            </div>
          </div>
        ) : slideType === 'hotspot' && hotspotImageUrl ? (
          <div style={{ width: '100%', maxWidth: '420px' }}>
            <h4 style={{ textAlign: 'center', fontSize: '1.1rem', color: '#9ca3af', marginBottom: '1rem' }}>
              Toque no ponto certo da imagem:
            </h4>
            <img
              src={hotspotImageUrl}
              alt="Hotspot"
              onClick={handleHotspotTap}
              style={{ width: '100%', borderRadius: '0.75rem', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.15)' }}
            />
          </div>
        ) : (
          <div style={{ width: '100%', maxWidth: '400px' }}>
            <h4 style={{ textAlign: 'center', fontSize: '1.1rem', color: '#9ca3af', marginBottom: '1.5rem' }}>
              {slideType === 'tbl'
                ? 'Verificação Individual (iRAT) — selecione sua resposta:'
                : `Slide #${currentSlideIndex + 1} - Selecione sua resposta:`}
            </h4>

            {/* Alternativas de Quiz (A, B, C, D) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              {['A', 'B', 'C', 'D'].map((opt, idx) => {
                const colors = ['#ef4444', '#3b82f6', '#f59e0b', '#10b981'];
                return (
                  <button
                    key={opt}
                    onClick={() => handleSendQuiz(opt)}
                    style={{
                      background: colors[idx],
                      color: '#fff',
                      border: 'none',
                      padding: '1.5rem',
                      borderRadius: '0.75rem',
                      fontSize: '1.8rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      boxShadow: '0 8px 20px rgba(0,0,0,0.4)'
                    }}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>

            {/* Nuvem de Palavras Input */}
            <form onSubmit={handleSendWord} style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.08)' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#38bdf8', fontWeight: 700, marginBottom: '0.5rem' }}>
                Ou envie uma palavra para a Nuvem de Palavras:
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  className="chat-input"
                  placeholder="Sua palavra..."
                  value={wordInput}
                  onChange={(e) => setWordInput(e.target.value)}
                />
                <button type="submit" className="btn-primary" style={{ padding: '0.6rem 1rem' }}>
                  <Send size={16} />
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#6b7280' }}>
        Posologia Slides
      </div>
    </div>
  );
}
