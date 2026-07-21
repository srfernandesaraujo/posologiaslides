import { auth } from './firebase';

// Em dev local, fica vazio e o proxy do Vite cuida do /api. Em produção
// (client no Cloudflare Pages, server em outro domínio no Render), aponta
// para a URL completa da API.
export const API_URL = import.meta.env.VITE_API_URL || '';

// Wrapper fino sobre fetch que anexa o ID token do Firebase (renovado
// automaticamente pelo SDK) como Bearer token em toda chamada à API.
export async function apiFetch(path, options = {}) {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  return fetch(`${API_URL}${path}`, { ...options, headers });
}
