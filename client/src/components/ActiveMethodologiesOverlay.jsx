import React, { useState, useEffect, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Users, Cloud, GitBranch, Trophy, CheckCircle, ShieldAlert, ClipboardCheck, Target, Sparkles, Loader2, PieChart, Maximize2, Minimize2, HelpCircle, ArrowRight, ArrowLeft, X, Eye } from 'lucide-react';
import { layoutWordCloud } from '../lib/wordCloudLayout';
import { apiFetch } from '../lib/api';

// Fator do `transform: scale(...)` aplicado a TODOS os widgets no modo
// ampliado (ver `expanded` mais abaixo) — extraído pra constante porque a
// nuvem de palavras precisa cancelá-lo localmente (ver EXPANDED_WORD_CLOUD_AREA).
const EXPANDED_SCALE = 1.7;

// Letras (A-D) das alternativas que o professor de fato preencheu nesta
// pergunta (mesma lógica de getActiveQuizOptionsFromQuestion em
// PresentationEditor.jsx — duplicada aqui de propósito, é só isto, não vale
// acoplar os dois arquivos por uma função de 2 linhas).
function getActiveQuizOptionsFromQuestion(q) {
  const letters = ['A', 'B', 'C', 'D'].filter((l) => (q?.[`option${l}`] || '').trim());
  return letters.length ? letters : ['A', 'B', 'C', 'D'];
}

export default function ActiveMethodologiesOverlay({
  socket,
  pin,
  // Turma vinculada a esta sessão (ver PresentationEditor.jsx/TurmasModal.jsx)
  // — '' = sem turma (comportamento de sempre, aluno só digita nome). Com
  // turma escolhida, o aluno precisa entrar com um e-mail cadastrado nela
  // (ver join_session em sessionSocket.js) e o resultado passa a contar pro
  // boletim acumulado dela.
  turmas = [],
  selectedTurmaId = '',
  onSelectTurma = null,
  currentSlide,
  slideIndex,
  onNavigateBranch,
  expanded = false,
  onToggleExpand,
  isFullscreen = false,
  // Quiz ao Vivo (ver PresentationEditor.jsx): quizQuestions é o array
  // completo (pergunta ativa + total), activeQuizQuestionIndex é a que está
  // no ar AGORA, onActivateQuizQuestion(idx) libera outra pro celular dos
  // alunos sem navegar de slide. quizRevealed/onCloseQuizReveal controlam se
  // este painel aparece — ligado/desligado pelo clique no ícone "?" do
  // próprio slide (ver applyQuizBadgeToSlideHtml em slideHtmlUtils.js).
  quizQuestions = [],
  activeQuizQuestionIndex = 0,
  onActivateQuizQuestion = null,
  quizRevealed = false,
  onCloseQuizReveal = null
}) {
  const [liveData, setLiveData] = useState({ answers: [], words: [], irat: [], hotspots: [], branchVotes: [], points: [] });
  const [participantCount, setParticipantCount] = useState(0);
  const [leaderboard, setLeaderboard] = useState([]);
  const [topicProgress, setTopicProgress] = useState([]);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  // Ranking + Acerto por Assunto ficam sempre visíveis por padrão, mas às
  // vezes cobrem conteúdo do próprio slide (ver rankingGroupPanel mais
  // abaixo) — o professor pode fechar e reabrir quando precisar, igual ao
  // "?" do quiz, só que aqui o controle é um ícone que substitui o próprio
  // painel no lugar dele, não algo fora da tela.
  const [rankingHidden, setRankingHidden] = useState(false);
  // Perguntas do quiz cujo resultado já foi liberado pro telão (ver botão
  // "Liberar resultado" mais abaixo) — por índice, não um boolean único,
  // pra "Voltar" numa pergunta anterior já liberada continuar mostrando o
  // resultado dela em vez de escondê-lo de novo.
  const [revealedQuestions, setRevealedQuestions] = useState(() => new Set());

  useEffect(() => {
    if (!socket) return;

    const handleUpdate = ({ slideIndex: updatedSlideIndex, questionIndex, responses, totalParticipants }) => {
      // Um quiz com várias perguntas sequenciais reaproveita o MESMO
      // slideIndex pra todas elas (ver responseKey em sessionSocket.js) —
      // sem também comparar questionIndex, a resposta da pergunta 2
      // aparecia misturada/sobrepondo o painel da pergunta 1 ainda em tela.
      if (updatedSlideIndex === slideIndex && (questionIndex || 0) === (activeQuizQuestionIndex || 0)) {
        setLiveData(responses || { answers: [], words: [], irat: [], hotspots: [], branchVotes: [], points: [] });
      }
      setParticipantCount(totalParticipants || 0);
    };

    const handleJoined = ({ count }) => setParticipantCount(count);
    const handleLeft = ({ count }) => setParticipantCount(count);
    const handleLeaderboard = ({ leaderboard: board }) => setLeaderboard(board || []);
    // Acerto por assunto recalculado a cada resposta pontuável (ver
    // sessionSocket.js) — só um indicador ao vivo; o relatório completo por
    // assunto (com insight de IA) aparece no encerramento, ver PresentationReportModal.
    const handleTopicProgress = ({ perTopic }) => setTopicProgress(perTopic || []);

    socket.on('live_results_update', handleUpdate);
    socket.on('participant_joined', handleJoined);
    socket.on('participant_left', handleLeft);
    socket.on('leaderboard_update', handleLeaderboard);
    socket.on('topic_progress_update', handleTopicProgress);

    return () => {
      socket.off('live_results_update', handleUpdate);
      socket.off('participant_joined', handleJoined);
      socket.off('participant_left', handleLeft);
      socket.off('leaderboard_update', handleLeaderboard);
      socket.off('topic_progress_update', handleTopicProgress);
    };
  }, [socket, slideIndex, activeQuizQuestionIndex]);

  // Reseta o resumo de IA e os dados ao vivo ao trocar de slide — sem isto, o
  // painel continuava mostrando as respostas do slide ANTERIOR (ex.: duas
  // nuvens de palavras em slides diferentes: a segunda herdava visualmente
  // as palavras da primeira até o primeiro aluno responder nela, porque
  // `handleUpdate` só atualiza `liveData` quando chega um evento cujo
  // `slideIndex` bate com o slide atual — navegar sozinho não dispara nada).
  useEffect(() => {
    setSummary(null);
    setLiveData({ answers: [], words: [], irat: [], hotspots: [], branchVotes: [], points: [] });
  }, [slideIndex, activeQuizQuestionIndex]);

  // Reseta quais perguntas já tiveram resultado liberado só quando o
  // professor sai do slide de quiz e volta (nova rodada) — trocar de
  // pergunta DENTRO do mesmo slide (Voltar/Liberar próxima) não deve
  // escurecer de novo um resultado que já foi liberado.
  useEffect(() => {
    setRevealedQuestions(new Set());
  }, [slideIndex]);

  const handleRevealResult = () => {
    setRevealedQuestions((prev) => {
      const next = new Set(prev);
      next.add(activeQuizQuestionIndex || 0);
      return next;
    });
  };

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
  // Só mostra a barra de opções com rótulo preenchido pelo professor (ver
  // pointsConfig?.labels) — sem nenhum rótulo customizado, volta a mostrar
  // as 4 genéricas de sempre.
  const activePointsKeys = ['A', 'B', 'C', 'D'].filter((k) => (currentSlide?.pointsConfig?.labels?.[k] || '').trim());
  const pointsKeysToShow = activePointsKeys.length ? activePointsKeys : ['A', 'B', 'C', 'D'];
  const pointsRanked = pointsKeysToShow
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
  // No modo ampliado, o painel ainda mora dentro do wrapper com
  // `transform: scale(EXPANDED_SCALE)` (ver `expanded` mais abaixo), mas o
  // PRÓPRIO painel da nuvem aplica um contra-scale (1/EXPANDED_SCALE) pra
  // anular esse zoom e recalcular o layout numa área real maior — só dar
  // scale visual na área pequena (360x250) deixava tudo proporcionalmente
  // maior mas com os MESMOS vãos vazios entre as palavras; recalculando de
  // verdade numa área maior, o empacotamento em espiral tem mais espaço pra
  // preencher e a fonte cresce mais que um simples 1.7x linear.
  const WORD_CLOUD_AREA = expanded
    ? { width: 620, height: 420, maxFontSize: 72, minFontSize: 14 }
    : { width: 360, height: 250, maxFontSize: 38 };
  const WORD_COLORS = ['#22d3ee', '#34d399', '#a78bfa', '#38bdf8', '#f472b6', '#fbbf24'];
  const wordLayout = useMemo(
    () => layoutWordCloud(wordEntries, WORD_CLOUD_AREA),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(wordEntries), expanded]
  );

  // Pergunta atualmente revelada (clique no ícone "?" do slide, ver
  // quizRevealed) — a pergunta/alternativas em si só existem como dado
  // (slide.quizQuestions), nunca em texto no HTML do slide.
  const activeQuizQuestion = quizQuestions?.[activeQuizQuestionIndex];
  const showQuizPanel = currentSlide?.type === 'quiz' && quizRevealed && !!activeQuizQuestion;

  // Só existe "Liberar resultado" na ÚLTIMA pergunta do quiz (ou na única,
  // se for só uma) — perguntas anteriores nunca mostram a distribuição de
  // respostas, só avançam com "Liberar próxima", pra ninguém decidir a
  // resposta olhando a maioria de uma pergunta anterior ainda em tela.
  const isLastQuizQuestion = (activeQuizQuestionIndex || 0) >= (quizQuestions.length - 1);
  const isQuizResultRevealed = isLastQuizQuestion && revealedQuestions.has(activeQuizQuestionIndex || 0);
  // Ranking/Acerto por Assunto (ver overlayPanels abaixo) só aparecem de novo
  // depois que o resultado final for liberado — enquanto o quiz está rolando,
  // ficam ocultos junto com a distribuição de respostas.
  const hideRankingWidgets = showQuizPanel && !isQuizResultRevealed;

  // Nada pra ampliar (nenhum widget seria mostrado mesmo) — sem isto o botão
  // de ampliar aparecia mesmo em slides sem QR/leaderboard/interatividade
  // nenhuma, expandindo pra uma tela vazia.
  const hasAnythingToShow = (isIntroSlide && pin) || leaderboard.length > 0
    || (!!currentSlide?.type && currentSlide.type !== 'quiz')
    || (currentSlide?.branches && currentSlide.branches.length > 0)
    || showQuizPanel;

  // Conteúdo dos widgets — extraído pra variáveis porque é reaproveitado nos
  // dois estados do `return` abaixo (ampliado; e o card pequeno de canto,
  // normal). Separado em DOIS grupos (em vez de um `overlayPanels` só) pro
  // modo ampliado poder montar duas colunas lado a lado: `activityPanels`
  // (QR/quiz/nuvem/iRAT/pontos/hotspot/trilha — a atividade em si) numa
  // coluna, e `rankingGroupPanel` (Ranking + Acerto por Assunto, empilhados
  // um sobre o outro) na OUTRA — pedido do usuário pra não competir por
  // largura com a atividade nem empilhar tudo numa coluna só. Ver
  // comentário perto do Portal pra entender por que o modo ampliado
  // precisou escapar do `overflow:hidden` do slide.
  const activityPanels = (
    <>
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
            {/* Sem turma escolhida, o aluno só digita nome (sempre funcionou
                assim). Com turma, join_session passa a exigir e-mail
                cadastrado nela — ver TurmasModal.jsx pra cadastrar alunos. */}
            {onSelectTurma && (
              <select
                value={selectedTurmaId}
                onChange={(e) => onSelectTurma(e.target.value)}
                style={{ marginTop: '0.4rem', fontSize: '0.72rem', background: 'rgba(255,255,255,0.06)', color: '#e5e7eb', border: '1px solid var(--border-glass)', borderRadius: '0.3rem', padding: '0.2rem 0.4rem', maxWidth: '160px' }}
                title="Vincular esta sessão a uma turma cadastrada (exige e-mail pra entrar)"
              >
                {/* O popup nativo do <select> não herda cor/fundo do próprio
                    elemento no Chromium — sem estilo explícito em cada
                    <option>, o navegador usa o tema claro padrão do SO e o
                    texto claro (herdado do select) ficava ilegível. */}
                <option value="" style={{ background: '#111827', color: '#e5e7eb' }}>Sem turma (só nome)</option>
                {turmas.map((t) => (
                  <option key={t.id} value={t.id} style={{ background: '#111827', color: '#e5e7eb' }}>{t.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}

      {/* Pergunta ativa do Quiz ao Vivo revelada via clique no ícone "?" do
          slide (ver quizRevealed) — a pergunta/alternativas moram só aqui
          (nunca em texto no HTML do slide, ver applyQuizBadgeToSlideHtml),
          com o resultado ao vivo desenhado em cada alternativa. */}
      {showQuizPanel && (
        <div className="glass-panel" style={{ padding: '1rem 1.1rem', width: 'min(420px, calc(100% - 2rem))', background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(34,211,238,0.35)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.6rem', gap: '0.5rem' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#67e8f9', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <HelpCircle size={15} /> {quizQuestions.length > 1 ? `Pergunta ${activeQuizQuestionIndex + 1} de ${quizQuestions.length}` : 'Pergunta do Quiz'}
            </div>
            {onCloseQuizReveal && (
              <button className="btn-icon" onClick={onCloseQuizReveal} title="Esconder" style={{ width: '24px', height: '24px', flexShrink: 0 }}>
                <X size={13} />
              </button>
            )}
          </div>

          <p style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', margin: '0 0 0.75rem 0', lineHeight: 1.35 }}>
            {activeQuizQuestion.question || 'Digite a pergunta aqui'}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {getActiveQuizOptionsFromQuestion(activeQuizQuestion).map((letter) => {
              const text = activeQuizQuestion[`option${letter}`];
              const count = quizCounts[letter] || 0;
              const total = liveData.answers.length;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={letter} style={{ position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.75rem', borderRadius: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {isQuizResultRevealed && (
                    <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: 'rgba(34,211,238,0.18)', transition: 'width 0.4s ease' }} />
                  )}
                  <span style={{ position: 'relative', flexShrink: 0, width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: 'rgba(34,211,238,0.15)', border: '1px solid rgba(34,211,238,0.4)', color: '#67e8f9', fontSize: '0.7rem', fontWeight: 800 }}>
                    {letter}
                  </span>
                  <span style={{ position: 'relative', color: '#e2e8f0', fontSize: '0.85rem', flex: 1 }}>{text}</span>
                  {isQuizResultRevealed && total > 0 && (
                    <span style={{ position: 'relative', color: '#67e8f9', fontSize: '0.75rem', fontWeight: 800, whiteSpace: 'nowrap' }}>{count} ({pct}%)</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Enquanto o resultado final não é liberado (só existe na ÚLTIMA
              pergunta, ver isLastQuizQuestion), mostra só a contagem total de
              respostas recebidas — sem a distribuição por alternativa, pra
              quem ainda não respondeu não copiar a maioria olhando o telão. */}
          {!isQuizResultRevealed && (
            <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '0.5rem 0 0 0' }}>
              {liveData.answers.length} resposta{liveData.answers.length === 1 ? '' : 's'} recebida{liveData.answers.length === 1 ? '' : 's'}
              {isLastQuizQuestion ? ' — resultado oculto até você liberar.' : '.'}
            </p>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem' }}>
            {quizQuestions.length > 1 && (
              <button
                className="btn-secondary"
                disabled={activeQuizQuestionIndex <= 0}
                onClick={() => onActivateQuizQuestion?.(activeQuizQuestionIndex - 1)}
                style={{ flex: '0 0 auto', padding: '0.5rem 0.7rem', fontSize: '0.78rem' }}
                title="Voltar pra pergunta anterior"
              >
                <ArrowLeft size={14} />
              </button>
            )}
            {!isLastQuizQuestion ? (
              <button
                className="btn-primary"
                onClick={() => onActivateQuizQuestion?.(activeQuizQuestionIndex + 1)}
                style={{ flex: 1, justifyContent: 'center', padding: '0.5rem 0.8rem', fontSize: '0.78rem', fontWeight: 700 }}
              >
                Liberar próxima <ArrowRight size={14} />
              </button>
            ) : !isQuizResultRevealed ? (
              <button
                className="btn-primary"
                onClick={handleRevealResult}
                style={{ flex: 1, justifyContent: 'center', padding: '0.5rem 0.8rem', fontSize: '0.78rem', fontWeight: 700 }}
              >
                <Eye size={14} /> Liberar resultado
              </button>
            ) : quizQuestions.length > 1 ? (
              <button
                className="btn-primary"
                disabled
                style={{ flex: 1, justifyContent: 'center', padding: '0.5rem 0.8rem', fontSize: '0.78rem', fontWeight: 700 }}
              >
                Última pergunta
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* Widget de Nuvem de Palavras — no modo ampliado, título+pergunta saem
          do card e viram um heading grande ACIMA dele (pra turma ler de
          longe, sem competir de tamanho com o card). O contra-scale abaixo
          cancela o `scale(EXPANDED_SCALE)` do wrapper pai só pro CARD em si —
          sem ele, WORD_CLOUD_AREA maior + esse zoom se multiplicariam e o
          card ficaria gigante. */}
      {currentSlide?.type === 'wordcloud' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: expanded ? '0.85rem' : 0 }}>
          {expanded && (
            <div style={{ textAlign: 'center', maxWidth: '620px' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <Cloud size={26} /> Nuvem de Palavras {liveData.words.length > 0 && `(${liveData.words.length})`}
              </div>
              {currentSlide.wordcloudConfig?.question && (
                <div style={{ fontSize: '1.15rem', color: '#e2e8f0', marginTop: '0.4rem' }}>{currentSlide.wordcloudConfig.question}</div>
              )}
            </div>
          )}
          <div style={expanded ? { transform: `scale(${1 / EXPANDED_SCALE})`, transformOrigin: 'center center' } : undefined}>
          <div className="glass-panel" style={{ padding: '1.1rem', width: `min(${WORD_CLOUD_AREA.width + 50}px, calc(100% - 2rem))`, background: 'rgba(15, 23, 42, 0.92)' }}>
            {!expanded && (
              <>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: currentSlide.wordcloudConfig?.question ? '0.25rem' : '0.75rem' }}>
                  <Cloud size={16} /> Nuvem de Palavras ({liveData.words.length})
                </div>
                {currentSlide.wordcloudConfig?.question && (
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.75rem' }}>{currentSlide.wordcloudConfig.question}</div>
                )}
              </>
            )}

            <div style={{ position: 'relative', width: `${WORD_CLOUD_AREA.width}px`, height: `${WORD_CLOUD_AREA.height}px`, margin: '0 auto' }}>
              {wordLayout.map((entry, idx) => (
                <span
                  key={entry.word}
                  title={`${entry.count}x`}
                  style={{
                    position: 'absolute',
                    left: `calc(50% + ${entry.x + entry.width / 2}px)`,
                    top: `calc(50% + ${entry.y + entry.height / 2}px)`,
                    transform: `translate(-50%, -50%) rotate(${entry.rotation || 0}deg)`,
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
                  className="btn-secondary"
                  onClick={handleSummarize}
                  disabled={summaryLoading}
                  style={{ padding: '0.35rem 0.7rem', gap: '0.35rem', fontSize: '0.75rem', fontWeight: 600, color: '#67e8f9' }}
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
          </div>
        </div>
      )}

      {/* Widget de TBL/iRAT — Verificação de Prontidão Individual */}
      {currentSlide?.type === 'tbl' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: expanded ? '0.85rem' : 0 }}>
          {expanded && (
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', textAlign: 'center' }}>
              <ClipboardCheck size={24} /> Verificação Individual — iRAT ({liveData.irat.length})
            </div>
          )}
          <div className="glass-panel" style={{ padding: '1rem', width: 'min(320px, calc(100% - 2rem))', background: 'rgba(15, 23, 42, 0.92)' }}>
            {!expanded && (
              <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
                <ClipboardCheck size={16} /> Verificação Individual — iRAT ({liveData.irat.length})
              </div>
            )}

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
        </div>
      )}

      {/* Widget de Distribuição de 100 Pontos */}
      {currentSlide?.type === 'points' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: expanded ? '0.85rem' : 0 }}>
          {expanded && (
            <div style={{ textAlign: 'center', maxWidth: '520px' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fbbf24', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <PieChart size={24} /> Distribuição de Pontos ({pointsResponses.length})
              </div>
              {currentSlide.pointsConfig?.question && (
                <div style={{ fontSize: '1.1rem', color: '#e2e8f0', marginTop: '0.4rem' }}>{currentSlide.pointsConfig.question}</div>
              )}
            </div>
          )}
          <div className="glass-panel" style={{ padding: '1rem', width: 'min(320px, calc(100% - 2rem))', background: 'rgba(15, 23, 42, 0.92)' }}>
            {!expanded && (
              <>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: currentSlide.pointsConfig?.question ? '0.25rem' : '0.75rem' }}>
                  <PieChart size={16} /> Distribuição de Pontos ({pointsResponses.length})
                </div>
                {currentSlide.pointsConfig?.question && (
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.75rem' }}>{currentSlide.pointsConfig.question}</div>
                )}
              </>
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
        </div>
      )}

      {/* Widget de Hotspot em Imagem */}
      {currentSlide?.type === 'hotspot' && currentSlide.hotspotConfig?.imageUrl && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: expanded ? '0.85rem' : 0 }}>
          {expanded && (
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#22d3ee', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', textAlign: 'center' }}>
              <Target size={24} /> Hotspot ({liveData.hotspots.length})
              {liveData.hotspots.length > 0 && (
                <span style={{ fontWeight: 700, color: '#34d399' }}>
                  · {Math.round((liveData.hotspots.filter((h) => h.correct).length / liveData.hotspots.length) * 100)}% certo
                </span>
              )}
            </div>
          )}
          <div className="glass-panel" style={{ padding: '1rem', width: 'min(320px, calc(100% - 2rem))', background: 'rgba(15, 23, 42, 0.92)' }}>
            {!expanded && (
              <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#22d3ee', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
                <Target size={16} /> Hotspot ({liveData.hotspots.length})
                {liveData.hotspots.length > 0 && (
                  <span style={{ marginLeft: 'auto', fontWeight: 700, color: '#34d399' }}>
                    {Math.round((liveData.hotspots.filter((h) => h.correct).length / liveData.hotspots.length) * 100)}% certo
                  </span>
                )}
              </div>
            )}

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
        </div>
      )}

      {/* Widget de Trilha de Decisão (Decision Tree) */}
      {currentSlide?.branches && currentSlide.branches.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: expanded ? '0.85rem' : 0 }}>
          {expanded && (
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', textAlign: 'center' }}>
              <GitBranch size={24} /> Tomada de Decisão Médica / Clínica
            </div>
          )}
          <div className="glass-panel" style={{ padding: '1rem', width: 'min(340px, calc(100% - 2rem))', background: 'rgba(15, 23, 42, 0.95)', border: '1px solid #38bdf8' }}>
            {!expanded && (
              <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
                <GitBranch size={16} /> Tomada de Decisão Médica / Clínica
              </div>
            )}
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
        </div>
      )}
    </>
  );

  // Ranking + Acerto por Assunto empilhados um sobre o outro — no modo
  // ampliado (ver `expanded` no `return` mais abaixo), isto forma a coluna
  // da DIREITA (ou esquerda, se `activityPanels` ficar maior e empurrar),
  // ao lado da atividade em si, em vez de competir por espaço com ela na
  // mesma fileira ou empilhar tudo numa coluna única por cima da atividade
  // (pedido do usuário: "perguntas de um lado, ranking+acerto empilhados do
  // outro"). Também fica visível o tempo todo que houver pontuação,
  // independente do slide atual, EXCETO enquanto um quiz ainda não teve o
  // resultado final liberado (ver hideRankingWidgets) — do contrário a
  // pontuação ao vivo denunciava quem já acertou antes da turma terminar
  // de responder.
  const hasRankingData = (leaderboard.length > 0 || topicProgress.length > 0) && !hideRankingWidgets;
  const rankingGroupPanel = hasRankingData && (
    rankingHidden ? (
      // Ícone no MESMO lugar do painel fechado (não um botão perdido em
      // outro canto) — o professor fechou porque estava cobrindo o slide;
      // clicar aqui reabre exatamente onde clicou pra fechar.
      <button
        className="btn-icon"
        onClick={() => setRankingHidden(false)}
        title="Mostrar Ranking da Turma / Acerto por Assunto"
        style={{ width: '40px', height: '40px', background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(251,191,36,0.4)', flexShrink: 0 }}
      >
        <Trophy size={18} color="#fbbf24" />
      </button>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-end' }}>
        {leaderboard.length > 0 && (
          <div className="glass-panel" style={{ padding: '0.85rem 1rem', width: 'min(260px, calc(100% - 2rem))', background: 'rgba(15, 23, 42, 0.92)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem', marginBottom: '0.6rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Trophy size={15} /> Ranking da Turma
              </div>
              {/* Fecha o GRUPO inteiro (ranking + acerto por assunto), não só
                  este card — os dois cobrem o slide juntos, então fazem
                  sentido esconder juntos também. */}
              <button className="btn-icon" onClick={() => setRankingHidden(true)} title="Esconder" style={{ width: '22px', height: '22px', flexShrink: 0 }}>
                <X size={12} />
              </button>
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

        {/* Acerto por assunto acumulado ao vivo — indicador rápido pro
            professor; o relatório completo (com insight de IA) só aparece no
            encerramento da sessão, ver PresentationReportModal. */}
        {topicProgress.length > 0 && (
          <div className="glass-panel" style={{ padding: '0.85rem 1rem', width: 'min(260px, calc(100% - 2rem))', background: 'rgba(15, 23, 42, 0.92)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem', marginBottom: '0.6rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#34d399', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <PieChart size={15} /> Acerto por Assunto
              </div>
              {/* Só aparece aqui quando o Ranking da Turma não existe ainda
                  (leaderboard vazio) — do contrário o X de cima já fecha os
                  dois juntos e este ficaria duplicado. */}
              {leaderboard.length === 0 && (
                <button className="btn-icon" onClick={() => setRankingHidden(true)} title="Esconder" style={{ width: '22px', height: '22px', flexShrink: 0 }}>
                  <X size={12} />
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {topicProgress.map((t) => (
                <div key={t.topic} style={{ fontSize: '0.78rem', color: '#e5e7eb' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{t.topic}</span>
                    <span style={{ fontWeight: 700, color: t.accuracyPct < 60 ? '#f87171' : '#34d399' }}>{t.accuracyPct}%</span>
                  </div>
                  <div style={{ height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.08)', marginTop: '0.2rem' }}>
                    <div style={{ height: '100%', width: `${t.accuracyPct}%`, borderRadius: '2px', background: t.accuracyPct < 60 ? '#f87171' : '#34d399' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  );

  // Voltou a renderizar DENTRO de `.presentation-stage` (nada de Portal) —
  // a tentativa anterior desta correção usava createPortal pra document.body
  // achando que o problema era só o `overflow:hidden` de `.presentation-stage`,
  // mas isso quebrou uma coisa mais importante: `toggleFullscreen`
  // (PresentationEditor.jsx) chama a Fullscreen API DE VERDADE do navegador
  // (`stageRef.current.requestFullscreen()`) em cima de `.presentation-stage`.
  // Isso promove ESSE elemento — e SÓ ele + seus descendentes — pro "top
  // layer" do navegador: nada fora dessa árvore aparece por cima dele,
  // NENHUM z-index resolve. Por isso o Portal (que muda o botão pra
  // document.body, fora da árvore) sumia com ele de vez durante apresentação
  // real.
  //
  // A correção de verdade ficou em index.css: `.fullscreen-stage` centralizava
  // com `top/left:50%; transform:translate(-50%,-50%)`, e QUALQUER ancestral
  // com transform vira o "containing block" de um `position:fixed`
  // descendente — foi ISSO (não a falta de Portal) que causava o corte
  // original: o painel ficava preso ao RETÂNGULO DO SLIDE (containing block
  // redirecionado pra .presentation-stage) e sujeito ao overflow:hidden dele.
  // Trocando a centralização por `inset:0; margin:auto` (sem transform), um
  // `position:fixed` aqui dentro volta a ser relativo à JANELA de verdade e
  // ESCAPA do overflow:hidden sozinho — sem precisar de Portal, e
  // continuando dentro da árvore promovida pro top layer.
  return (
    <>
      {/* Botão de ampliar/recolher — posição fixa própria (não entra no
          transform:scale do container abaixo), pra continuar do mesmo
          tamanho e no mesmo lugar nos dois estados. */}
      {hasAnythingToShow && onToggleExpand && (
        <button
          onClick={onToggleExpand}
          className="btn-icon"
          title={expanded ? 'Voltar ao tamanho normal' : 'Ampliar QR Code / resultados ao vivo pra turma ver melhor'}
          style={{
            position: 'fixed',
            // Fora da tela cheia real, o .app-header (64px, sticky no topo) ocupa
            // esse canto com a seta "Voltar" — sem este deslocamento os dois
            // botões ficam empilhados no mesmo lugar (16,16).
            top: isFullscreen ? '16px' : '80px',
            left: '16px',
            zIndex: 210,
            background: 'rgba(15, 23, 42, 0.85)'
          }}
        >
          {expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      )}

      {/* `overflow:auto` + `safe center`: rede de segurança — se o grupo de
          widgets ainda assim passar da altura da tela (não deveria mais,
          com o `.fullscreen-stage` sem transform), dá pra rolar até o fim
          em vez de cortar em silêncio. */}
      <div
        style={
          expanded
            ? {
                position: 'fixed', inset: 0, zIndex: 200, display: 'flex',
                alignItems: 'safe center', justifyContent: 'safe center',
                background: 'rgba(9, 13, 22, 0.95)', overflow: 'auto', padding: '2rem'
              }
            : {
                position: 'absolute',
                // O ícone "?" do quiz (ver applyQuizBadgeToSlideHtml) mora
                // DENTRO do iframe do slide, também no canto superior
                // direito (top/right:14px, 38px) — como o iframe é sua
                // própria árvore de renderização, o z-index dele não compete
                // com este overlay por cima; sem este respiro, Ranking/Acerto
                // por Assunto cobrem o ícone por completo em qualquer slide
                // de quiz que tenha pontuação acumulada.
                top: currentSlide?.type === 'quiz' ? '104px' : '16px',
                right: '16px', zIndex: 30, display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-end'
              }
        }
      >
        {expanded ? (
          // DUAS colunas lado a lado (pedido do usuário): a atividade
          // (pergunta do quiz, nuvem de palavras etc.) numa coluna, Ranking +
          // Acerto por Assunto empilhados na OUTRA — em vez de uma fileira
          // com itens soltos (que empilhava tudo por cima da atividade
          // quando não cabia) ou uma coluna só. A coluna da atividade tem
          // `flex:1` com `minWidth`, então ela ENCOLHE pra abrir espaço pra
          // coluna do ranking em vez de as duas competirem por largura e
          // cortarem texto; só quando nem isso resolve (tela bem estreita) o
          // `flexWrap` empilha a coluna do ranking abaixo da atividade, como
          // último recurso. `maxWidth` em `vw` (não afetado pelo `scale` do
          // próprio elemento, já que transform nunca conta pro cálculo de
          // layout/overflow dos ancestrais) garante que a largura total pós
          // escala nunca passe da tela.
          <div
            style={{
              display: 'flex', flexDirection: 'row', flexWrap: 'wrap',
              alignItems: 'center', justifyContent: 'center', gap: '2rem',
              margin: 'auto', maxWidth: `calc(92vw / ${EXPANDED_SCALE})`,
              transform: `scale(${EXPANDED_SCALE})`, transformOrigin: 'center center'
            }}
          >
            {/* `flex-basis: 280px` (não 420px, que é só o limite MÁXIMO do
                card — ver `width: min(420px, ...)` nos painéis internos) —
                o algoritmo de quebra de linha do flexbox decide se um item
                cabe usando o tamanho HIPOTÉTICO do `flex-basis`, não o
                tamanho já encolhido; com basis 420px, "420 + gap + coluna do
                ranking" não cabia no `maxWidth` da fileira e SEMPRE quebrava
                pra próxima linha, mesmo quando sobraria espaço de sobra
                depois do encolhimento real. Com basis 280px cabendo ao lado
                da coluna do ranking, o `flex-grow:1` ainda estica esta
                coluna pro espaço disponível depois — é só o critério de
                quebra que precisava de um número menor. */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.85rem', flex: '1 1 280px', minWidth: '280px' }}>
              {activityPanels}
            </div>
            {/* `flex: 0 0 260px` fixo (em vez de deixar o tamanho "auto") —
                mesmo motivo acima: sem isto, o texto que quebra em duas
                linhas dentro do card (ex.: "Farmacodinâmica dos Adjuvantes
                Analgésicos") faz o algoritmo calcular o tamanho hipotético
                desta coluna pelo conteúdo SEM quebra de linha (bem mais
                largo que 260px), inflando o cálculo de quebra à toa. Fechado
                (ver `rankingHidden`), o conteúdo é só o botão de 40px pra
                reabrir — mantém `flex-basis` no tamanho real dele, senão
                sobrava uma caixa vazia de 260px do lado da atividade. */}
            {rankingGroupPanel && (
              <div style={{ flex: rankingHidden ? '0 0 auto' : '0 0 260px' }}>
                {rankingGroupPanel}
              </div>
            )}
          </div>
        ) : (
          <>
            {activityPanels}
            {rankingGroupPanel}
          </>
        )}
      </div>
    </>
  );
}
