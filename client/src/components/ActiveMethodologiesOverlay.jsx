import React, { useState, useEffect, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Users, BarChart2, Cloud, GitBranch, Trophy, CheckCircle, ShieldAlert, ClipboardCheck, Target, Sparkles, Loader2, PieChart } from 'lucide-react';
import { layoutWordCloud } from '../lib/wordCloudLayout';
import { apiFetch } from '../lib/api';

export default function ActiveMethodologiesOverlay({
  socket,
  pin,
  currentSlide,
  slideIndex,
  onNavigateBranch
}) {
  const [liveData, setLiveData] = useState({ answers: [], words: [], irat: [], hotspots: [], branchVotes: [], points: [] });
  const [participantCount, setParticipantCount] = useState(0);
  const [leaderboard, setLeaderboard] = useState([]);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    if (!socket) return;

    const handleUpdate = ({ slideIndex: updatedSlideIndex, responses, totalParticipants }) => {
      if (updatedSlideIndex === slideIndex) {
        setLiveData(responses || { answers: [], words: [], irat: [], hotspots: [], branchVotes: [], points: [] });
      }
      setParticipantCount(totalParticipants || 0);
    };

    const handleJoined = ({ count }) => setParticipantCount(count);
    const handleLeft = ({ count }) => setParticipantCount(count);
    const handleLeaderboard = ({ leaderboard: board }) => setLeaderboard(board || []);

    socket.on('live_results_update', handleUpdate);
    socket.on('participant_joined', handleJoined);
    socket.on('participant_left', handleLeft);
    socket.on('leaderboard_update', handleLeaderboard);

    return () => {
      socket.off('live_results_update', handleUpdate);
      socket.off('participant_joined', handleJoined);
      socket.off('participant_left', handleLeft);
      socket.off('leaderboard_update', handleLeaderboard);
    };
  }, [socket, slideIndex]);

  // Reseta o resumo de IA ao trocar de slide — evita mostrar o resumo do slide anterior
  useEffect(() => {
    setSummary(null);
  }, [slideIndex]);

  const handleSummarize = async () => {
    setSummaryLoading(true);
    setSummary(null);
    try {
      const res = await apiFetch(`/api/sessions/${pin}/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slideIndex })
      });
      const data = await res.json();
      setSummary(data.summary || data.warning || 'Não foi possível gerar o resumo.');
    } catch {
      setSummary('Não foi possível gerar o resumo.');
    } finally {
      setSummaryLoading(false);
    }
  };

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

  // Calcula a média de pontos alocados por opção (distribuição de 100 pontos),
  // ordenada da maior média pra menor — cada resposta individual já soma 100,
  // então a média das 4 opções entre todas as respostas também soma 100.
  const pointsResponses = liveData.points || [];
  const pointsTotals = { A: 0, B: 0, C: 0, D: 0 };
  pointsResponses.forEach((p) => {
    ['A', 'B', 'C', 'D'].forEach((k) => { pointsTotals[k] += Number(p.allocation?.[k]) || 0; });
  });
  const pointsDivisor = pointsResponses.length || 1;
  const pointsRanked = ['A', 'B', 'C', 'D']
    .map((k) => ({ key: k, avg: pointsTotals[k] / pointsDivisor }))
    .sort((a, b) => b.avg - a.avg);
  const maxPointsAvg = pointsRanked[0]?.avg || 1;

  // Agrega a nuvem de palavras por frequência (case-insensitive) — sem isso,
  // 5 alunos respondendo "dor" viravam 5 pills iguais em vez de uma palavra
  // maior. Tamanho da fonte é proporcional à contagem, não fixo.
  const wordCounts = new Map();
  liveData.words.forEach((item) => {
    const key = item.word.trim().toLowerCase();
    if (!key) return;
    if (!wordCounts.has(key)) wordCounts.set(key, { word: item.word.trim(), count: 0 });
    wordCounts.get(key).count += 1;
  });
  // Cap nas 40 palavras mais frequentes — além disso o layout em espiral fica
  // lento pra achar espaço livre e a nuvem vira ruído visual ilegível.
  const wordEntries = [...wordCounts.values()].sort((a, b) => b.count - a.count).slice(0, 40);
  const WORD_CLOUD_AREA = { width: 360, height: 250, maxFontSize: 38 };
  const WORD_COLORS = ['#22d3ee', '#34d399', '#a78bfa', '#38bdf8', '#f472b6', '#fbbf24'];
  const wordLayout = useMemo(
    () => layoutWordCloud(wordEntries, WORD_CLOUD_AREA),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(wordEntries)]
  );

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

      {/* Ranking — fica visível o tempo todo que houver pontuação, independente do slide atual */}
      {leaderboard.length > 0 && (
        <div className="glass-panel" style={{ padding: '0.85rem 1rem', width: 'min(260px, calc(100% - 2rem))', background: 'rgba(15, 23, 42, 0.92)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.6rem' }}>
            <Trophy size={15} /> Ranking da Turma
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {leaderboard.slice(0, 5).map((entry, idx) => (
              <div key={entry.name + idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: idx < 3 ? '#fff' : '#9ca3af' }}>
                <span>{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`} {entry.name}</span>
                <span style={{ fontWeight: 700 }}>{entry.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Widget de Quiz ao Vivo */}
      {currentSlide?.type === 'quiz' && (
        <div className="glass-panel" style={{ padding: '1rem', width: 'min(320px, calc(100% - 2rem))', background: 'rgba(15, 23, 42, 0.92)' }}>
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
        <div className="glass-panel" style={{ padding: '1.1rem', width: 'min(410px, calc(100% - 2rem))', background: 'rgba(15, 23, 42, 0.92)' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
            <Cloud size={16} /> Nuvem de Palavras ({liveData.words.length})
          </div>

          <div style={{ position: 'relative', width: `${WORD_CLOUD_AREA.width}px`, height: `${WORD_CLOUD_AREA.height}px`, margin: '0 auto' }}>
            {wordLayout.map((entry, idx) => (
              <span
                key={entry.word}
                title={`${entry.count}x`}
                style={{
                  position: 'absolute',
                  left: `calc(50% + ${entry.x}px)`,
                  top: `calc(50% + ${entry.y}px)`,
                  fontSize: `${entry.fontSize}px`,
                  fontWeight: 800,
                  color: WORD_COLORS[idx % WORD_COLORS.length],
                  lineHeight: 1.15,
                  whiteSpace: 'nowrap'
                }}
              >
                {entry.word}
              </span>
            ))}
            {wordEntries.length === 0 && (
              <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', fontSize: '0.78rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
                Aguardando palavras enviadas pelos alunos...
              </span>
            )}
          </div>

          {wordEntries.length > 0 && (
            <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <button
                className="btn-icon"
                onClick={handleSummarize}
                disabled={summaryLoading}
                style={{ width: 'auto', padding: '0.35rem 0.7rem', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: '#67e8f9' }}
              >
                {summaryLoading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                Resumir com IA
              </button>
              {summary && (
                <p style={{ fontSize: '0.78rem', color: '#cbd5e1', marginTop: '0.5rem', lineHeight: 1.5 }}>{summary}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Widget de TBL/iRAT — Verificação de Prontidão Individual */}
      {currentSlide?.type === 'tbl' && (
        <div className="glass-panel" style={{ padding: '1rem', width: 'min(320px, calc(100% - 2rem))', background: 'rgba(15, 23, 42, 0.92)' }}>
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

      {/* Widget de Distribuição de 100 Pontos */}
      {currentSlide?.type === 'points' && (
        <div className="glass-panel" style={{ padding: '1rem', width: 'min(320px, calc(100% - 2rem))', background: 'rgba(15, 23, 42, 0.92)' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: currentSlide.pointsConfig?.question ? '0.25rem' : '0.75rem' }}>
            <PieChart size={16} /> Distribuição de Pontos ({pointsResponses.length})
          </div>
          {currentSlide.pointsConfig?.question && (
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.75rem' }}>{currentSlide.pointsConfig.question}</div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {pointsRanked.map(({ key, avg }) => {
              const pct = maxPointsAvg > 0 ? (avg / maxPointsAvg) * 100 : 0;
              return (
                <div key={key} style={{ fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#e5e7eb', fontWeight: 700, marginBottom: '0.2rem' }}>
                    <span>{currentSlide.pointsConfig?.labels?.[key] || `Opção ${key}`}</span>
                    <span>{Math.round(avg)} pts</span>
                  </div>
                  <div style={{ width: '100%', height: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #fbbf24, #f59e0b)', transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)' }} />
                  </div>
                </div>
              );
            })}
            {pointsResponses.length === 0 && (
              <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>Aguardando distribuições enviadas pelos alunos...</span>
            )}
          </div>
        </div>
      )}

      {/* Widget de Hotspot em Imagem */}
      {currentSlide?.type === 'hotspot' && currentSlide.hotspotConfig?.imageUrl && (
        <div className="glass-panel" style={{ padding: '1rem', width: 'min(320px, calc(100% - 2rem))', background: 'rgba(15, 23, 42, 0.92)' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#22d3ee', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
            <Target size={16} /> Hotspot ({liveData.hotspots.length})
            {liveData.hotspots.length > 0 && (
              <span style={{ marginLeft: 'auto', fontWeight: 700, color: '#34d399' }}>
                {Math.round((liveData.hotspots.filter((h) => h.correct).length / liveData.hotspots.length) * 100)}% certo
              </span>
            )}
          </div>

          <div style={{ position: 'relative', width: '100%', borderRadius: '0.5rem', overflow: 'hidden' }}>
            <img src={currentSlide.hotspotConfig.imageUrl} alt="Hotspot" style={{ width: '100%', display: 'block' }} />
            {/* Marca a zona certa — visível só pro apresentador, nunca vai pro aluno */}
            {currentSlide.hotspotConfig.x != null && (
              <div style={{
                position: 'absolute', left: `${currentSlide.hotspotConfig.x}%`, top: `${currentSlide.hotspotConfig.y}%`,
                transform: 'translate(-50%, -50%)', width: `${(currentSlide.hotspotConfig.radius ?? 10) * 2}%`, aspectRatio: '1',
                borderRadius: '50%', border: '2px dashed rgba(255,255,255,0.6)'
              }} />
            )}
            {liveData.hotspots.map((h, idx) => (
              <div
                key={idx}
                title={h.student}
                style={{
                  position: 'absolute', left: `${h.x}%`, top: `${h.y}%`, transform: 'translate(-50%, -50%)',
                  width: '10px', height: '10px', borderRadius: '50%',
                  background: h.correct ? '#34d399' : '#f87171', border: '2px solid #fff'
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Widget de Trilha de Decisão (Decision Tree) */}
      {currentSlide?.branches && currentSlide.branches.length > 0 && (
        <div className="glass-panel" style={{ padding: '1rem', width: 'min(340px, calc(100% - 2rem))', background: 'rgba(15, 23, 42, 0.95)', border: '1px solid #38bdf8' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
            <GitBranch size={16} /> Tomada de Decisão Médica / Clínica
          </div>
          <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: '0 0 0.75rem 0' }}>A turma vota no celular — clique na conduta pra revelar o resultado e navegar:</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {currentSlide.branches.map((b, idx) => {
              const voteCount = liveData.branchVotes.filter((v) => v.answer === idx).length;
              const totalVotes = liveData.branchVotes.length;
              const pct = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
              return (
                <button
                  key={idx}
                  className="btn-primary"
                  onClick={() => onNavigateBranch(b.targetSlideId)}
                  style={{
                    position: 'relative',
                    overflow: 'hidden',
                    background: idx === 0 ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #3b82f6, #2563eb)',
                    fontSize: '0.82rem',
                    justifyContent: 'space-between',
                    padding: '0.6rem 0.8rem'
                  }}
                >
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.18)', width: `${pct}%`, transition: 'width 0.3s ease' }} />
                  <span style={{ position: 'relative' }}>➔ {b.optionText}</span>
                  <span style={{ position: 'relative', fontSize: '0.75rem', fontWeight: 800, whiteSpace: 'nowrap', marginLeft: '0.5rem' }}>{voteCount} voto{voteCount === 1 ? '' : 's'}</span>
                </button>
              );
            })}
          </div>
          <p style={{ fontSize: '0.7rem', color: '#6b7280', margin: '0.6rem 0 0 0', textAlign: 'right' }}>
            {liveData.branchVotes.length} de {participantCount} aluno{participantCount === 1 ? '' : 's'} votaram
          </p>
        </div>
      )}
    </div>
  );
}
