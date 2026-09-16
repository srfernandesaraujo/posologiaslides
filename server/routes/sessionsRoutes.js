import express from 'express';
import { getSessionReport, getActiveSession } from '../sockets/sessionSocket.js';
import { summarizeOpenResponses, generateSessionInsight } from '../services/aiService.js';
import { resolveApiKey } from './aiRoutes.js';
import { buildSessionAnalytics } from '../services/sessionAnalytics.js';
import { saveSessionReport } from '../services/store.js';

const router = express.Router();

// Relatório de desempenho da sessão ao vivo (dados reais coletados via socket.io)
router.get('/:pin/report', (req, res) => {
  const report = getSessionReport(req.params.pin);
  if (!report) {
    return res.status(404).json({ error: 'Sessão não encontrada ou já encerrada.' });
  }
  res.json({ success: true, report });
});

// Encerra a sessão ao vivo: calcula ranking + desempenho por assunto (dados
// reais, ver sessionAnalytics.js), gera um parágrafo de feedback com IA
// (best-effort — cai num resumo baseado em regra se falhar) e persiste o
// relatório final no Firestore, pra sobreviver a um restart do servidor
// (diferente do resto da sessão, que vive só em memória).
router.post('/:pin/end', async (req, res) => {
  try {
    const { apiKey } = req.body;
    const session = getActiveSession(req.params.pin);
    const baseReport = getSessionReport(req.params.pin);
    if (!session || !baseReport) {
      return res.status(404).json({ error: 'Sessão não encontrada ou já encerrada.' });
    }

    const analytics = buildSessionAnalytics(session);
    const effectiveApiKey = await resolveApiKey(req.user.id, apiKey);
    const { insight, warning } = await generateSessionInsight({
      title: session.title,
      perTopic: analytics.perTopic,
      overallAccuracyPct: analytics.overallAccuracyPct,
      apiKey: effectiveApiKey
    });

    const report = {
      ...baseReport,
      presentationId: session.presentationId,
      startTime: session.startTime,
      endTime: Date.now(),
      ...analytics,
      insight
    };

    const saved = await saveSessionReport(req.user.id, session.presentationId, report);
    res.json({ success: true, report: saved, warning: warning || null });
  } catch (error) {
    console.error('Erro na rota end (encerrar sessão):', error);
    res.status(500).json({ error: 'Falha ao encerrar a sessão e gerar o relatório final.' });
  }
});

// Resume com IA as respostas abertas (nuvem de palavras) de um slide da sessão ao vivo
router.post('/:pin/summarize', async (req, res) => {
  try {
    const { slideIndex, apiKey } = req.body;
    const session = getActiveSession(req.params.pin);
    if (!session) {
      return res.status(404).json({ error: 'Sessão não encontrada ou já encerrada.' });
    }

    const words = session.responses[slideIndex]?.words?.map((w) => w.word) || [];
    const effectiveApiKey = await resolveApiKey(req.user.id, apiKey);
    const { summary, warning } = await summarizeOpenResponses({ responses: words, apiKey: effectiveApiKey });
    res.json({ success: true, summary, warning: warning || null });
  } catch (error) {
    console.error('Erro na rota summarize:', error);
    res.status(500).json({ error: 'Falha ao gerar o resumo com IA.' });
  }
});

export default router;
