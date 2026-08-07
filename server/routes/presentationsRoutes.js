import express from 'express';
import {
  getFolderTree, getPresentation, savePresentation, deletePresentation, setFavorite, touchPresentation,
  createOrGetShareLink, getShareForPresentation, revokeShare, movePresentationToFolder, renamePresentation,
  findInvalidNestedArrayPath, findOversizedSlide
} from '../services/store.js';

const router = express.Router();

// Express 4 não encaminha sozinho uma promise rejeitada de um handler async
// pro middleware de erro — sem isto, um erro (ex.: Firestore recusando o
// dado) deixava a requisição pendurada SEM RESPOSTA NENHUMA até o proxy
// (Cloudflare) desistir sozinho depois de 100s (524), que o navegador então
// reporta como bloqueio de CORS — nada a ver com CORS de verdade. Aconteceu
// de verdade em produção em 2026-08-07 (ver findInvalidNestedArrayPath em
// store.js pro erro específico que disparou isso). Todo handler async desta
// rota passa por aqui — é o caminho crítico de autosave, o mais caro de
// deixar travar em silêncio.
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Árvore de pastas/disciplinas com as apresentações salvas
router.get('/tree', asyncHandler(async (req, res) => {
  res.json({ success: true, folders: await getFolderTree(req.user.id) });
}));

// Apresentação completa (com slides) por id
router.get('/:id', asyncHandler(async (req, res) => {
  const presentation = await getPresentation(req.params.id, req.user.id);
  if (!presentation) {
    return res.status(404).json({ error: 'Apresentação não encontrada.' });
  }
  res.json({ success: true, presentation });
}));

// Cria ou atualiza (upsert) uma apresentação completa
router.post('/', asyncHandler(async (req, res) => {
  const { id, title, description, slides, relatedPresentationId, relatedPresentationTitle, expectedUpdatedAt, force, sessionId } = req.body;
  if (!title || !Array.isArray(slides)) {
    return res.status(400).json({ error: 'title e slides são obrigatórios.' });
  }

  // Checa ANTES de tentar gravar — o Firestore recusa a mesma coisa, mas com
  // um erro genérico que não diz onde está o problema (ver comentário em
  // findInvalidNestedArrayPath, store.js).
  const invalidPath = findInvalidNestedArrayPath(slides);
  if (invalidPath) {
    return res.status(400).json({ error: `Dado inválido em "${invalidPath}": array dentro de array não é permitido.` });
  }

  // Firestore recusa qualquer documento acima de 1 MiB, sem exceção — ver
  // comentário em findOversizedSlide (store.js). Aponta o slide culpado em
  // vez de deixar isso virar de novo um mistério de horas (Aula 08,
  // 2026-08-07: um slide de 4,5 MB vindo de "Importar Pasta Inteira`).
  const oversized = findOversizedSlide(slides);
  if (oversized) {
    const totalMb = (oversized.totalBytes / 1024 / 1024).toFixed(1);
    const biggestKb = (oversized.biggest.bytes / 1024).toFixed(0);
    return res.status(400).json({
      error: `Apresentação muito grande (${totalMb} MB — o limite do Firestore é 1 MB). O slide "${oversized.biggest.title}" (posição ${oversized.biggest.index + 1}) sozinho tem ${biggestKb} KB — provavelmente uma imagem colada direto em vez de enviada como arquivo. Apague ou refaça esse slide.`
    });
  }

  const result = await savePresentation(
    { id, title, description, slides, relatedPresentationId, relatedPresentationTitle, expectedUpdatedAt, force, sessionId },
    req.user.id
  );
  // Ver comentário em store.js#savePresentation: conflito de edição concorrente
  // (outra aba/dispositivo salvou depois que este cliente carregou). O cliente
  // decide o que fazer — nunca sobrescrevemos silenciosamente aqui.
  if (result.conflict) {
    return res.status(409).json({ success: false, conflict: true, presentation: result.presentation });
  }
  res.json({ success: true, presentation: result.presentation });
}));

// Renomeia apenas o título da apresentação
router.patch('/:id/title', asyncHandler(async (req, res) => {
  const { title } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'title é obrigatório.' });
  }
  const updated = await renamePresentation(req.params.id, req.user.id, title);
  if (!updated) {
    return res.status(404).json({ error: 'Apresentação não encontrada.' });
  }
  res.json({ success: true, presentation: updated });
}));

// Marca/desmarca uma apresentação como favorita
router.patch('/:id/favorite', asyncHandler(async (req, res) => {
  const { favorite } = req.body;
  const updated = await setFavorite(req.params.id, req.user.id, favorite);
  if (!updated) {
    return res.status(404).json({ error: 'Apresentação não encontrada.' });
  }
  res.json({ success: true, presentation: updated });
}));

// Move a apresentação para outra pasta/disciplina
router.patch('/:id/folder', asyncHandler(async (req, res) => {
  const { folderId } = req.body;
  if (!folderId) {
    return res.status(400).json({ error: 'folderId é obrigatório.' });
  }
  const result = await movePresentationToFolder(req.user.id, req.params.id, folderId);
  if (!result) {
    return res.status(404).json({ error: 'Apresentação ou pasta não encontrada.' });
  }
  res.json({ success: true });
}));

// Registra que a apresentação foi aberta agora (para a aba "Recentes" da biblioteca)
router.post('/:id/touch', asyncHandler(async (req, res) => {
  const updated = await touchPresentation(req.params.id, req.user.id);
  if (!updated) {
    return res.status(404).json({ error: 'Apresentação não encontrada.' });
  }
  res.json({ success: true });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const deleted = await deletePresentation(req.params.id, req.user.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Apresentação não encontrada.' });
  }
  res.json({ success: true });
}));

// Link público só-visualização — gerar/consultar/revogar. A URL completa não
// é montada aqui: o cliente já sabe a própria origem (window.location.origin).
router.post('/:id/share', asyncHandler(async (req, res) => {
  const share = await createOrGetShareLink(req.params.id, req.user.id);
  if (!share) {
    return res.status(404).json({ error: 'Apresentação não encontrada.' });
  }
  res.json({ success: true, shareId: share.shareId });
}));

router.get('/:id/share', asyncHandler(async (req, res) => {
  const share = await getShareForPresentation(req.params.id, req.user.id);
  res.json({ success: true, shareId: share?.shareId || null });
}));

router.delete('/:id/share', asyncHandler(async (req, res) => {
  await revokeShare(req.params.id, req.user.id);
  res.json({ success: true });
}));

export default router;
