import express from 'express';
import { getActiveSession } from '../sockets/sessionSocket.js';

// Rota pública (sem requireAuth — aluno nunca está logado): consultada pelo
// celular do aluno ANTES de mostrar o formulário de entrada (ver
// StudentJoin.jsx), só pra saber se esta sessão exige e-mail cadastrado
// (turma vinculada, ver create_session em sessionSocket.js) ou só nome
// (fluxo de sempre, sem turma). Nunca expõe nada sigiloso da sessão (nome
// dos alunos já dentro, respostas, gabarito) — só o mínimo pra montar o
// formulário certo.
const router = express.Router();

router.get('/:pin/meta', (req, res) => {
  const session = getActiveSession(req.params.pin);
  if (!session) {
    return res.status(404).json({ error: 'Sessão não encontrada ou encerrada. Verifique o PIN.' });
  }
  res.json({ success: true, title: session.title, requiresEmail: !!session.turmaId });
});

export default router;
