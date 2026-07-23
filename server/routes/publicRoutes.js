import express from 'express';
import { getPresentationByShareId, toPublicPresentation } from '../services/store.js';

// Rota pública (sem requireAuth — montada assim de propósito em index.js):
// serve uma apresentação só-visualização pra quem tiver o link, sem exigir
// login. Nunca confia em nada vindo do cliente além do próprio shareId — o
// usuário/apresentação dona do link vêm do doc gravado em `shares`.
const router = express.Router();

router.get('/:shareId', async (req, res) => {
  const presentation = await getPresentationByShareId(req.params.shareId);
  if (!presentation) {
    return res.status(404).json({ error: 'Link inválido ou apresentação não encontrada.' });
  }
  res.json({ success: true, presentation: toPublicPresentation(presentation) });
});

export default router;
