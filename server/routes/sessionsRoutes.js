import express from 'express';
import { getSessionReport, getActiveSession } from '../sockets/sessionSocket.js';
import { summarizeOpenResponses } from '../services/aiService.js';
import { resolveApiKey } from './aiRoutes.js';

const router = express.Router();

// Relatório de desempenho da sessão ao vivo (dados reais coletados via socket.io)
router.get('/:pin/report', (req, res) => {
  const report = getSessionReport(req.params.pin);
  if (!report) {
    return res.status(404).json({ error: 'Sessão não encontrada ou já encerrada.' });
  }
  res.json({ success: true, report });
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
