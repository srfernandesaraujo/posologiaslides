import React, { useState, useEffect } from 'react';
import { Users, X, Plus, Trash2, ArrowLeft, Loader2, ClipboardPaste, Trophy } from 'lucide-react';
import { apiFetch } from '../lib/api';

function formatRelativeTime(timestamp) {
  if (!timestamp) return null;
  const diffSeconds = Math.round((Date.now() - timestamp) / 1000);
  if (diffSeconds < 60) return 'agora mesmo';
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `há ${diffMinutes} min`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `há ${diffHours}h`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `há ${diffDays} dia${diffDays > 1 ? 's' : ''}`;
  const diffMonths = Math.round(diffDays / 30);
  return `há ${diffMonths} mês${diffMonths > 1 ? 'es' : ''}`;
}

// Aceita qualquer formato razoável de lista colada (uma linha por aluno):
// "Nome, email", "email, Nome", "Nome<TAB>email" (colado de planilha) — em
// vez de exigir um formato rígido, extrai o e-mail via regex e usa o resto
// da linha como nome. Linha sem e-mail reconhecível é ignorada.
function parseStudentLines(text) {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return null;
      const emailMatch = trimmed.match(/[^\s,;]+@[^\s,;]+\.[^\s,;]+/);
      if (!emailMatch) return null;
      const email = emailMatch[0];
      const name = trimmed.replace(email, '').replace(/[,;\t]/g, ' ').trim() || email.split('@')[0];
      return { name, email };
    })
    .filter(Boolean);
}

export default function TurmasModal({ isOpen, onClose }) {
  const [turmas, setTurmas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedTurmaId, setSelectedTurmaId] = useState(null);
  const [newTurmaName, setNewTurmaName] = useState('');
  const [creating, setCreating] = useState(false);

  const loadTurmas = () => {
    setLoading(true);
    setError('');
    apiFetch('/api/turmas')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setTurmas(data.turmas);
        else setError(data.error || 'Falha ao carregar turmas.');
      })
      .catch(() => setError('Falha ao carregar turmas.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!isOpen) return;
    setSelectedTurmaId(null);
    loadTurmas();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreateTurma = async (e) => {
    e.preventDefault();
    if (!newTurmaName.trim()) return;
    setCreating(true);
    setError('');
    try {
      const res = await apiFetch('/api/turmas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTurmaName.trim() })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Falha ao criar turma.');
      setNewTurmaName('');
      loadTurmas();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteTurma = async (turma) => {
    if (!window.confirm(`Excluir a turma "${turma.name}"? Isso apaga a lista de alunos e o boletim acumulado dela — não dá pra desfazer.`)) return;
    try {
      await apiFetch(`/api/turmas/${turma.id}`, { method: 'DELETE' });
      loadTurmas();
    } catch {
      setError('Falha ao excluir a turma.');
    }
  };

  const selectedTurma = turmas.find((t) => t.id === selectedTurmaId) || null;

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '640px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {selectedTurma ? (
              <button className="btn-icon" onClick={() => setSelectedTurmaId(null)} title="Voltar">
                <ArrowLeft size={20} />
              </button>
            ) : (
              <div style={{ background: 'linear-gradient(135deg, #a855f7, #6366f1)', padding: '0.5rem', borderRadius: '0.5rem' }}>
                <Users size={24} color="#fff" />
              </div>
            )}
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>{selectedTurma ? selectedTurma.name : 'Turmas'}</h2>
              <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 0 }}>
                {selectedTurma
                  ? 'Alunos cadastrados e boletim acumulado desta turma'
                  : 'Listas de alunos reutilizáveis pra vincular a qualquer sessão ao vivo'}
              </p>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {error && (
          <div style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', borderRadius: '0.5rem', padding: '0.6rem 0.8rem', fontSize: '0.82rem', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#9ca3af', fontSize: '0.85rem' }}>
              <Loader2 size={16} className="animate-spin" /> Carregando...
            </div>
          )}

          {!loading && selectedTurma && (
            <TurmaDetail turma={selectedTurma} onError={setError} />
          )}

          {!loading && !selectedTurma && (
            <>
              <form onSubmit={handleCreateTurma} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
                <input
                  type="text"
                  className="chat-input"
                  style={{ flex: 1 }}
                  placeholder="Nome da turma (ex: Farmácia 2026.1 - Noturno)"
                  value={newTurmaName}
                  onChange={(e) => setNewTurmaName(e.target.value)}
                />
                <button className="btn-primary" type="submit" disabled={creating || !newTurmaName.trim()}>
                  {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Criar
                </button>
              </form>

              {turmas.length === 0 && (
                <div style={{ color: '#9ca3af', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>
                  Nenhuma turma cadastrada ainda.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {turmas.map((turma) => (
                  <div
                    key={turma.id}
                    className="glass-panel"
                    style={{ padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                    onClick={() => setSelectedTurmaId(turma.id)}
                  >
                    <div>
                      <div style={{ fontWeight: 700 }}>{turma.name}</div>
                      <div style={{ fontSize: '0.78rem', color: '#9ca3af' }}>{turma.studentCount} aluno{turma.studentCount !== 1 ? 's' : ''}</div>
                    </div>
                    <button
                      className="btn-icon"
                      onClick={(e) => { e.stopPropagation(); handleDeleteTurma(turma); }}
                      title="Excluir turma"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TurmaDetail({ turma, onError }) {
  const [tab, setTab] = useState('alunos'); // 'alunos' | 'boletim'
  const [students, setStudents] = useState([]);
  const [boletim, setBoletim] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pasteText, setPasteText] = useState('');
  const [adding, setAdding] = useState(false);

  const loadStudents = () => {
    apiFetch(`/api/turmas/${turma.id}/students`)
      .then((res) => res.json())
      .then((data) => { if (data.success) setStudents(data.students); })
      .catch(() => onError('Falha ao carregar alunos.'));
  };

  const loadBoletim = () => {
    apiFetch(`/api/turmas/${turma.id}/boletim`)
      .then((res) => res.json())
      .then((data) => { if (data.success) setBoletim(data.boletim); })
      .catch(() => onError('Falha ao carregar o boletim.'));
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch(`/api/turmas/${turma.id}/students`).then((r) => r.json()),
      apiFetch(`/api/turmas/${turma.id}/boletim`).then((r) => r.json())
    ])
      .then(([studentsData, boletimData]) => {
        if (studentsData.success) setStudents(studentsData.students);
        if (boletimData.success) setBoletim(boletimData.boletim);
      })
      .catch(() => onError('Falha ao carregar a turma.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turma.id]);

  const handleAddStudents = async () => {
    const parsed = parseStudentLines(pasteText);
    if (!parsed.length) {
      onError('Nenhum e-mail válido encontrado no texto colado.');
      return;
    }
    setAdding(true);
    try {
      const res = await apiFetch(`/api/turmas/${turma.id}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: parsed })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Falha ao cadastrar alunos.');
      setStudents(data.students);
      setPasteText('');
    } catch (err) {
      onError(err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveStudent = async (email) => {
    try {
      await apiFetch(`/api/turmas/${turma.id}/students/${encodeURIComponent(email)}`, { method: 'DELETE' });
      loadStudents();
    } catch {
      onError('Falha ao remover aluno.');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#9ca3af', fontSize: '0.85rem' }}>
        <Loader2 size={16} className="animate-spin" /> Carregando...
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-glass)' }}>
        <button
          className={tab === 'alunos' ? 'btn-primary' : 'btn-secondary'}
          style={{ borderRadius: '0.5rem 0.5rem 0 0' }}
          onClick={() => setTab('alunos')}
        >
          <Users size={15} /> Alunos ({students.length})
        </button>
        <button
          className={tab === 'boletim' ? 'btn-primary' : 'btn-secondary'}
          style={{ borderRadius: '0.5rem 0.5rem 0 0' }}
          onClick={() => { setTab('boletim'); loadBoletim(); }}
        >
          <Trophy size={15} /> Boletim
        </button>
      </div>

      {tab === 'alunos' && (
        <>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#e5e7eb', marginBottom: '0.4rem' }}>
              <ClipboardPaste size={14} /> Colar lista de alunos (uma linha por aluno: nome e e-mail)
            </label>
            <textarea
              className="chat-input"
              style={{ width: '100%', minHeight: '90px', fontFamily: 'monospace', fontSize: '0.8rem' }}
              placeholder={'Maria Silva, maria@email.com\nJoão Souza, joao@email.com'}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
            />
            <button className="btn-primary" style={{ marginTop: '0.5rem' }} onClick={handleAddStudents} disabled={adding || !pasteText.trim()}>
              {adding ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Cadastrar
            </button>
          </div>

          {students.length === 0 && (
            <div style={{ color: '#9ca3af', fontSize: '0.85rem', textAlign: 'center', padding: '1.5rem 0' }}>
              Nenhum aluno cadastrado ainda.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {students.map((s) => (
              <div key={s.email} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '0.4rem' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{s.name}</div>
                  <div style={{ fontSize: '0.76rem', color: '#9ca3af' }}>{s.email}</div>
                </div>
                <button className="btn-icon" onClick={() => handleRemoveStudent(s.email)} title="Remover aluno" style={{ width: '28px', height: '28px' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'boletim' && (
        <>
          {boletim.length === 0 && (
            <div style={{ color: '#9ca3af', fontSize: '0.85rem', textAlign: 'center', padding: '1.5rem 0' }}>
              Nenhuma sessão ao vivo vinculada a esta turma ainda foi encerrada.
            </div>
          )}
          {boletim.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#9ca3af', borderBottom: '1px solid var(--border-glass)' }}>
                  <th style={{ padding: '0.4rem 0.5rem' }}>Aluno</th>
                  <th style={{ padding: '0.4rem 0.5rem' }}>Acerto</th>
                  <th style={{ padding: '0.4rem 0.5rem' }}>Sessões</th>
                  <th style={{ padding: '0.4rem 0.5rem' }}>Última</th>
                </tr>
              </thead>
              <tbody>
                {boletim.map((s) => (
                  <tr key={s.email} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '0.5rem' }}>
                      <div style={{ fontWeight: 600 }}>{s.name}</div>
                      <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{s.email}</div>
                    </td>
                    <td style={{ padding: '0.5rem', fontWeight: 700, color: s.accuracyPct >= 70 ? '#4ade80' : s.accuracyPct >= 50 ? '#fbbf24' : '#f87171' }}>
                      {s.accuracyPct !== null ? `${s.accuracyPct}%` : '—'}
                    </td>
                    <td style={{ padding: '0.5rem' }}>{s.sessionsCount || 0}</td>
                    <td style={{ padding: '0.5rem', color: '#9ca3af' }}>{formatRelativeTime(s.lastSessionAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
