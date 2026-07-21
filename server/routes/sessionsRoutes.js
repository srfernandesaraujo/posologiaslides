import express from 'express';
import { getSessionReport } from '../sockets/sessionSocket.js';

const router = express.Router();

// Relatório de desempenho da sessão ao vivo (dados reais coletados via socket.io)
router.get('/:pin/report', (req, res) => {
  const report = getSessionReport(req.params.pin);
  if (!report) {
    return res.status(404).json({ error: 'Sessão não encontrada ou já encerrada.' });
  }
  res.json({ success: true, report });
});

export default router;
