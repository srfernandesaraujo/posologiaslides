import { apiFetch } from './api';

// Backend responde em NDJSON (uma linha JSON por evento de progresso) via
// chunked transfer, não um JSON só no final — empacotar/restaurar uma conta
// com bastante mídia pode levar um tempo, e um spinner cego é pior UX que
// mostrar o estágio atual (ver backupRoutes.js).
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

async function runNdjsonOperation(path, options, onEvent) {
  const res = await apiFetch(path, options);
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
    throw new Error(lastEvent.message || 'Falha na operação de backup.');
  }
  return lastEvent;
}

// Dispara o download de fato no navegador a partir de um Blob já em memória
// — mesmo truque de sempre (object URL + <a download> clicado via script):
// funciona em qualquer navegador moderno sem precisar de plugin nenhum, e
// deixa o usuário escolher onde salvar (o navegador é quem decide se
// pergunta o local ou salva direto na pasta de downloads padrão).
function triggerBrowserDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Gera o backup no servidor (progresso via onEvent) e, assim que pronto,
// baixa o arquivo automaticamente pelo navegador — o usuário escolhe onde
// guardar (Google Drive, pasta local, pendrive, o que quiser: não é mais o
// app que decide, é só um arquivo .zip comum).
export async function createBackup(onEvent) {
  const result = await runNdjsonOperation('/api/backup/create', { method: 'POST' }, onEvent);
  if (!result?.downloadId) return result;

  const downloadRes = await apiFetch(`/api/backup/download/${result.downloadId}`);
  if (!downloadRes.ok) {
    const data = await downloadRes.json().catch(() => ({}));
    throw new Error(data.error || 'Backup gerado, mas falhou ao baixar o arquivo.');
  }
  const blob = await downloadRes.blob();
  triggerBrowserDownload(blob, result.fileName);
  return result;
}

// `file` é um File escolhido pelo usuário (<input type="file">) — sobe pro
// servidor como multipart, que processa e devolve progresso via NDJSON
// (mesmo formato do create).
export function restoreBackup(file, onEvent) {
  const formData = new FormData();
  formData.append('backupFile', file);
  return runNdjsonOperation('/api/backup/restore', { method: 'POST', body: formData }, onEvent);
}
