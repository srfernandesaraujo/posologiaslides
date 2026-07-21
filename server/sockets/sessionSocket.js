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
    socket.on('create_session', async ({ presentationId, title, slideType }) => {
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
        participants: new Map(), // socketId -> { name, joinedAt }
        responses: {}, // slideIndex -> { answers: [], wordCloud: [], irat: [] }
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
        slideType: session.currentSlideType
      });

      // Notifica apresentador sobre novo aluno
      io.to(session.presenterSocketId).emit('participant_joined', {
        count: session.participants.size,
        name
      });

      console.log(`📱 Aluno "${name}" entrou na sessão ${pin}`);
    });

    // 3. Aluno envia resposta (Quiz / Wordcloud / iRAT)
    socket.on('submit_response', ({ pin, slideIndex, responseType, answer }) => {
      const session = activeSessions.get(pin);
      if (!session) return;

      const participant = session.participants.get(socket.id);
      const studentName = participant ? participant.name : 'Anônimo';

      if (!session.responses[slideIndex]) {
        session.responses[slideIndex] = { answers: [], words: [], irat: [] };
      }

      const slideData = session.responses[slideIndex];

      if (responseType === 'quiz') {
        slideData.answers.push({ student: studentName, answer, timestamp: Date.now() });
      } else if (responseType === 'wordcloud') {
        slideData.words.push({ student: studentName, word: answer.trim(), timestamp: Date.now() });
      } else if (responseType === 'tbl') {
        slideData.irat.push({ student: studentName, choice: answer, team: answer.team || 'Geral' });
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
    socket.on('slide_changed', ({ pin, newIndex, slideType }) => {
      const session = activeSessions.get(pin);
      if (session) {
        commitDwellTime(session);
        session.currentSlideIndex = newIndex;
        session.currentSlideType = slideType || null;
        // Transmite para todos os alunos sincronizarem o celular
        io.to(`session_${pin}`).emit('sync_slide', { currentSlideIndex: newIndex, slideType: session.currentSlideType });
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
    const data = session.responses[slideIndex] || { answers: [], words: [], irat: [] };
    const responseCount = data.answers.length + data.words.length + data.irat.length;
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
