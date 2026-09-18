import { auth } from '../services/firebaseAdmin.js';
import { ensureUserProfile } from '../services/store.js';

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  // Diagnóstico temporário (apresentações travando pra sempre em "Carregando...",
  // resultando em 524 do Cloudflare) — mede exatamente quanto tempo cada etapa
  // leva pra achar qual delas trava, já que testes com token copiado à mão
  // deram inconclusivos.
  const t0 = Date.now();
  try {
    const decoded = await auth.verifyIdToken(token);
    console.log(`[auth-debug] verifyIdToken OK em ${Date.now() - t0}ms (${req.method} ${req.path})`);
    req.user = {
      id: decoded.uid,
      email: decoded.email,
      name: decoded.name || decoded.email,
      avatarUrl: decoded.picture || null
    };
    // Garante que o perfil e a estrutura padrão de pastas existam no primeiro acesso.
    const t1 = Date.now();
    await ensureUserProfile(req.user.id, req.user);
    console.log(`[auth-debug] ensureUserProfile OK em ${Date.now() - t1}ms (total ${Date.now() - t0}ms)`);
    next();
  } catch (error) {
    console.error(`[auth-debug] Falha em ${Date.now() - t0}ms na verificação do token do Firebase:`, error.message);
    return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  }
}
