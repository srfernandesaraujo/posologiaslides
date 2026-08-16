import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../lib/api';
import { Smartphone, Send, CheckCircle2, Sparkles, Users, Clock } from 'lucide-react';

const POINTS_TOTAL = 100;
const POINTS_KEYS = ['A', 'B', 'C', 'D'];
const POINTS_COLORS = ['#ef4444', '#3b82f6', '#f59e0b', '#10b981'];

// Só as alternativas com rótulo preenchido pelo professor entram na
// distribuição de pontos — a que ficar em branco no editor não aparece pro
// aluno votar (ver pointsConfig?.labels em PresentationEditor.jsx). Sem
// nenhum rótulo preenchido (pointsConfig ainda não customizado), volta a
// mostrar as 4 opções genéricas de sempre.
function getActivePointsKeys(pointsConfig) {
  const active = POINTS_KEYS.filter((k) => (pointsConfig?.labels?.[k] || '').trim());
  return active.length ? active : POINTS_KEYS;
}

// Aloca 100 pontos igualmente só entre as alternativas ativas (a última
// absorve a sobra do arredondamento) — chamada toda vez que o slide muda.
function buildEvenSplit(pointsConfig) {
  const keys = getActivePointsKeys(pointsConfig);
  const base = Math.floor(POINTS_TOTAL / keys.length);
  const allocation = {};
  keys.forEach((k, idx) => {
    allocation[k] = idx === keys.length - 1 ? POINTS_TOTAL - base * (keys.length - 1) : base;
  });
  return allocation;
}

// Move o slider de `key` pra `nextValue` e tira/devolve a diferença das
// outras alternativas ATIVAS (as chaves presentes em `allocation` — ver
// buildEvenSplit), proporcionalmente ao que cada uma já tinha — assim a
// soma delas nunca sai de 100 e o aluno não precisa acertar as contas na mão.
function rebalancePoints(allocation, key, nextValue) {
  const keys = Object.keys(allocation);
  const clamped = Math.max(0, Math.min(POINTS_TOTAL, Math.round(nextValue)));
  const others = keys.filter((k) => k !== key);

  // Única alternativa ativa: não tem de onde tirar/devolver pontos, fica sempre com os 100.
  if (others.length === 0) return { ...allocation, [key]: POINTS_TOTAL };

  const delta = clamped - allocation[key];
  const othersTotal = others.reduce((sum, k) => sum + allocation[k], 0);

  if (delta === 0) return allocation;

  const next = { ...allocation, [key]: clamped };

  if (delta > 0) {
    // Precisa "roubar" `delta` pontos das outras — se elas não têm o
    // suficiente, o slider nem chega a subir tanto quanto o aluno pediu.
    const actualDelta = Math.min(delta, othersTotal);
    next[key] = allocation[key] + actualDelta;
    let remaining = actualDelta;
    others.forEach((k, idx) => {
      const isLast = idx === others.length - 1;
      const share = othersTotal > 0 ? allocation[k] / othersTotal : 1 / others.length;
      const cut = isLast ? remaining : Math.min(allocation[k], Math.round(actualDelta * share));
      next[k] = allocation[k] - cut;
      remaining -= cut;
    });
  } else {
    // Devolve `-delta` pontos pras outras, proporcionalmente ao que já tinham
    // (se todas estiverem em 0, divide igualmente pra não ficar tudo numa só).
    const give = -delta;
    let remaining = give;
    others.forEach((k, idx) => {
      const isLast = idx === others.length - 1;
      const share = othersTotal > 0 ? allocation[k] / othersTotal : 1 / others.length;
      const add = isLast ? remaining : Math.round(give * share);
      next[k] = allocation[k] + add;
      remaining -= add;
    });
  }

  // Corrige deriva de arredondamento pra soma nunca fugir de 100 — ajusta no
  // próprio slider que o aluno acabou de mexer, é o menos surpreendente.
  const sum = keys.reduce((s, k) => s + next[k], 0);
  next[key] += POINTS_TOTAL - sum;

  return next;
}

export default function StudentJoin() {
  const [socket, setSocket] = useState(null);
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [joined, setJoined] = useState(false);
  const [sessionTitle, setSessionTitle] = useState('');
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [slideType, setSlideType] = useState(null);
  const [hotspotImageUrl, setHotspotImageUrl] = useState(null);
  const [pointsConfig, setPointsConfig] = useState(null);
  const [wordcloudConfig, setWordcloudConfig] = useState(null);
  const [branches, setBranches] = useState(null);
  const [quizOptions, setQuizOptions] = useState(null);
  const [scoreFeedback, setScoreFeedback] = useState(null);

  // Estados de resposta do aluno
  const [quizChoice, setQuizChoice] = useState('');
  const [wordInput, setWordInput] = useState('');
  const [pointsAllocation, setPointsAllocation] = useState(() => buildEvenSplit(null));
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    // Tenta obter PIN da URL caso o aluno tenha escaneado o QR Code
    const params = new URLSearchParams(window.location.search);
    const pinParam = params.get('pin');
    if (pinParam) setPin(pinParam);

    const newSocket = io(API_URL || window.location.origin);
    setSocket(newSocket);

    newSocket.on('joined_successfully', ({ title, currentSlideIndex, slideType, hotspotImageUrl, pointsConfig, wordcloudConfig, branches, quizOptions }) => {
      setJoined(true);
      setSessionTitle(title);
      setCurrentSlideIndex(currentSlideIndex);
      setSlideType(slideType || null);
      setHotspotImageUrl(hotspotImageUrl || null);
      setPointsConfig(pointsConfig || null);
      setWordcloudConfig(wordcloudConfig || null);
      setBranches(branches || null);
      setQuizOptions(quizOptions || null);
      setPointsAllocation(buildEvenSplit(pointsConfig));
    });

    newSocket.on('sync_slide', ({ currentSlideIndex, slideType, hotspotImageUrl, pointsConfig, wordcloudConfig, branches, quizOptions }) => {
      setCurrentSlideIndex(currentSlideIndex);
      setSlideType(slideType || null);
      setHotspotImageUrl(hotspotImageUrl || null);
      setPointsConfig(pointsConfig || null);
      setWordcloudConfig(wordcloudConfig || null);
      setBranches(branches || null);
      setQuizOptions(quizOptions || null);
      setSubmitted(false); // Reseta estado de envio para o novo slide
      setScoreFeedback(null);
      setPointsAllocation(buildEvenSplit(pointsConfig));
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

  const handlePointsSlide = (key, value) => {
    setPointsAllocation((prev) => rebalancePoints(prev, key, Number(value)));
  };

  const handleSendPoints = () => {
    setSubmitted(true);
    if (socket) {
      socket.emit('submit_response', {
        pin,
        slideIndex: currentSlideIndex,
        responseType: 'points',
        answer: pointsAllocation
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
        ) : slideType === 'points' ? (
          <div style={{ width: '100%', maxWidth: '420px' }}>
            <h4 style={{ textAlign: 'center', fontSize: '1.1rem', color: '#9ca3af', marginBottom: '0.3rem' }}>
              {pointsConfig?.question || 'Distribua 100 pontos entre as opções:'}
            </h4>
            <p style={{ textAlign: 'center', fontSize: '0.8rem', color: '#6b7280', marginBottom: '1.25rem' }}>
              Arraste um slider — os outros se ajustam sozinhos pra soma sempre dar 100.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              {Object.keys(pointsAllocation).map((key) => (
                <div key={key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: POINTS_COLORS[POINTS_KEYS.indexOf(key)] }}>{pointsConfig?.labels?.[key] || `Opção ${key}`}</span>
                    <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>{pointsAllocation[key]}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={POINTS_TOTAL}
                    value={pointsAllocation[key]}
                    onChange={(e) => handlePointsSlide(key, e.target.value)}
                    style={{ width: '100%', accentColor: POINTS_COLORS[POINTS_KEYS.indexOf(key)] }}
                  />
                </div>
              ))}
            </div>
            <button
              onClick={handleSendPoints}
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '0.8rem', fontSize: '1rem', marginTop: '1.5rem' }}
            >
              <Send size={18} /> Enviar Distribuição
            </button>
          </div>
        ) : slideType === 'wordcloud' ? (
          // Slide de Nuvem de Palavras — só o campo de texto. Antes este
          // branch era compartilhado com quiz/tbl e sempre desenhava as 4
          // alternativas A/B/C/D junto, mesmo quando o slide do professor não
          // tinha quiz nenhum, confundindo o aluno.
          <div style={{ width: '100%', maxWidth: '400px' }}>
            <form onSubmit={handleSendWord} style={{ background: 'rgba(255,255,255,0.03)', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p style={{ textAlign: 'center', fontSize: '1.1rem', color: '#f1f5f9', fontWeight: 700, margin: '0 0 1rem' }}>
                {wordcloudConfig?.question || 'Envie uma palavra para a Nuvem de Palavras:'}
              </p>
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
        ) : (slideType === 'quiz' || slideType === 'tbl') ? (
          <div style={{ width: '100%', maxWidth: '400px' }}>
            <h4 style={{ textAlign: 'center', fontSize: '1.1rem', color: '#9ca3af', marginBottom: '1.5rem' }}>
              {slideType === 'tbl'
                ? 'Verificação Individual (iRAT) — selecione sua resposta:'
                : `Slide #${currentSlideIndex + 1} - Selecione sua resposta:`}
            </h4>

            {/* Alternativas de Quiz — só as letras que o professor de fato
                preencheu no slide (ver quizOptions); "tbl" (iRAT) não tem
                esse filtro, sempre mostra as 4. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {(slideType === 'tbl' ? ['A', 'B', 'C', 'D'] : (quizOptions?.length ? quizOptions : ['A', 'B', 'C', 'D'])).map((opt) => {
                const colors = ['#ef4444', '#3b82f6', '#f59e0b', '#10b981'];
                const idx = ['A', 'B', 'C', 'D'].indexOf(opt);
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
          </div>
        ) : (
          // Slide sem NENHUMA interatividade escolhida pelo professor (dropdown
          // "Sem interatividade" em PresentationEditor.jsx) — antes isto caía no
          // mesmo branch de cima e mostrava quiz A/B/C/D + nuvem de palavras à
          // toa, como se qualquer slide aceitasse resposta. Estado neutro: nada
          // pra responder até o professor ativar uma interação de verdade.
          <div style={{ textAlign: 'center', color: '#6b7280' }}>
            <Clock size={40} style={{ margin: '0 auto 1rem auto', opacity: 0.6 }} />
            <p style={{ fontSize: '0.95rem' }}>Este slide não tem nenhuma interação ativa no momento.</p>
            <p style={{ fontSize: '0.8rem', marginTop: '0.4rem' }}>Aguarde o professor avançar para um slide com quiz, enquete ou outra atividade.</p>
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#6b7280' }}>
        Posologia Slides
      </div>
    </div>
  );
}
