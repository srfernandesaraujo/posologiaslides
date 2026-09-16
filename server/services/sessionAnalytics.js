// Agrega desempenho por assunto e por aluno a partir das respostas reais
// coletadas na sessão ao vivo (session.responses, ver sessionSocket.js) —
// nada de métrica inventada, mesmo espírito de getSessionReport.

const NO_TOPIC = 'Sem assunto';

// Achata session.responses num array de respostas certo/errado com assunto.
// Só quiz (com gabarito definido, ou seja `correct !== undefined`) e hotspot
// têm noção de certo/errado — wordcloud/branch/points ficam de fora, mesma
// regra de scoreAndRecord em sessionSocket.js.
function scoreableEntries(session) {
  const entries = [];
  Object.values(session.responses || {}).forEach((slideData) => {
    (slideData.answers || []).forEach((a) => {
      if (a.correct === undefined) return;
      entries.push({ student: a.student, topic: a.topic || NO_TOPIC, correct: a.correct });
    });
    (slideData.hotspots || []).forEach((h) => {
      entries.push({ student: h.student, topic: h.topic || NO_TOPIC, correct: h.correct });
    });
  });
  return entries;
}

// Estatística por assunto (ordenada do pior pro melhor acerto) — usada tanto
// pro indicador ao vivo (topic_progress_update) quanto pro relatório final.
export function computeTopicStats(session) {
  const byTopic = new Map();
  scoreableEntries(session).forEach(({ topic, correct }) => {
    const stats = byTopic.get(topic) || { topic, totalAnswers: 0, correctAnswers: 0 };
    stats.totalAnswers += 1;
    if (correct) stats.correctAnswers += 1;
    byTopic.set(topic, stats);
  });

  return [...byTopic.values()]
    .map((s) => ({ ...s, accuracyPct: Math.round((s.correctAnswers / s.totalAnswers) * 100) }))
    .sort((a, b) => a.accuracyPct - b.accuracyPct);
}

// Relatório final completo: desempenho por assunto, por aluno e ranking —
// tudo derivado de session.responses/session.scores, sem estado à parte.
export function buildSessionAnalytics(session) {
  const entries = scoreableEntries(session);
  const perTopic = computeTopicStats(session);

  const byStudent = new Map();
  entries.forEach(({ student, topic, correct }) => {
    const stats = byStudent.get(student) || { name: student, correctCount: 0, totalCount: 0, topicTotals: new Map() };
    stats.totalCount += 1;
    if (correct) stats.correctCount += 1;

    const topicStats = stats.topicTotals.get(topic) || { total: 0, correct: 0 };
    topicStats.total += 1;
    if (correct) topicStats.correct += 1;
    stats.topicTotals.set(topic, topicStats);

    byStudent.set(student, stats);
  });

  // session.scores é indexado por socketId (que some quando o aluno
  // desconecta) — usa o nome (já armazenado em cada entrada, ver
  // scoreAndRecord em sessionSocket.js) como chave estável pro cruzamento.
  const scoreByName = new Map([...session.scores.values()].map((s) => [s.name, s.score]));

  const perStudent = [...byStudent.values()].map(({ name, correctCount, totalCount, topicTotals }) => {
    const weakTopics = [...topicTotals.entries()]
      .filter(([, t]) => t.correct < t.total / 2)
      .map(([topic]) => topic);
    return { name, score: scoreByName.get(name) || 0, correctCount, totalCount, weakTopics };
  });

  const ranking = [...perStudent]
    .sort((a, b) => b.score - a.score)
    .map((s, i) => ({ name: s.name, score: s.score, position: i + 1 }));

  const totalAnswers = entries.length;
  const totalCorrect = entries.filter((e) => e.correct).length;
  const overallAccuracyPct = totalAnswers ? Math.round((totalCorrect / totalAnswers) * 100) : null;

  return { perTopic, perStudent, ranking, overallAccuracyPct };
}
