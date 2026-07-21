import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Users, BarChart2, Cloud, GitBranch, Trophy, CheckCircle, ShieldAlert, ClipboardCheck } from 'lucide-react';

export default function ActiveMethodologiesOverlay({
  socket,
  pin,
  currentSlide,
  slideIndex,
  onNavigateBranch
}) {
  const [liveData, setLiveData] = useState({ answers: [], words: [], irat: [] });
  const [participantCount, setParticipantCount] = useState(0);

  useEffect(() => {
    if (!socket) return;

    const handleUpdate = ({ slideIndex: updatedSlideIndex, responses, totalParticipants }) => {
      if (updatedSlideIndex === slideIndex) {
        setLiveData(responses || { answers: [], words: [], irat: [] });
      }
      setParticipantCount(totalParticipants || 0);
    };

    const handleJoined = ({ count }) => setParticipantCount(count);
    const handleLeft = ({ count }) => setParticipantCount(count);

    socket.on('live_results_update', handleUpdate);
    socket.on('participant_joined', handleJoined);
    socket.on('participant_left', handleLeft);

    return () => {
      socket.off('live_results_update', handleUpdate);
      socket.off('participant_joined', handleJoined);
      socket.off('participant_left', handleLeft);
    };
  }, [socket, slideIndex]);

  // Se o slide for a Capa ou contiver QR Code de entrada
  const isIntroSlide = slideIndex === 0;
  const joinUrl = `${window.location.origin}/join?pin=${pin}`;

  // Calcula estatísticas de Quiz
  const quizCounts = { A: 0, B: 0, C: 0, D: 0 };
  liveData.answers.forEach(a => {
    if (quizCounts[a.answer] !== undefined) quizCounts[a.answer]++;
  });

  // Calcula estatísticas de TBL/iRAT (Verificação de Prontidão Individual)
  const iratCounts = { A: 0, B: 0, C: 0, D: 0 };
  liveData.irat.forEach(r => {
    if (iratCounts[r.choice] !== undefined) iratCounts[r.choice]++;
  });

  return (
    <div style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 30, display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-end' }}>
      {/* Widget do QR Code no Slide de Abertura / Capa */}
      {isIntroSlide && pin && (
        <div className="glass-panel" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(15, 23, 42, 0.9)' }}>
          <div style={{ background: '#fff', padding: '6px', borderRadius: '8px' }}>
            <QRCodeSVG value={joinUrl} size={70} />
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              ● PARTICIPE PELO CELULAR
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#38bdf8' }}>
              PIN: {pin}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Users size={12} /> {participantCount} alunos conectados
            </div>
          </div>
        </div>
      )}

      {/* Widget de Quiz ao Vivo */}
      {currentSlide?.type === 'quiz' && (
        <div className="glass-panel" style={{ padding: '1rem', width: '320px', background: 'rgba(15, 23, 42, 0.92)' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
            <BarChart2 size={16} /> Respostas ao Vivo ({liveData.answers.length})
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {['A', 'B', 'C', 'D'].map(opt => {
              const count = quizCounts[opt];
              const total = liveData.answers.length || 1;
              const pct = Math.round((count / total) * 100);

              return (
                <div key={opt} style={{ fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyBetween: 'space-between', color: '#e5e7eb', fontWeight: 700, marginBottom: '0.2rem' }}>
                    <span>Opção {opt}</span>
                    <span>{count} ({pct}%)</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #38bdf8, #10b981)', transition: 'width 0.3s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Widget de Nuvem de Palavras */}
      {currentSlide?.type === 'wordcloud' && (
        <div className="glass-panel" style={{ padding: '1rem', width: '320px', background: 'rgba(15, 23, 42, 0.92)' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
            <Cloud size={16} /> Nuvem de Palavras
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', maxHeight: '120px', overflowY: 'auto' }}>
            {liveData.words.map((item, idx) => (
              <span
                key={idx}
                style={{
                  background: 'rgba(56, 189, 248, 0.15)',
                  color: '#7dd3fc',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  padding: '0.3rem 0.6rem',
                  borderRadius: '1rem',
                  fontSize: '0.8rem',
                  fontWeight: 600
                }}
              >
                {item.word}
              </span>
            ))}
            {liveData.words.length === 0 && (
              <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>Aguardando palavras enviadas pelos alunos...</span>
            )}
          </div>
        </div>
      )}

      {/* Widget de TBL/iRAT — Verificação de Prontidão Individual */}
      {currentSlide?.type === 'tbl' && (
        <div className="glass-panel" style={{ padding: '1rem', width: '320px', background: 'rgba(15, 23, 42, 0.92)' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
            <ClipboardCheck size={16} /> Verificação Individual — iRAT ({liveData.irat.length})
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {['A', 'B', 'C', 'D'].map(opt => {
              const count = iratCounts[opt];
              const total = liveData.irat.length || 1;
              const pct = Math.round((count / total) * 100);

              return (
                <div key={opt} style={{ fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyBetween: 'space-between', color: '#e5e7eb', fontWeight: 700, marginBottom: '0.2rem' }}>
                    <span>Opção {opt}</span>
                    <span>{count} ({pct}%)</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #a78bfa, #22d3ee)', transition: 'width 0.3s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Widget de Trilha de Decisão (Decision Tree) */}
      {currentSlide?.branches && currentSlide.branches.length > 0 && (
        <div className="glass-panel" style={{ padding: '1rem', width: '340px', background: 'rgba(15, 23, 42, 0.95)', border: '1px solid #38bdf8' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
            <GitBranch size={16} /> Tomada de Decisão Médica / Clínica
          </div>
          <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: '0 0 0.75rem 0' }}>Escolha a conduta a seguir na apresentação:</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {currentSlide.branches.map((b, idx) => (
              <button
                key={idx}
                className="btn-primary"
                onClick={() => onNavigateBranch(b.targetSlideId)}
                style={{
                  background: idx === 0 ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #3b82f6, #2563eb)',
                  fontSize: '0.82rem',
                  justifyContent: 'flex-start',
                  padding: '0.6rem 0.8rem'
                }}
              >
                ➔ {b.optionText}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
