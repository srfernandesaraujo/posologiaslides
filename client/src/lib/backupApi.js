import { apiFetch } from './api';
import { getDriveAccessToken, invalidateDriveAccessToken } from './googleDriveAuth';

// Backend responde em NDJSON (uma linha JSON por evento de progresso) via
// chunked transfer, não um JSON só no final — backup/restore de contas com
// bastante mídia pode levar minutos, e um spinner cego por tanto tempo é pior
// UX que mostrar o estágio atual (ver backupRoutes.js).
async function readNdjsonStream(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) onEvent(JSON.parse(line));
    }
  }
  const rest = buffer.trim();
  if (rest) onEvent(JSON.parse(rest));
}

// Chamadas ao /api/backup/* precisam de DOIS tokens: o Bearer normal
// (Firebase ID token, já anexado por apiFetch) pra autenticar com o nosso
// backend, e o access token OAuth do Google (escopo drive.file) pra o
// backend conseguir falar com a Drive API em nome do usuário — este último
// vai num header próprio, nunca persiste no servidor (ver backupRoutes.js).
async function runNdjsonOperation(path, { method = 'POST', body } = {}, onEvent) {
  const token = await getDriveAccessToken();
  const res = await apiFetch(path, {
    method,
    headers: {
      'X-Google-Access-Token': token,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Falha ao iniciar a operação de backup.');
  }

  let lastEvent = null;
  await readNdjsonStream(res, (evt) => {
    lastEvent = evt;
    onEvent(evt);
  });

  if (lastEvent?.type === 'error') {
    if (lastEvent.code === 'drive_token_expired') invalidateDriveAccessToken();
    throw new Error(lastEvent.message || 'Falha na operação de backup.');
  }
  return lastEvent;
}

export async function listBackups() {
  const token = await getDriveAccessToken();
  const res = await apiFetch('/api/backup/list', {
    headers: { 'X-Google-Access-Token': token }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Falha ao listar backups salvos no Drive.');
  return data;
}

export function createBackup(onEvent) {
  return runNdjsonOperation('/api/backup/create', {}, onEvent);
}

export function restoreBackup(fileId, onEvent) {
  return runNdjsonOperation('/api/backup/restore', { body: { fileId } }, onEvent);
}
