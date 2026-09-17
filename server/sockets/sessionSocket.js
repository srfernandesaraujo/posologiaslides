import { Server } from 'socket.io';
import { auth } from '../services/firebaseAdmin.js';
import { computeTopicStats } from '../services/sessionAnalytics.js';

// Armazenamento em memória das sessões ativas de apresentação
const activeSessions = new Map();

// Chave composta usada em session.responses — permite várias perguntas
// sequenciais dentro do MESMO slide de quiz (ver activate_quiz_question
// abaixo) sem colidir respostas de perguntas diferentes no mesmo bucket.
// questionIndex ausente/0 vira só o slideIndex puro (compatível com o
// formato antigo, de antes de existir mais de uma pergunta por slide).
function responseKey(slideIndex, questionIndex) {
  return questionIndex ? `${slideIndex}:${questionIndex}` : String(slideIndex);
}

function emptyResponses() {
  return { answers: [], words: [], irat: [], hotspots: [], branchVotes: [], points: [] };
}

// Verifica o ID token do Firebase enviado pelo cliente no handshake do socket
// (io(url, { auth: { token } })), o mesmo token usado nas rotas HTTP autenticadas.
async function getAuthenticatedUserId(socket) {
  const token = socket.handshake.auth?.token;
  if (!token) return null;

  try {
    const decoded = await auth.verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

export function setupSocketIO(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Novo cliente conectado: ${socket.id}`);

    // 1. Apresentador cria sessão (exige estar autenticado)
    socket.on('create_session', async ({ presentationId, title, slideType, correctAnswer, topic, hotspotConfig, pointsConfig, wordcloudConfig, branches, quizOptions, slideTitle, slideNotes, totalSlides, totalQuestions }) => {
      const userId = await getAuthenticatedUserId(socket);
      if (!userId) {
        return socket.emit('join_error', { message: 'É necessário estar logado para iniciar uma sessão.' });
      }

      let pin;
      do {
        pin = Math.floor(100000 + Math.random() * 900000).toString(); // PIN de 6 dígitos
      } while (activeSessions.has(pin));

      const sessionData = {
        pin,
        presentationId,
        title,
        presenterSocketId: socket.id,
        currentSlideIndex: 0,
        currentSlideType: slideType || null,
        // Gabarito (resposta certa / zona certa do hotspot): só existe no servidor,
        // NUNCA é retransmitido pro aluno via sync_slide/joined_successfully — só o
        // necessário pra responder (ex.: a URL da imagem) é enviado pra sala.
        currentCorrectAnswer: correctAnswer || null,
        // Assunto do slide atual (quiz/hotspot) — usado pra rotular cada
        // resposta com o tema em session.responses e assim gerar o
        // relatório final de desempenho por assunto (ver sessionAnalytics.js).
        currentTopic: topic || null,
        currentHotspotConfig: hotspotConfig || null,
        // Pergunta + rótulos das opções da Distribuição de 100 Pontos — ao
        // contrário do gabarito/zona certa do hotspot, não é sigiloso (não há
        // resposta "certa" aqui), então é retransmitido pro aluno como está
        // (ver joined_successfully/sync_slide abaixo).
        currentPointsConfig: pointsConfig || null,
        // Letras (A/B/C/D) das alternativas de Quiz ao Vivo que o professor
        // realmente preencheu — alternativa deixada em branco não deve
        // aparecer como botão votável no celular do aluno (ver
        // getActiveQuizOptions em slideHtmlUtils.js). Mesmo caso do
        // pointsConfig acima: não é sigiloso, retransmitido como está.
        currentQuizOptions: quizOptions || null,
        // Índice da pergunta ATIVA dentro do quiz do slide atual, e quantas
        // perguntas o quiz tem no total — permite várias perguntas
        // sequenciais no MESMO slide (ver activate_quiz_question abaixo),
        // liberadas manualmente pelo professor uma de cada vez. Default
        // 0/1 = comportamento de sempre (quiz de 1 pergunta só).
        currentQuestionIndex: 0,
        currentTotalQuestions: totalQuestions || 1,
        // Pergunta disparadora da Nuvem de Palavras — mesmo caso do pointsConfig
        // acima: não é sigiloso, retransmitido pro aluno como está.
        currentWordcloudConfig: wordcloudConfig || null,
        // Opções da Trilha de Decisão do slide atual — { optionText, targetSlideId }[]
        // (ver PresentationEditor.jsx). targetSlideId nunca é retransmitido pro
        // aluno (ver sync_slide/joined_successfully abaixo), só o texto da opção.
        currentBranches: branches || null,
        // Título/anotações do apresentador + total de slides do slide atual —
        // só usados pelo controle remoto (ver join_as_remote/remote_navigate
        // abaixo), pra o celular mostrar contexto de verdade (não só o índice
        // numérico). Não é sigiloso feito o gabarito, então também é
        // retransmitido como está.
        currentSlideTitle: slideTitle || null,
        currentSlideNotes: slideNotes || null,
        totalSlides: totalSlides || null,
        scores: new Map(), // socketId -> { name, score }
        participants: new Map(), // socketId -> { name, joinedAt }
        responses: {}, // slideIndex -> { answers: [], words: [], irat: [], hotspots: [], points: [] }
        startTime: Date.now(),
        lastSlideChangeAt: Date.now(),
        slideDwellTimes: {} // slideIndex -> totalSeconds
      };

      activeSessions.set(pin, sessionData);
      socket.join(`session_${pin}`);

      socket.emit('session_created', { pin, sessionData });
      console.log(`🎯 Sessão criada PIN: ${pin} para apresentação "${title}"`);
    });

    // 2. Aluno entra na sessão pelo celular com PIN
    socket.on('join_session', ({ pin, name }) => {
      const session = activeSessions.get(pin);
      if (!session) {
        return socket.emit('join_error', { message: 'Sessão não encontrada ou encerrada. Verifique o PIN.' });
      }

      session.participants.set(socket.id, { name, joinedAt: Date.now() });
      socket.join(`session_${pin}`);

      socket.emit('joined_successfully', {
        pin,
        title: session.title,
        currentSlideIndex: session.currentSlideIndex,
        slideType: session.currentSlideType,
        hotspotImageUrl: session.currentHotspotConfig?.imageUrl || null,
        pointsConfig: session.currentPointsConfig,
        wordcloudConfig: session.currentWordcloudConfig,
        branches: publicBranches(session.currentBranches),
        quizOptions: session.currentQuizOptions,
        questionIndex: session.currentQuestionIndex || 0,
        totalQuestions: session.currentTotalQuestions || 1,
        slideTitle: session.currentSlideTitle,
        slideNotes: session.currentSlideNotes,
        totalSlides: session.totalSlides
      });

      // Notifica apresentador sobre novo aluno
      io.to(session.presenterSocketId).emit('participant_joined', {
        count: session.participants.size,
        name
      });

      console.log(`📱 Aluno "${name}" entrou na sessão ${pin}`);
    });

    // 2b. Celular entra na sessão como CONTROLE REMOTO (não é aluno: não conta
    // como participante, não responde quiz, só manda/recebe navegação — ver
    // remote_navigate abaixo). PIN é o mesmo já exibido na apresentação.
    socket.on('join_as_remote', ({ pin }) => {
      const session = activeSessions.get(pin);
      if (!session) {
        return socket.emit('join_error', { message: 'Sessão não encontrada ou encerrada. Verifique o PIN.' });
      }

      socket.join(`session_${pin}`);
      socket.emit('remote_joined', {
        pin,
        title: session.title,
        currentSlideIndex: session.currentSlideIndex,
        totalSlides: session.totalSlides,
        slideTitle: session.currentSlideTitle,
        slideNotes: session.currentSlideNotes
      });

      console.log(`🎮 Controle remoto conectado à sessão ${pin}`);
    });

    // 2c. Controle remoto pede pra avançar/voltar slide — quem decide a
    // navegação de verdade (limites, slide de encerramento etc.) é o próprio
    // apresentador, então só repassamos o pedido pro socket dele.
    socket.on('remote_navigate', ({ pin, direction }) => {
      const session = activeSessions.get(pin);
      if (!session) return;
      io.to(session.presenterSocketId).emit('remote_navigate', { direction });
    });

    // 2d. Trackpad do controle remoto — modo "cursor" (mover um ponteiro
    // virtual sobre o slide e simular clique) e modo "rolar" (rolar o
    // conteúdo do slide, pra slides mais altos que a tela). Deltas vêm como
    // PORCENTAGEM da área de toque do celular (não pixels crus), pra a
    // sensibilidade não depender do tamanho da tela do aparelho — quem decide
    // a escala final é o apresentador (ver PresentationEditor.jsx). Sem
    // estado nenhum guardado na sessão: é só um repasse pro socket certo,
    // igual remote_navigate acima.
    socket.on('remote_cursor_move', ({ pin, dxPercent, dyPercent }) => {
      const session = activeSessions.get(pin);
      if (!session) return;
      io.to(session.presenterSocketId).emit('remote_cursor_move', { dxPercent, dyPercent });
    });

    socket.on('remote_cursor_click', ({ pin }) => {
      const session = activeSessions.get(pin);
      if (!session) return;
      io.to(session.presenterSocketId).emit('remote_cursor_click');
    });

    socket.on('remote_scroll', ({ pin, dxPercent, dyPercent }) => {
      const session = activeSessions.get(pin);
      if (!session) return;
      io.to(session.presenterSocketId).emit('remote_scroll', { dxPercent, dyPercent });
    });

    // 2e. Botões +/- de zoom do controle remoto — mesmo repasse simples de
    // remote_navigate acima, sem estado guardado na sessão (quem decide o
    // range/clamp final é o apresentador, ver handleZoomIn/handleZoomOut em
    // PresentationEditor.jsx).
    socket.on('remote_zoom', ({ pin, direction }) => {
      const session = activeSessions.get(pin);
      if (!session) return;
      io.to(session.presenterSocketId).emit('remote_zoom', { direction });
    });

    // 3. Aluno envia resposta (Quiz / Wordcloud / iRAT / Hotspot)
    socket.on('submit_response', ({ pin, slideIndex, questionIndex, responseType, answer }) => {
      const session = activeSessions.get(pin);
      if (!session) return;

      const participant = session.participants.get(socket.id);
      const studentName = participant ? participant.name : 'Anônimo';

      const key = responseKey(slideIndex, questionIndex);
      if (!session.responses[key]) {
        session.responses[key] = emptyResponses();
      }

      const slideData = session.responses[key];
      let scoreResult = null; // { correct, points } — só existe quando a resposta é pontuável

      if (responseType === 'quiz') {
        // correct fica undefined quando não há gabarito definido — mantém a
        // distinção entre "enquete sem certo/errado" e "resposta errada"
        // (ver scoreableEntries em sessionAnalytics.js).
        const correct = session.currentCorrectAnswer ? answer === session.currentCorrectAnswer : undefined;
        slideData.answers.push({ student: studentName, answer, correct, topic: session.currentTopic || null, timestamp: Date.now() });
        // Quiz só pontua se o apresentador marcou um gabarito — sem isso continua
        // sendo uma enquete de opinião comum, sem certo/errado (comportamento original).
        if (session.currentCorrectAnswer) {
          scoreResult = scoreAndRecord(session, socket.id, studentName, correct);
        }
      } else if (responseType === 'wordcloud') {
        slideData.words.push({ student: studentName, word: answer.trim(), timestamp: Date.now() });
      } else if (responseType === 'tbl') {
        slideData.irat.push({ student: studentName, choice: answer, team: answer.team || 'Geral' });
      } else if (responseType === 'hotspot') {
        const zone = session.currentHotspotConfig;
        const correct = !!zone && isWithinHotspot(answer, zone);
        slideData.hotspots.push({ student: studentName, x: answer?.x, y: answer?.y, correct, topic: session.currentTopic || null, timestamp: Date.now() });
        scoreResult = scoreAndRecord(session, socket.id, studentName, correct);
      } else if (responseType === 'branch') {
        // Votação da turma na Trilha de Decisão — raciocínio clínico em grupo,
        // sem certo/errado, então sem pontuação (mesmo espírito do wordcloud).
        slideData.branchVotes.push({ student: studentName, answer, timestamp: Date.now() });
      } else if (responseType === 'points') {
        // Distribuição de 100 pontos entre A/B/C/D — enquete de opinião/priorização,
        // sem gabarito (mesmo espírito do wordcloud/branch, sem pontuação).
        slideData.points.push({ student: studentName, allocation: answer, timestamp: Date.now() });
      }

      if (scoreResult) {
        // Feedback de pontuação vai só pro aluno que respondeu (não pra sala toda)
        socket.emit('response_scored', scoreResult);
        io.to(`session_${pin}`).emit('leaderboard_update', { leaderboard: topScores(session) });
        // Recalcula acerto por assunto a cada resposta pontuável, pro
        // apresentador acompanhar ao vivo (ver ActiveMethodologiesOverlay.jsx)
        // — mesma fonte de dados usada no relatório final (sessionAnalytics.js).
        io.to(session.presenterSocketId).emit('topic_progress_update', { perTopic: computeTopicStats(session) });
      }

      // Transmite resultado agregado em tempo real para o Apresentador e Telão
      io.to(`session_${pin}`).emit('live_results_update', {
        slideIndex,
        questionIndex: questionIndex || 0,
        responseType,
        responses: slideData,
        totalParticipants: session.participants.size
      });
    });

    // 4. Apresentador altera slide
    socket.on('slide_changed', ({ pin, newIndex, slideType, correctAnswer, topic, hotspotConfig, pointsConfig, wordcloudConfig, branches, quizOptions, slideTitle, slideNotes, totalSlides, totalQuestions }) => {
      const session = activeSessions.get(pin);
      if (session) {
        commitDwellTime(session);
        session.currentSlideIndex = newIndex;
        session.currentSlideType = slideType || null;
        session.currentCorrectAnswer = correctAnswer || null;
        session.currentTopic = topic || null;
        session.currentHotspotConfig = hotspotConfig || null;
        session.currentPointsConfig = pointsConfig || null;
        session.currentWordcloudConfig = wordcloudConfig || null;
        session.currentBranches = branches || null;
        session.currentQuizOptions = quizOptions || null;
        // Trocar de slide sempre reinicia pra 1ª pergunta do quiz (se houver
        // mais de uma, ver activate_quiz_question abaixo) — mesmo espírito
        // do reset de `submitted` no celular do aluno a cada slide novo.
        session.currentQuestionIndex = 0;
        session.currentTotalQuestions = totalQuestions || 1;
        session.currentSlideTitle = slideTitle || null;
        session.currentSlideNotes = slideNotes || null;
        if (totalSlides) session.totalSlides = totalSlides;
        // Transmite para todos os alunos/controle remoto sincronizarem o
        // celular — só o necessário pra responder ou navegar (nunca o
        // gabarito, as coordenadas certas do hotspot, ou pra onde cada
        // trilha de decisão leva).
        io.to(`session_${pin}`).emit('sync_slide', {
          currentSlideIndex: newIndex,
          slideType: session.currentSlideType,
          hotspotImageUrl: session.currentHotspotConfig?.imageUrl || null,
          pointsConfig: session.currentPointsConfig,
          wordcloudConfig: session.currentWordcloudConfig,
          branches: publicBranches(session.currentBranches),
          quizOptions: session.currentQuizOptions,
          questionIndex: session.currentQuestionIndex,
          totalQuestions: session.currentTotalQuestions,
          slideTitle: session.currentSlideTitle,
          slideNotes: session.currentSlideNotes,
          totalSlides: session.totalSlides
        });

        // Reenvia pro Apresentador/Telão as respostas que ESTE slide já
        // acumulou (ex.: professor volta pra um slide já respondido antes) —
        // sem isto, o painel ficava mostrando os dados do slide anterior até
        // chegar a primeira resposta NOVA neste, porque `live_results_update`
        // só é emitido reativamente em `submit_response` (ver abaixo).
        io.to(`session_${pin}`).emit('live_results_update', {
          slideIndex: newIndex,
          questionIndex: 0,
          responseType: null,
          responses: session.responses[responseKey(newIndex, 0)] || emptyResponses(),
          totalParticipants: session.participants.size
        });
      }
    });

    // 4b. Apresentador libera a PRÓXIMA pergunta de um quiz com várias
    // perguntas sequenciais no mesmo slide (ver "Pergunta N de M" no editor)
    // — não navega slide nenhum, só troca qual pergunta está ativa.
    // Só exige que a sessão exista (mesma regra de slide_changed/
    // submit_response, únicos outros eventos que mexem no estado da sessão)
    // — chegou a existir uma checagem extra `presenterSocketId === socket.id`
    // aqui, mas ela quebrava em silêncio sempre que o socket do apresentador
    // reconectava no meio da aula (rede instável, aba em segundo plano etc.):
    // o id mudava, o pedido de "próxima pergunta" era descartado sem erro
    // nenhum, e só os ALUNOS ficavam sem saber (a tela do professor já tinha
    // avançado localmente antes de confirmar com o servidor).
    // Recebe um `callback` (ack do Socket.IO) pra o apresentador SABER se o
    // pedido chegou de verdade — antes falhava tudo em silêncio (sessão
    // sumida por reinício do servidor, aluno desconectado etc.) e a única
    // pista era "só mudou na minha tela" (ver handleActivateQuizQuestion em
    // PresentationEditor.jsx, que usa socket.timeout(...) pra também pegar o
    // caso de nem chegar resposta nenhuma, ex.: conexão caiu de vez).
    socket.on('activate_quiz_question', ({ pin, questionIndex, totalQuestions, correctAnswer, topic, quizOptions }, callback) => {
      // Diagnóstico temporário (bug "2a pergunta não chega") — confirma se o
      // servidor recebe o evento e se o callback chega a ser chamado, já que
      // o professor está vendo timeout no ack mesmo em sessão nova/recente.
      console.log(`[quiz-debug] activate_quiz_question recebido: pin=${pin} questionIndex=${questionIndex} socket.id=${socket.id} temCallback=${typeof callback === 'function'}`);
      const session = activeSessions.get(pin);
      if (!session) {
        console.log(`[quiz-debug] sessao NAO encontrada para pin=${pin}`);
        if (typeof callback === 'function') callback({ success: false, reason: 'session-not-found' });
        return;
      }

      // Reseta o relógio da pontuação por velocidade (ver scoreAndRecord)
      // pra esta pergunta nova — sem isto, ele continuava contando desde que
      // o SLIDE apareceu (só resetado em slide_changed), então a 2ª pergunta
      // em diante sempre dava só o piso mínimo de pontos, não importa quão
      // rápido o aluno respondesse. commitDwellTime já bota o tempo decorrido
      // até aqui na conta do slide atual antes de zerar o relógio, mesma
      // lógica usada em slide_changed.
      commitDwellTime(session);
      session.currentQuestionIndex = questionIndex || 0;
      if (totalQuestions) session.currentTotalQuestions = totalQuestions;
      session.currentCorrectAnswer = correctAnswer || null;
      session.currentTopic = topic || null;
      session.currentQuizOptions = quizOptions || null;

      // Nunca inclui o gabarito — mesma regra de sync_slide acima.
      io.to(`session_${pin}`).emit('sync_quiz_question', {
        questionIndex: session.currentQuestionIndex,
        totalQuestions: session.currentTotalQuestions,
        quizOptions: session.currentQuizOptions
      });

      // Reenvia as respostas já acumuladas desta pergunta específica (mesmo
      // motivo do reenvio em slide_changed: o professor pode voltar pra uma
      // pergunta anterior já respondida).
      io.to(`session_${pin}`).emit('live_results_update', {
        slideIndex: session.currentSlideIndex,
        questionIndex: session.currentQuestionIndex,
        responseType: null,
        responses: session.responses[responseKey(session.currentSlideIndex, session.currentQuestionIndex)] || emptyResponses(),
        totalParticipants: session.participants.size
      });

      // participantCount vai junto pro apresentador perceber na hora se
      // "funcionou" mas não tem mais ninguém pra receber (ex.: todos os
      // alunos caíram da sala por outro motivo) — sem isto pareceria sucesso
      // mesmo com a sala vazia.
      const roomSize = io.sockets.adapter.rooms.get(`session_${pin}`)?.size || 0;
      console.log(`[quiz-debug] sync_quiz_question emitido pra sala session_${pin} (participants.size=${session.participants.size}, socket.io room size=${roomSize}) — chamando callback agora`);
      if (typeof callback === 'function') callback({ success: true, participantCount: session.participants.size });
    });

    // Desconexão
    socket.on('disconnect', () => {
      activeSessions.forEach((session, pin) => {
        if (session.participants.has(socket.id)) {
          session.participants.delete(socket.id);
          io.to(session.presenterSocketId).emit('participant_left', {
            count: session.participants.size
          });
        }
      });
    });
  });

  return io;
}

// Pontua uma resposta certa/errada e acumula no placar do aluno. Quanto mais rápido
// responder (a partir do instante em que o slide atual entrou em cena), mais pontos —
// mesmo espírito de jogos de quiz ao vivo (Kahoot etc.), sem precisar de lib nova.
function scoreAndRecord(session, socketId, name, correct) {
  const elapsedSeconds = (Date.now() - session.lastSlideChangeAt) / 1000;
  const points = correct ? Math.max(10, 100 - Math.floor(elapsedSeconds) * 3) : 0;
  if (correct) {
    const current = session.scores.get(socketId) || { name, score: 0 };
    current.score += points;
    current.name = name;
    session.scores.set(socketId, current);
  }
  return { correct, points };
}

function topScores(session) {
  return [...session.scores.values()].sort((a, b) => b.score - a.score).slice(0, 10);
}

// Versão da Trilha de Decisão exposta ao aluno: só o texto de cada opção,
// nunca `targetSlideId` — não faz sentido o celular do aluno saber pra onde
// cada botão leva antes da turma votar.
function publicBranches(branches) {
  return branches?.map((b) => ({ optionText: b.optionText })) || null;
}

// Distância euclidiana entre o ponto respondido e o centro da zona certa, em % da imagem
function isWithinHotspot(answer, zone) {
  if (!answer || typeof answer.x !== 'number' || typeof answer.y !== 'number') return false;
  const dx = answer.x - zone.x;
  const dy = answer.y - zone.y;
  return Math.sqrt(dx * dx + dy * dy) <= (zone.radius ?? 10);
}

// Acumula o tempo decorrido no slide atual em slideDwellTimes antes de trocar de slide
function commitDwellTime(session) {
  const now = Date.now();
  const elapsedSeconds = (now - session.lastSlideChangeAt) / 1000;
  const idx = session.currentSlideIndex;
  session.slideDwellTimes[idx] = (session.slideDwellTimes[idx] || 0) + elapsedSeconds;
  session.lastSlideChangeAt = now;
}

export function getActiveSession(pin) {
  return activeSessions.get(pin);
}

/**
 * Monta um relatório da sessão a partir de dados reais coletados via socket
 * (nada de métricas inventadas): duração, participantes, respostas por slide
 * e tempo de permanência por slide.
 */
export function getSessionReport(pin) {
  const session = activeSessions.get(pin);
  if (!session) return null;

  // Inclui o tempo decorrido no slide exibido no momento da consulta, sem alterar o estado da sessão
  const dwellTimes = { ...session.slideDwellTimes };
  const liveElapsed = (Date.now() - session.lastSlideChangeAt) / 1000;
  dwellTimes[session.currentSlideIndex] = (dwellTimes[session.currentSlideIndex] || 0) + liveElapsed;

  // Chaves de session.responses viram "slideIndex" (pergunta única) ou
  // "slideIndex:questionIndex" (quiz com várias perguntas sequenciais, ver
  // responseKey/activate_quiz_question acima) — o relatório por slide soma
  // as respostas de TODAS as perguntas daquele slide num único bucket,
  // mesmo formato de saída de sempre.
  const slideIndexes = new Set([
    ...Object.keys(session.responses).map((key) => Number(key.split(':')[0])),
    ...Object.keys(dwellTimes).map(Number)
  ]);

  let totalResponses = 0;
  const perSlide = [...slideIndexes].sort((a, b) => a - b).map((slideIndex) => {
    const data = Object.entries(session.responses)
      .filter(([key]) => Number(key.split(':')[0]) === slideIndex)
      .reduce((acc, [, bucket]) => {
        acc.answers.push(...bucket.answers);
        acc.words.push(...bucket.words);
        acc.irat.push(...bucket.irat);
        acc.hotspots.push(...(bucket.hotspots || []));
        acc.points.push(...(bucket.points || []));
        return acc;
      }, { answers: [], words: [], irat: [], hotspots: [], points: [] });
    const responseCount = data.answers.length + data.words.length + data.irat.length + (data.hotspots?.length || 0) + (data.points?.length || 0);
    totalResponses += responseCount;

    return {
      slideIndex,
      dwellSeconds: Math.round(dwellTimes[slideIndex] || 0),
      answerCount: data.answers.length,
      wordCount: data.words.length,
      responseCount
    };
  });

  const longestSlide = perSlide.reduce((max, s) => (s.dwellSeconds > (max?.dwellSeconds ?? -1) ? s : max), null);
  const mostEngagedSlide = perSlide.reduce((max, s) => (s.responseCount > (max?.responseCount ?? -1) ? s : max), null);

  return {
    pin,
    title: session.title,
    durationSeconds: Math.round((Date.now() - session.startTime) / 1000),
    totalParticipants: session.participants.size,
    totalResponses,
    perSlide,
    longestSlide,
    mostEngagedSlide
  };
}
