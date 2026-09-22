import { auth } from '../services/firebaseAdmin.js';
import { ensureUserProfile } from '../services/store.js';

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  try {
    const decoded = await auth.verifyIdToken(token);
    req.user = {
      id: decoded.uid,
      email: decoded.email,
      name: decoded.name || decoded.email,
      avatarUrl: decoded.picture || null
    };
    // Garante que o perfil e a estrutura padrão de pastas existam no primeiro acesso.
    await ensureUserProfile(req.user.id, req.user);
    next();
  } catch (error) {
    console.error('Falha na verificação do token do Firebase:', error.message);
    return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  }
}
