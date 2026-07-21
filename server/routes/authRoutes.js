import express from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// O login em si acontece no cliente via Firebase Authentication (signInWithPopup).
// requireAuth já verifica o token e garante o perfil/estrutura padrão do usuário;
// esta rota só devolve os dados para a UI.
router.get('/me', requireAuth, (req, res) => {
  res.json({ success: true, user: req.user });
});

export default router;
