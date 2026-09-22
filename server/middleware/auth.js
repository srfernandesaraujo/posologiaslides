import { auth } from '../services/firebaseAdmin.js';
import { ensureUserProfile } from '../services/store.js';

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  try {
    // DIAGNÓSTICO TEMPORÁRIO (setembro/2026, ver X-Server-Time-Ms em index.js)
    // — separa quanto do tempo total no servidor é verificação de token
    // (Firebase Auth) vs. garantir o perfil (1 leitura no Firestore), pra
    // achar qual das duas (ou nenhuma — sobrando pra getFolderTree) é o
    // gargalo. Remover junto do outro diagnóstico depois de identificado.
    const verifyStart = Date.now();
    const decoded = await auth.verifyIdToken(token);
    const verifyIdTokenMs = Date.now() - verifyStart;
    req.user = {
      id: decoded.uid,
      email: decoded.email,
      name: decoded.name || decoded.email,
      avatarUrl: decoded.picture || null
    };
    // Garante que o perfil e a estrutura padrão de pastas existam no primeiro acesso.
    const profileStart = Date.now();
    await ensureUserProfile(req.user.id, req.user);
    req._authTimings = { verifyIdTokenMs, ensureUserProfileMs: Date.now() - profileStart };
    next();
  } catch (error) {
    console.error('Falha na verificação do token do Firebase:', error.message);
    return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  }
}
