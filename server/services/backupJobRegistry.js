// Registro em memória dos jobs de backup/restore em andamento — ver
// backupRoutes.js. Existe porque a resposta NDJSON em streaming (conexão
// HTTP aberta por dezenas de segundos) se mostrou pouco confiável atrás do
// Cloudflare Tunnel do usuário: net::ERR_QUIC_PROTOCOL_ERROR E, depois de
// desligar HTTP/3 no Cloudflare pra testar, net::ERR_HTTP2_PROTOCOL_ERROR —
// o mesmo endpoint falhando com os DOIS protocolos descarta "bug específico
// do QUIC" e aponta pra algo na forma como cloudflared/Cloudflare relaiam
// uma resposta chunked/de streaming por múltiplos saltos (achados de busca:
// cloudflared é conhecido por ter comportamento inconsistente com streaming
// via Content-Type customizado tipo application/x-ndjson). Trocado por
// job assíncrono + polling — cada requisição de status é curta e completa
// (request/response normal), o padrão mais compatível com qualquer proxy/
// túnel/CDN que existe, em vez de depender de uma conexão só ficar aberta
// o tempo todo.
//
// Em memória (não Firestore/Redis) pelo mesmo motivo do downloadRegistry.js:
// processo único no servidor doméstico do usuário, uso ocasional/manual, não
// precisa sobreviver a um restart.
import crypto from 'crypto';

const registry = new Map(); // jobId -> { userId, status, progress, result, error, createdAt }
const TTL_MS = 30 * 60 * 1000; // job nunca consultado de novo (aba fechada no meio) não fica pra sempre

export function createJob(userId) {
  const id = crypto.randomUUID();
  registry.set(id, { userId, status: 'running', progress: null, result: null, error: null, createdAt: Date.now() });
  return id;
}

export function updateJobProgress(jobId, evt) {
  const job = registry.get(jobId);
  if (job) job.progress = evt;
}

export function finishJob(jobId, result) {
  const job = registry.get(jobId);
  if (job) { job.status = 'done'; job.result = result; }
}

export function failJob(jobId, error) {
  const job = registry.get(jobId);
  if (job) { job.status = 'error'; job.error = error; }
}

// Escopado por userId (não só o id aleatório) — mesma proteção que
// downloadRegistry.js já usa, pra um usuário nunca conseguir ler o
// progresso/resultado do job de backup de outra conta adivinhando/vazando um id.
export function getJob(jobId, userId) {
  const job = registry.get(jobId);
  if (!job || job.userId !== userId) return null;
  return job;
}

setInterval(() => {
  const now = Date.now();
  for (const [id, job] of registry) {
    if (now - job.createdAt > TTL_MS) registry.delete(id);
  }
}, 5 * 60 * 1000).unref();
