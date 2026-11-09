import express from 'express';
import { jsonBytes } from '../services/sharedChunks.js';
import {
  getFolderTree, getPresentation, savePresentation, setFavorite, touchPresentation,
  createOrGetShareLink, getShareForPresentation, revokeShare, movePresentationToFolder, movePresentationToSubfolder, renamePresentation,
  findInvalidNestedArrayPath, findOversizedSlide, findOversizedBlob, FIRESTORE_MAX_DOCUMENT_BYTES, prepareForSave,
  trashPresentation, restorePresentation, permanentlyDeletePresentation, emptyTrash, getTrash,
  listSessionReports, getSavedSessionReport
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
  res.json({ success: true, folders: await getFolderTree(req.user.id), sizeLimitBytes: FIRESTORE_MAX_DOCUMENT_BYTES });
}));

// Apresentações na lixeira (excluídas da biblioteca normal, ver getFolderTree)
router.get('/trash', asyncHandler(async (req, res) => {
  res.json({ success: true, presentations: await getTrash(req.user.id) });
}));

// Apresentação completa (com slides) por id
router.get('/:id', asyncHandler(async (req, res) => {
  // compact: slides com marcadores + sharedChunks (ver sharedChunks.js); o
  // cliente expande — assim cada bloco <style>/<script> repetido viaja uma vez só.
  const presentation = await getPresentation(req.params.id, req.user.id, { compact: true });
  if (!presentation) {
    return res.status(404).json({ error: 'Apresentação não encontrada.' });
  }
  res.json({ success: true, presentation });
}));

// Cria ou atualiza (upsert) uma apresentação completa
router.post('/', asyncHandler(async (req, res) => {
  const { id, title, description, slides, trashedSlides, sharedChunks, relatedPresentationId, relatedPresentationTitle, expectedUpdatedAt, force, sessionId, thumbnail } = req.body;
  if (!title || !Array.isArray(slides)) {
    return res.status(400).json({ error: 'title e slides são obrigatórios.' });
  }

  // Checa ANTES de tentar gravar — o Firestore recusa a mesma coisa, mas com
  // um erro genérico que não diz onde está o problema (ver comentário em
  // findInvalidNestedArrayPath, store.js).
  const invalidPath = findInvalidNestedArrayPath(slides) || (Array.isArray(trashedSlides) ? findInvalidNestedArrayPath(trashedSlides, 'trashedSlides') : null);
  if (invalidPath) {
    return res.status(400).json({ error: `Dado inválido em "${invalidPath}": array dentro de array não é permitido.` });
  }

  // Firestore recusa qualquer documento acima de 1 MiB, sem exceção — ver
  // comentário em findOversizedSlide (store.js). Aponta o slide culpado em
  // vez de deixar isso virar de novo um mistério de horas (Aula 08,
  // 2026-08-07: um slide de 4,5 MB vindo de "Importar Pasta Inteira`).
  // trashedSlides entra só no total (extraBytes) — a lixeira de slides tem
  // limite próprio de itens no cliente, dificilmente é ela a culpada.
  //
  // O tamanho é medido DEPOIS de compactar os blocos <style>/<script>
  // repetidos entre slides (prepareSlidesForStorage, ver sharedChunks.js) —
  // é o que de fato vai pro documento. Os chunks e a lixeira entram como
  // extraBytes porque moram no mesmo documento.
  //
  // Imagens/fontes grandes (>= 16 KB) não moram no documento: vão pra
  // documentos próprios, cada um com seu limite de 1 MiB (prepareForSave).
  // Por isso o limite do documento principal só pega o que sobra dos slides, e
  // há uma checagem à parte pra um bloco que sozinho passa de 1 MiB.
  let prepared;
  try {
    prepared = await prepareForSave(req.user.id, id || null, slides, trashedSlides, sharedChunks);
  } catch (err) {
    // O cliente reage a `code` reenviando a apresentação completa.
    if (err && err.code === 'CHUNKS_MISSING') {
      return res.status(400).json({ error: err.message, code: err.code, missingChunkIds: err.missingChunkIds });
    }
    throw err;
  }
  const extraBytes = jsonBytes(prepared.trashedSlides) + jsonBytes(prepared.sharedChunks);
  const oversized = findOversizedSlide(prepared.slides, extraBytes);
  if (oversized) {
    const totalMb = (oversized.totalBytes / 1024 / 1024).toFixed(1);
    const biggestKb = (oversized.biggest.bytes / 1024).toFixed(0);
    return res.status(400).json({
      error: `Apresentação muito grande (${totalMb} MB — o limite do Firestore é 1 MB por documento, já descontando imagens/fontes e blocos CSS/JS, que são guardados à parte). O slide "${oversized.biggest.title}" (posição ${oversized.biggest.index + 1}) é o maior, com ${biggestKb} KB de texto/HTML. Divida ou simplifique esse slide.`
    });
  }
  const oversizedBlob = findOversizedBlob(prepared);
  if (oversizedBlob) {
    const mb = (oversizedBlob.bytes / 1024 / 1024).toFixed(1);
    return res.status(400).json({
      error: `Uma imagem ou fonte embutida no slide "${oversizedBlob.title}" (posição ${oversizedBlob.index + 1}) tem ${mb} MB sozinha — acima do limite de 8 MB por imagem. Comprima ou reduza essa imagem.`
    });
  }

  let result;
  try {
    result = await savePresentation(
      { id, title, description, prepared, relatedPresentationId, relatedPresentationTitle, expectedUpdatedAt, force, sessionId, thumbnail },
      req.user.id
    );
  } catch (err) {
    if (err && err.code === 'CHUNKS_MISSING') {
      return res.status(400).json({ error: err.message, code: err.code, missingChunkIds: err.missingChunkIds });
    }
    throw err;
  }
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

// Move a apresentação para uma subpasta específica dentro de uma disciplina
router.patch('/:id/subfolder', asyncHandler(async (req, res) => {
  const { subfolderId } = req.body;
  if (!subfolderId) {
    return res.status(400).json({ error: 'subfolderId é obrigatório.' });
  }
  const result = await movePresentationToSubfolder(req.user.id, req.params.id, subfolderId);
  if (!result) {
    return res.status(404).json({ error: 'Apresentação ou subpasta não encontrada.' });
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

// Restaura uma apresentação da lixeira
router.post('/:id/restore', asyncHandler(async (req, res) => {
  const restored = await restorePresentation(req.params.id, req.user.id);
  if (!restored) {
    return res.status(404).json({ error: 'Apresentação não encontrada na lixeira.' });
  }
  res.json({ success: true });
}));

// Esvazia a lixeira inteira (apaga definitivamente todas as apresentações
// marcadas como `trashed`) — precisa vir ANTES de DELETE /:id, senão
// "trash" seria interpretado como um id de apresentação.
router.delete('/trash', asyncHandler(async (req, res) => {
  const count = await emptyTrash(req.user.id);
  res.json({ success: true, count });
}));

// Exclusão normal: soft-delete — a apresentação some da biblioteca e vai
// pra lixeira (ver getFolderTree/getTrash em store.js), não é apagada de
// verdade ainda.
router.delete('/:id', asyncHandler(async (req, res) => {
  const trashed = await trashPresentation(req.params.id, req.user.id);
  if (!trashed) {
    return res.status(404).json({ error: 'Apresentação não encontrada.' });
  }
  res.json({ success: true });
}));

// Exclusão definitiva — só a partir da lixeira, apaga o documento de vez.
router.delete('/:id/permanent', asyncHandler(async (req, res) => {
  const deleted = await permanentlyDeletePresentation(req.params.id, req.user.id);
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

// Relatórios finais de sessões ao vivo já encerradas desta apresentação
// (ranking + desempenho por assunto, ver POST /api/sessions/:pin/end) —
// lista, mais recentes primeiro.
router.get('/:id/sessionReports', asyncHandler(async (req, res) => {
  const reports = await listSessionReports(req.user.id, req.params.id);
  res.json({ success: true, reports });
}));

router.get('/:id/sessionReports/:reportId', asyncHandler(async (req, res) => {
  const report = await getSavedSessionReport(req.user.id, req.params.id, req.params.reportId);
  if (!report) {
    return res.status(404).json({ error: 'Relatório não encontrado.' });
  }
  res.json({ success: true, report });
}));

router.delete('/:id/share', asyncHandler(async (req, res) => {
  await revokeShare(req.params.id, req.user.id);
  res.json({ success: true });
}));

export default router;
