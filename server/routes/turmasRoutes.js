import express from 'express';
import {
  createTurma, listTurmas, getTurma, renameTurma, deleteTurma,
  listStudents, addStudents, removeStudent, getTurmaBoletim
} from '../services/store.js';

const router = express.Router();

// Mesmo motivo do asyncHandler em presentationsRoutes.js: sem isto, um erro
// dentro de um handler async fica sem resposta nenhuma até o proxy desistir
// sozinho, em vez de cair no tratador de erro genérico (ver server/index.js).
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', asyncHandler(async (req, res) => {
  res.json({ success: true, turmas: await listTurmas(req.user.id) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nome da turma é obrigatório.' });
  }
  res.json({ success: true, turma: await createTurma(req.user.id, name.trim()) });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nome da turma é obrigatório.' });
  }
  const turma = await renameTurma(req.user.id, req.params.id, name.trim());
  if (!turma) {
    return res.status(404).json({ error: 'Turma não encontrada.' });
  }
  res.json({ success: true, turma });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const deleted = await deleteTurma(req.user.id, req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Turma não encontrada.' });
  }
  res.json({ success: true });
}));

router.get('/:id/students', asyncHandler(async (req, res) => {
  const turma = await getTurma(req.user.id, req.params.id);
  if (!turma) {
    return res.status(404).json({ error: 'Turma não encontrada.' });
  }
  res.json({ success: true, students: await listStudents(req.user.id, req.params.id) });
}));

// Cadastro em lote: `students` é um array [{ name, email }] — o cliente já
// faz o parse do texto colado (ver TurmasModal.jsx, "Nome, e-mail" por
// linha) antes de mandar pra cá, o servidor só valida/normaliza e-mail
// (ver addStudents em store.js). Devolve a lista atualizada inteira, mais
// simples do que o cliente reconciliar um diff.
router.post('/:id/students', asyncHandler(async (req, res) => {
  const turma = await getTurma(req.user.id, req.params.id);
  if (!turma) {
    return res.status(404).json({ error: 'Turma não encontrada.' });
  }
  const { students } = req.body;
  if (!Array.isArray(students) || !students.length) {
    return res.status(400).json({ error: 'Envie ao menos um aluno (nome + e-mail).' });
  }
  const added = await addStudents(req.user.id, req.params.id, students);
  res.json({ success: true, added, students: await listStudents(req.user.id, req.params.id) });
}));

router.delete('/:id/students/:email', asyncHandler(async (req, res) => {
  const turma = await getTurma(req.user.id, req.params.id);
  if (!turma) {
    return res.status(404).json({ error: 'Turma não encontrada.' });
  }
  await removeStudent(req.user.id, req.params.id, decodeURIComponent(req.params.email));
  res.json({ success: true });
}));

// Boletim: desempenho de cada aluno acumulado entre TODAS as sessões ao
// vivo já encerradas desta turma (qualquer apresentação), ver
// upsertStudentStats/getTurmaBoletim em store.js.
router.get('/:id/boletim', asyncHandler(async (req, res) => {
  const turma = await getTurma(req.user.id, req.params.id);
  if (!turma) {
    return res.status(404).json({ error: 'Turma não encontrada.' });
  }
  res.json({ success: true, boletim: await getTurmaBoletim(req.user.id, req.params.id) });
}));

export default router;
