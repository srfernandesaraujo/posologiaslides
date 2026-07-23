import express from 'express';
import { createFolder, renameFolder, deleteFolder } from '../services/store.js';

const router = express.Router();

// Cria uma nova pasta/disciplina na barra lateral da biblioteca
router.post('/', async (req, res) => {
  const { name, color } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nome da pasta é obrigatório.' });
  }
  const folder = await createFolder(req.user.id, name.trim(), color);
  res.json({ success: true, folder });
});

router.patch('/:id', async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nome da pasta é obrigatório.' });
  }
  const folder = await renameFolder(req.user.id, req.params.id, name.trim());
  if (!folder) {
    return res.status(404).json({ error: 'Pasta não encontrada.' });
  }
  res.json({ success: true, folder });
});

router.delete('/:id', async (req, res) => {
  const result = await deleteFolder(req.user.id, req.params.id);
  if (result?.error === 'default') {
    return res.status(400).json({ error: 'Não é possível excluir a pasta padrão.' });
  }
  res.json({ success: true });
});

export default router;
