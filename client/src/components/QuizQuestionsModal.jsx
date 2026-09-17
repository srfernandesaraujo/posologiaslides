import React, { useState, useEffect } from 'react';
import { HelpCircle, X, Plus, Check } from 'lucide-react';
import { uniqueId } from '../lib/slideHtmlUtils';

const LETTERS = ['A', 'B', 'C', 'D'];

function buildBlankQuestion(topic) {
  return { id: uniqueId('quizq'), question: '', optionA: '', optionB: '', optionC: '', optionD: '', correctAnswer: '', topic: topic || '' };
}

// Edição das perguntas de um Quiz ao Vivo — substitui a edição direta no
// canvas (v1): a pergunta/alternativas viram dado puro em slide.quizQuestions,
// nunca texto no HTML do slide, então nada aqui grava até "Concluir" (rascunho
// local, mesmo espírito de SlideBrandingModal). Aberto clicando no ícone "?"
// do slide (ver PresentationEditor.jsx/PresentationViewer.jsx) ou no botão
// "Editar perguntas" da barra de ferramentas.
export default function QuizQuestionsModal({ isOpen, questions, existingTopics = [], onClose, onSave }) {
  const [draft, setDraft] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setDraft(questions?.length ? questions.map((q) => ({ ...q })) : [buildBlankQuestion()]);
      setActiveIdx(0);
    }
  }, [isOpen, questions]);

  if (!isOpen) return null;

  const active = draft[activeIdx] || draft[0];

  const updateActive = (patch) => {
    setDraft((prev) => prev.map((q, i) => (i === activeIdx ? { ...q, ...patch } : q)));
  };

  const handleAddQuestion = () => {
    const next = [...draft, buildBlankQuestion(active?.topic)];
    setDraft(next);
    setActiveIdx(next.length - 1);
  };

  const handleDeleteQuestion = (idx) => {
    if (draft.length <= 1) return;
    const next = draft.filter((_, i) => i !== idx);
    setDraft(next);
    setActiveIdx((prev) => Math.min(idx < prev ? prev - 1 : prev, next.length - 1));
  };

  const handleConclude = () => {
    onSave(draft);
    onClose();
  };

  const activeOptions = LETTERS.filter((l) => (active?.[`option${l}`] || '').trim());

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        style={{ maxWidth: '640px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'linear-gradient(135deg, #22d3ee, #3b82f6)', padding: '0.55rem', borderRadius: '0.6rem' }}>
              <HelpCircle size={22} color="#071019" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>Perguntas do Quiz ao Vivo</h2>
              <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>
                Cadastre uma ou mais perguntas — durante a apresentação você libera uma de cada vez.
              </p>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose} title="Fechar sem salvar">
            <X size={20} />
          </button>
        </div>

        {/* Abas de pergunta */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem' }}>
          {draft.map((q, idx) => (
            <div key={q.id} style={{ display: 'flex', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setActiveIdx(idx)}
                style={{
                  padding: '0.3rem 0.7rem',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  borderRadius: draft.length > 1 ? '0.4rem 0 0 0.4rem' : '0.4rem',
                  border: 'none',
                  cursor: 'pointer',
                  background: idx === activeIdx ? 'var(--accent-primary)' : 'rgba(255,255,255,0.08)',
                  color: idx === activeIdx ? '#071019' : '#e2e8f0'
                }}
              >
                Pergunta {idx + 1}
              </button>
              {draft.length > 1 && (
                <button
                  type="button"
                  className="btn-icon"
                  title="Apagar esta pergunta"
                  onClick={() => handleDeleteQuestion(idx)}
                  style={{ width: '26px', height: '26px', borderRadius: '0 0.4rem 0.4rem 0', borderLeft: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="btn-secondary"
            onClick={handleAddQuestion}
            style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <Plus size={13} /> Nova pergunta
          </button>
        </div>

        {/* Formulário da pergunta ativa */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', marginBottom: '1.2rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.35rem' }}>Pergunta</label>
            <textarea
              className="chat-input"
              rows={2}
              style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}
              placeholder="Digite a pergunta aqui"
              value={active?.question || ''}
              onChange={(e) => updateActive({ question: e.target.value })}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem' }}>
            {LETTERS.map((letter) => (
              <div key={letter}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#9ca3af', marginBottom: '0.3rem' }}>Alternativa {letter}</label>
                <input
                  type="text"
                  className="chat-input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  placeholder={`Alternativa ${letter}`}
                  value={active?.[`option${letter}`] || ''}
                  onChange={(e) => updateActive({ [`option${letter}`]: e.target.value })}
                />
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Resposta certa (opcional, ativa pontuação):</span>
            {(activeOptions.length ? activeOptions : LETTERS).map((opt) => (
              <button
                key={opt}
                type="button"
                className="btn-icon"
                onClick={() => updateActive({ correctAnswer: active?.correctAnswer === opt ? '' : opt })}
                style={{
                  width: '32px',
                  height: '32px',
                  background: active?.correctAnswer === opt ? 'var(--accent-primary)' : undefined,
                  color: active?.correctAnswer === opt ? '#071019' : undefined
                }}
              >
                {opt}
              </button>
            ))}
            <input
              type="text"
              list="quiz-modal-topic-options"
              className="chat-input"
              placeholder="Assunto (ex: Farmacocinética)"
              value={active?.topic || ''}
              onChange={(e) => updateActive({ topic: e.target.value })}
              title="Agrupa esta pergunta no relatório final de desempenho por assunto"
              style={{ flex: '0 1 220px', marginLeft: 'auto', boxSizing: 'border-box' }}
            />
            <datalist id="quiz-modal-topic-options">
              {[...new Set(existingTopics.filter(Boolean))].map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', paddingTop: '0.8rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button type="button" className="btn-secondary" onClick={onClose} style={{ fontSize: '0.82rem', padding: '0.5rem 1rem' }}>
            Cancelar
          </button>
          <button type="button" className="btn-primary" onClick={handleConclude} style={{ fontSize: '0.82rem', padding: '0.5rem 1.2rem', gap: '0.4rem' }}>
            <Check size={16} /> Concluir
          </button>
        </div>
      </div>
    </div>
  );
}
