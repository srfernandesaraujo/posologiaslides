import { auth } from './firebase';

// Wrapper fino sobre fetch que anexa o ID token do Firebase (renovado
// automaticamente pelo SDK) como Bearer token em toda chamada à API.
export async function apiFetch(path, options = {}) {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  return fetch(path, { ...options, headers });
}
