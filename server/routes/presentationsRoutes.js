import express from 'express';
import {
  getFolderTree, getPresentation, savePresentation, deletePresentation, setFavorite, touchPresentation,
  createOrGetShareLink, getShareForPresentation, revokeShare, movePresentationToFolder
} from '../services/store.js';

const router = express.Router();

// Árvore de pastas/disciplinas com as apresentações salvas
router.get('/tree', async (req, res) => {
  res.json({ success: true, folders: await getFolderTree(req.user.id) });
});

// Apresentação completa (com slides) por id
router.get('/:id', async (req, res) => {
  const presentation = await getPresentation(req.params.id, req.user.id);
  if (!presentation) {
    return res.status(404).json({ error: 'Apresentação não encontrada.' });
  }
  res.json({ success: true, presentation });
});

// Cria ou atualiza (upsert) uma apresentação completa
router.post('/', async (req, res) => {
  const { id, title, description, slides } = req.body;
  if (!title || !Array.isArray(slides)) {
    return res.status(400).json({ error: 'title e slides são obrigatórios.' });
  }

  const saved = await savePresentation({ id, title, description, slides }, req.user.id);
  res.json({ success: true, presentation: saved });
});

// Marca/desmarca uma apresentação como favorita
router.patch('/:id/favorite', async (req, res) => {
  const { favorite } = req.body;
  const updated = await setFavorite(req.params.id, req.user.id, favorite);
  if (!updated) {
    return res.status(404).json({ error: 'Apresentação não encontrada.' });
  }
  res.json({ success: true, presentation: updated });
});

// Move a apresentação para outra pasta/disciplina
router.patch('/:id/folder', async (req, res) => {
  const { folderId } = req.body;
  if (!folderId) {
    return res.status(400).json({ error: 'folderId é obrigatório.' });
  }
  const result = await movePresentationToFolder(req.user.id, req.params.id, folderId);
  if (!result) {
    return res.status(404).json({ error: 'Apresentação ou pasta não encontrada.' });
  }
  res.json({ success: true });
});

// Registra que a apresentação foi aberta agora (para a aba "Recentes" da biblioteca)
router.post('/:id/touch', async (req, res) => {
  const updated = await touchPresentation(req.params.id, req.user.id);
  if (!updated) {
    return res.status(404).json({ error: 'Apresentação não encontrada.' });
  }
  res.json({ success: true });
});

router.delete('/:id', async (req, res) => {
  const deleted = await deletePresentation(req.params.id, req.user.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Apresentação não encontrada.' });
  }
  res.json({ success: true });
});

// Link público só-visualização — gerar/consultar/revogar. A URL completa não
// é montada aqui: o cliente já sabe a própria origem (window.location.origin).
router.post('/:id/share', async (req, res) => {
  const share = await createOrGetShareLink(req.params.id, req.user.id);
  if (!share) {
    return res.status(404).json({ error: 'Apresentação não encontrada.' });
  }
  res.json({ success: true, shareId: share.shareId });
});

router.get('/:id/share', async (req, res) => {
  const share = await getShareForPresentation(req.params.id, req.user.id);
  res.json({ success: true, shareId: share?.shareId || null });
});

router.delete('/:id/share', async (req, res) => {
  await revokeShare(req.params.id, req.user.id);
  res.json({ success: true });
});

export default router;
