import { Server } from 'socket.io';
import { auth } from '../services/firebaseAdmin.js';

// Armazenamento em memória das sessões ativas de apresentação
const activeSessions = new Map();

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
    socket.on('create_session', async ({ presentationId, title, slideType, correctAnswer, hotspotConfig, branches }) => {
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
        currentHotspotConfig: hotspotConfig || null,
        // Opções da Trilha de Decisão do slide atual — { optionText, targetSlideId }[]
        // (ver PresentationEditor.jsx). targetSlideId nunca é retransmitido pro
        // aluno (ver sync_slide/joined_successfully abaixo), só o texto da opção.
        currentBranches: branches || null,
        scores: new Map(), // socketId -> { name, score }
        participants: new Map(), // socketId -> { name, joinedAt }
        responses: {}, // slideIndex -> { answers: [], words: [], irat: [], hotspots: [] }
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
        branches: publicBranches(session.currentBranches)
      });

      // Notifica apresentador sobre novo aluno
      io.to(session.presenterSocketId).emit('participant_joined', {
        count: session.participants.size,
        name
      });

      console.log(`📱 Aluno "${name}" entrou na sessão ${pin}`);
    });

    // 3. Aluno envia resposta (Quiz / Wordcloud / iRAT / Hotspot)
    socket.on('submit_response', ({ pin, slideIndex, responseType, answer }) => {
      const session = activeSessions.get(pin);
      if (!session) return;

      const participant = session.participants.get(socket.id);
      const studentName = participant ? participant.name : 'Anônimo';

      if (!session.responses[slideIndex]) {
        session.responses[slideIndex] = { answers: [], words: [], irat: [], hotspots: [], branchVotes: [] };
      }

      const slideData = session.responses[slideIndex];
      let scoreResult = null; // { correct, points } — só existe quando a resposta é pontuável

      if (responseType === 'quiz') {
        slideData.answers.push({ student: studentName, answer, timestamp: Date.now() });
        // Quiz só pontua se o apresentador marcou um gabarito — sem isso continua
        // sendo uma enquete de opinião comum, sem certo/errado (comportamento original).
        if (session.currentCorrectAnswer) {
          scoreResult = scoreAndRecord(session, socket.id, studentName, answer === session.currentCorrectAnswer);
        }
      } else if (responseType === 'wordcloud') {
        slideData.words.push({ student: studentName, word: answer.trim(), timestamp: Date.now() });
      } else if (responseType === 'tbl') {
        slideData.irat.push({ student: studentName, choice: answer, team: answer.team || 'Geral' });
      } else if (responseType === 'hotspot') {
        const zone = session.currentHotspotConfig;
        const correct = !!zone && isWithinHotspot(answer, zone);
        slideData.hotspots.push({ student: studentName, x: answer?.x, y: answer?.y, correct, timestamp: Date.now() });
        scoreResult = scoreAndRecord(session, socket.id, studentName, correct);
      } else if (responseType === 'branch') {
        // Votação da turma na Trilha de Decisão — raciocínio clínico em grupo,
        // sem certo/errado, então sem pontuação (mesmo espírito do wordcloud).
        slideData.branchVotes.push({ student: studentName, answer, timestamp: Date.now() });
      }

      if (scoreResult) {
        // Feedback de pontuação vai só pro aluno que respondeu (não pra sala toda)
        socket.emit('response_scored', scoreResult);
        io.to(`session_${pin}`).emit('leaderboard_update', { leaderboard: topScores(session) });
      }

      // Transmite resultado agregado em tempo real para o Apresentador e Telão
      io.to(`session_${pin}`).emit('live_results_update', {
        slideIndex,
        responseType,
        responses: slideData,
        totalParticipants: session.participants.size
      });
    });

    // 4. Apresentador altera slide
    socket.on('slide_changed', ({ pin, newIndex, slideType, correctAnswer, hotspotConfig, branches }) => {
      const session = activeSessions.get(pin);
      if (session) {
        commitDwellTime(session);
        session.currentSlideIndex = newIndex;
        session.currentSlideType = slideType || null;
        session.currentCorrectAnswer = correctAnswer || null;
        session.currentHotspotConfig = hotspotConfig || null;
        session.currentBranches = branches || null;
        // Transmite para todos os alunos sincronizarem o celular — só o necessário
        // pra responder (nunca o gabarito, as coordenadas certas do hotspot, ou
        // pra onde cada trilha de decisão leva).
        io.to(`session_${pin}`).emit('sync_slide', {
          currentSlideIndex: newIndex,
          slideType: session.currentSlideType,
          hotspotImageUrl: session.currentHotspotConfig?.imageUrl || null,
          branches: publicBranches(session.currentBranches)
        });
      }
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

  const slideIndexes = new Set([
    ...Object.keys(session.responses).map(Number),
    ...Object.keys(dwellTimes).map(Number)
  ]);

  let totalResponses = 0;
  const perSlide = [...slideIndexes].sort((a, b) => a - b).map((slideIndex) => {
    const data = session.responses[slideIndex] || { answers: [], words: [], irat: [], hotspots: [] };
    const responseCount = data.answers.length + data.words.length + data.irat.length + (data.hotspots?.length || 0);
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
