// Registro em memória de arquivos de backup gerados localmente (ver
// backupService.js createBackup) esperando o cliente baixar. O zip é
// montado no disco do servidor (os.tmpdir()) e fica pronto pra download —
// esse registro é só a ponte entre "terminei de gerar" (POST /create,
// resposta NDJSON) e "aqui está o arquivo" (GET /download/:id, resposta
// binária) sem reexpor o caminho real do arquivo no disco pro cliente.
//
// Em memória (não Firestore/Redis) de propósito: é um app de processo único
// no servidor doméstico do usuário, o registro não precisa sobreviver a um
// restart, e um Map é suficiente pra volume de uso (backup manual, ocasional).
import fs from 'fs';
import crypto from 'crypto';

const registry = new Map(); // downloadId -> { filePath, userId, fileName, createdAt }
const TTL_MS = 15 * 60 * 1000; // se o usuário nunca clicar "salvar", não deixa lixo pra sempre

export function registerDownload({ filePath, userId, fileName }) {
  const id = crypto.randomUUID();
  registry.set(id, { filePath, userId, fileName, createdAt: Date.now() });
  return id;
}

// Uso único: a entrada some do registro assim que consumida (baixada ou
// expirada), então o mesmo link não serve pra baixar duas vezes — evita um
// downloadId antigo continuar apontando pra um arquivo já removido do disco.
export function consumeDownload(id, userId) {
  const entry = registry.get(id);
  if (!entry || entry.userId !== userId) return null;
  registry.delete(id);
  return entry;
}

// Varredura periódica (best-effort) — limpa backups gerados mas nunca
// baixados (ex.: usuário fechou a aba antes de salvar o arquivo).
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of registry) {
    if (now - entry.createdAt > TTL_MS) {
      fs.promises.unlink(entry.filePath).catch(() => {});
      registry.delete(id);
    }
  }
}, 5 * 60 * 1000).unref();
