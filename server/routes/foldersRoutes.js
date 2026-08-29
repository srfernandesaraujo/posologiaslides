import express from 'express';
import {
  createFolder, renameFolder, deleteFolder,
  createSubfolder, renameSubfolder, deleteSubfolder
} from '../services/store.js';

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

// Cria uma subpasta (unidade/assunto) dentro de uma disciplina
router.post('/:folderId/subfolders', async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nome da subpasta é obrigatório.' });
  }
  const subfolder = await createSubfolder(req.user.id, req.params.folderId, name.trim());
  if (!subfolder) {
    return res.status(404).json({ error: 'Disciplina não encontrada.' });
  }
  res.json({ success: true, subfolder });
});

router.patch('/:folderId/subfolders/:subfolderId', async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nome da subpasta é obrigatório.' });
  }
  const subfolder = await renameSubfolder(req.user.id, req.params.subfolderId, name.trim());
  if (!subfolder) {
    return res.status(404).json({ error: 'Subpasta não encontrada.' });
  }
  res.json({ success: true, subfolder });
});

router.delete('/:folderId/subfolders/:subfolderId', async (req, res) => {
  const result = await deleteSubfolder(req.user.id, req.params.subfolderId);
  if (!result) {
    return res.status(404).json({ error: 'Subpasta não encontrada.' });
  }
  if (result.error === 'default') {
    return res.status(400).json({ error: 'Não é possível excluir a subpasta padrão.' });
  }
  if (result.error === 'last') {
    return res.status(400).json({ error: 'A disciplina precisa manter ao menos uma subpasta.' });
  }
  res.json({ success: true });
});

export default router;
