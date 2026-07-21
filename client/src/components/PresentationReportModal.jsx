import React, { useState, useEffect } from 'react';
import { BarChart3, Clock, Users, MessageSquare, X, Loader2 } from 'lucide-react';
import { apiFetch } from '../lib/api';

function formatDuration(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m ${s}s`;
}

export default function PresentationReportModal({ isOpen, onClose, presentationTitle, pin, slides = [] }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen || !pin) return;

    setLoading(true);
    setError(null);
    apiFetch(`/api/sessions/${pin}/report`)
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
  }, [isOpen, pin]);

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

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#a855f7', padding: '2rem', justifyContent: 'center' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
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
                  <Users size={14} color="#a855f7" /> Participantes Conectados
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#c084fc', marginTop: '0.4rem' }}>
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

            {/* Tabela de Detalhamento por Slide */}
            <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: '1.5rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
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
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button className="btn-icon" onClick={onClose} style={{ width: 'auto', padding: '0 1rem' }}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
