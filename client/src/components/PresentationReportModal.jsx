import React, { useState, useEffect } from 'react';
import { BarChart3, Clock, Users, MessageSquare, X, Loader2, Trophy, Sparkles, History } from 'lucide-react';
import { apiFetch } from '../lib/api';

function formatDuration(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m ${s}s`;
}

// `finalize` = true → chama POST /:pin/end (calcula ranking + desempenho por
// assunto, gera insight com IA e persiste no Firestore, ver sessionsRoutes.js)
// — usado quando o apresentador chega no slide de encerramento com uma
// sessão ao vivo ativa. `finalize` = false mantém o comportamento original:
// GET /:pin/report, o relatório básico ao vivo (dwell time etc.), sem
// persistir nada — usado quando o professor abre o relatório manualmente no
// meio da aula, antes de a sessão ter terminado.
export default function PresentationReportModal({ isOpen, onClose, presentationTitle, presentationId, pin, slides = [], finalize = false }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pastReports, setPastReports] = useState([]);

  useEffect(() => {
    if (!isOpen || !pin) return;

    setLoading(true);
    setError(null);
    const request = finalize
      ? apiFetch(`/api/sessions/${pin}/end`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      : apiFetch(`/api/sessions/${pin}/report`);

    request
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setReport(data.report);
        } else {
          setError(data.error || 'Não foi possível carregar o relatório.');
        }
      })
      .catch(() => setError('Não foi possível carregar o relatório.'))
      .finally(() => setLoading(false));
  }, [isOpen, pin, finalize]);

  // Sessões anteriores já encerradas desta apresentação (persistidas no
  // Firestore por POST /:pin/end) — só busca quando o modal tem pra onde
  // reabrir (precisa do id da apresentação).
  useEffect(() => {
    if (!isOpen || !presentationId) return;
    apiFetch(`/api/presentations/${presentationId}/sessionReports`)
      .then((res) => res.json())
      .then((data) => setPastReports(data.success ? data.reports : []))
      .catch(() => setPastReports([]));
  }, [isOpen, presentationId]);

  const openPastReport = (reportId) => {
    setLoading(true);
    setError(null);
    apiFetch(`/api/presentations/${presentationId}/sessionReports/${reportId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setReport(data.report);
        else setError(data.error || 'Não foi possível carregar o relatório.');
      })
      .catch(() => setError('Não foi possível carregar o relatório.'))
      .finally(() => setLoading(false));
  };

  if (!isOpen) return null;

  const slideTitle = (slideIndex) => slides[slideIndex]?.title || `Slide #${slideIndex + 1}`;

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '720px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'linear-gradient(135deg, #10b981, #3b82f6)', padding: '0.5rem', borderRadius: '0.5rem' }}>
              <BarChart3 size={24} color="#fff" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Relatório da Sessão Ao Vivo</h2>
              <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 0 }}>Apresentação: "{presentationTitle}"</p>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {pastReports.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', fontSize: '0.8rem', color: '#9ca3af' }}>
            <History size={15} />
            Sessões anteriores:
            <select
              className="chat-input"
              defaultValue=""
              onChange={(e) => e.target.value && openPastReport(e.target.value)}
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem' }}
            >
              <option value="">Sessão atual</option>
              {pastReports.map((r) => (
                <option key={r.id} value={r.id}>
                  {new Date(r.startTime).toLocaleString('pt-BR')}
                </option>
              ))}
            </select>
          </div>
        )}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)', padding: '2rem', justifyContent: 'center' }}>
            <Loader2 className="animate-spin" size={18} /> Carregando dados reais da sessão...
          </div>
        )}

        {!loading && error && (
          <div style={{ color: '#f87171', padding: '1.5rem', textAlign: 'center', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        {!loading && !error && report && (
          <>
            {/* Métricas Principais (Cards) — todas calculadas a partir de dados reais da sessão */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Clock size={14} color="#38bdf8" /> Duração da Sessão
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#38bdf8', marginTop: '0.4rem' }}>
                  {formatDuration(report.durationSeconds)}
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Users size={14} color="var(--accent-primary)" /> Participantes Conectados
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#67e8f9', marginTop: '0.4rem' }}>
                  {report.totalParticipants}
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <MessageSquare size={14} color="#10b981" /> Respostas Recebidas
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#34d399', marginTop: '0.4rem' }}>
                  {report.totalResponses}
                </div>
              </div>
            </div>

            {/* Desempenho por Assunto + Ranking + Insight de IA — só existem
                quando o relatório veio de POST /:pin/end (ver `finalize`
                acima) ou foi reaberto do histórico, nunca do GET /:pin/report
                básico usado no meio da aula. */}
            {report.perTopic && (
              <>
                {report.overallAccuracyPct !== null && report.overallAccuracyPct !== undefined && (
                  <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.08)', padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
                      <BarChart3 size={14} color="#a78bfa" /> Desempenho por Assunto ({report.overallAccuracyPct}% de acerto geral)
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      {report.perTopic.map((t) => (
                        <div key={t.topic}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#e5e7eb' }}>
                            <span>{t.topic}</span>
                            <span style={{ fontWeight: 700, color: t.accuracyPct < 60 ? '#f87171' : '#34d399' }}>
                              {t.accuracyPct}% ({t.correctAnswers}/{t.totalAnswers})
                            </span>
                          </div>
                          <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', marginTop: '0.25rem' }}>
                            <div style={{ height: '100%', width: `${t.accuracyPct}%`, borderRadius: '3px', background: t.accuracyPct < 60 ? '#f87171' : '#34d399' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {report.insight && (
                  <div style={{ background: 'rgba(167, 139, 250, 0.08)', border: '1px solid rgba(167, 139, 250, 0.25)', borderRadius: '0.75rem', padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
                    <div style={{ fontSize: '0.75rem', color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', fontWeight: 700 }}>
                      <Sparkles size={14} /> Sugestão gerada por IA
                    </div>
                    <p style={{ fontSize: '0.85rem', color: '#e5e7eb', margin: 0, lineHeight: 1.5 }}>{report.insight}</p>
                  </div>
                )}

                {report.ranking?.length > 0 && (
                  <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: '1.5rem' }}>
                    <div style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '0.4rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <Trophy size={14} color="#fbbf24" /> Ranking Final
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {report.ranking.slice(0, 10).map((r) => (
                        <div key={r.name + r.position} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 1rem', fontSize: '0.85rem', color: r.position <= 3 ? '#fff' : '#9ca3af', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <span>{r.position === 1 ? '🥇' : r.position === 2 ? '🥈' : r.position === 3 ? '🥉' : `${r.position}.`} {r.name}</span>
                          <span style={{ fontWeight: 700 }}>{r.score}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Tabela de Detalhamento por Slide */}
            <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: '1.5rem' }}>
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '480px', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.05)', color: '#9ca3af', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Slide</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Tempo de Permanência</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Respostas de Alunos</th>
                  </tr>
                </thead>
                <tbody>
                  {report.perSlide.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ padding: '1rem', textAlign: 'center', color: '#6b7280' }}>
                        Nenhuma interação registrada ainda nesta sessão.
                      </td>
                    </tr>
                  )}
                  {report.perSlide.map((row) => (
                    <tr key={row.slideIndex} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#e5e7eb' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>#{row.slideIndex + 1} - {slideTitle(row.slideIndex)}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#38bdf8' }}>{formatDuration(row.dwellSeconds)}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>{row.responseCount} respostas</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button className="btn-secondary" onClick={onClose} style={{ padding: '0.6rem 1.2rem' }}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
