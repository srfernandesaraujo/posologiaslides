import { apiFetch } from './api';

// Backend roda a operação em segundo plano e devolve um jobId na hora — o
// progresso é lido por polling em /api/backup/status/:jobId (ver
// backupRoutes.js) em vez de uma resposta NDJSON em streaming (conexão HTTP
// aberta por dezenas de segundos). Trocado depois de confirmar em produção,
// atrás do Cloudflare Tunnel do servidor doméstico, que a versão em
// streaming falhava com net::ERR_QUIC_PROTOCOL_ERROR e, mesmo desligando
// HTTP/3 no Cloudflare pra testar, com net::ERR_HTTP2_PROTOCOL_ERROR — o
// mesmo endpoint falhando nos dois protocolos descartou bug específico de
// QUIC. Cada poll é uma requisição curta e completa (JSON normal), o padrão
// mais compatível com qualquer proxy/túnel/CDN, em vez de depender de uma
// conexão só ficar aberta o tempo todo.
const POLL_INTERVAL_MS = 1000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollJob(jobId, onEvent) {
  // Evita chamar onEvent de novo com o EXATO mesmo evento (comum: o poll
  // pega o mesmo estágio de progresso duas vezes seguidas antes dele
  // avançar) — comparação simples por JSON, o objeto de progresso é pequeno.
  let lastProgressJson = null;
  for (;;) {
    const res = await apiFetch(`/api/backup/status/${jobId}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Falha ao consultar o progresso da operação.');
    }
    const job = await res.json();

    if (job.progress) {
      const json = JSON.stringify(job.progress);
      if (json !== lastProgressJson) {
        lastProgressJson = json;
        onEvent(job.progress);
      }
    }

    if (job.status === 'done') return job.result;
    if (job.status === 'error') throw new Error(job.error?.message || 'Falha na operação de backup.');

    await wait(POLL_INTERVAL_MS);
  }
}

async function runJobOperation(path, options, onEvent) {
  const res = await apiFetch(path, options);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Falha ao iniciar a operação de backup.');
  }
  const { jobId } = await res.json();
  return pollJob(jobId, onEvent);
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
  const result = await runJobOperation('/api/backup/create', { method: 'POST' }, onEvent);
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
// servidor como multipart, que processa e devolve progresso via polling
// (mesmo formato do create).
export function restoreBackup(file, onEvent) {
  const formData = new FormData();
  formData.append('backupFile', file);
  return runJobOperation('/api/backup/restore', { method: 'POST', body: formData }, onEvent);
}
