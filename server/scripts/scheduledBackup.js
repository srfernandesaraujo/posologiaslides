// Backup agendado (cron/systemd timer — ver server/scripts/README.md) de
// TODOS os usuários, reaproveitando exatamente a mesma lógica de
// createBackup() já usada pelo botão "Fazer Backup" do app (backupService.js)
// — mesmo formato de .zip, só que disparado por fora de uma requisição HTTP e
// salvo direto em disco (destPath) em vez de virar um download de uso único.
//
// Roda como processo avulso (não dentro do servidor Express) porque backup
// completo de todos os usuários pode demorar — não faz sentido acoplar isso
// ao ciclo de vida do processo do pm2 que serve a API.
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, getBucket } from '../services/firebaseAdmin.js';
import { createBackup } from '../services/backupService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Fora do repo por padrão seria mais "correto" (não é código), mas dentro de
// server/backups mantém tudo num lugar só nesta máquina — BACKUP_DIR no .env
// sobrescreve se o usuário preferir outro disco/pasta.
const BACKUP_ROOT = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
// Quantos backups mais recentes manter POR USUÁRIO — os mais antigos além
// disso são apagados a cada execução (backup diário + retenção 7 = ~1 semana
// de histórico, ajustável via .env sem editar código).
const RETENTION_PER_USER = Number(process.env.BACKUP_RETENTION || 7);

// Por padrão o .zip só fica no disco local (BACKUP_ROOT) — protege contra
// "apaguei sem querer"/bug do app, mas não contra a própria máquina ou disco
// morrer. Ligar isto sobe uma cópia extra pro MESMO bucket do Cloud Storage
// que o app já usa (credencial de serviço já configurada, sem OAuth novo
// nenhum) num prefixo isolado dos arquivos de mídia dos usuários.
const OFFSITE_UPLOAD = process.env.BACKUP_OFFSITE_UPLOAD === 'true';
const OFFSITE_PREFIX = '_system-backups';

function pruneOldBackups(userDir) {
  const files = fs.readdirSync(userDir)
    .filter((f) => f.endsWith('.zip'))
    .map((f) => ({ f, mtime: fs.statSync(path.join(userDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const { f } of files.slice(RETENTION_PER_USER)) {
    fs.unlinkSync(path.join(userDir, f));
    console.log(`[backup] removido (retenção): ${path.join(userDir, f)}`);
  }
}

async function uploadOffsite(bucket, userId, destPath) {
  const remotePath = `${OFFSITE_PREFIX}/${userId}/${path.basename(destPath)}`;
  await bucket.upload(destPath, { destination: remotePath });

  const [files] = await bucket.getFiles({ prefix: `${OFFSITE_PREFIX}/${userId}/` });
  const sorted = files
    .map((f) => ({ f, time: new Date(f.metadata.timeCreated || 0).getTime() }))
    .sort((a, b) => b.time - a.time);
  for (const { f } of sorted.slice(RETENTION_PER_USER)) {
    await f.delete().catch(() => {});
    console.log(`[backup] removido da nuvem (retenção): ${f.name}`);
  }
}

async function backupAllUsers() {
  const bucket = getBucket();
  const usersSnap = await db.collection('users').get();
  console.log(`[backup] ${usersSnap.size} usuário(s) encontrados — destino: ${BACKUP_ROOT}`);

  let ok = 0;
  let failed = 0;

  for (const doc of usersSnap.docs) {
    const userId = doc.id;
    const user = { id: userId, ...doc.data() };
    const label = user.email || userId;
    const userDir = path.join(BACKUP_ROOT, userId);
    fs.mkdirSync(userDir, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const destPath = path.join(userDir, `backup-${stamp}.zip`);

    try {
      const result = await createBackup({ userId, user, bucket, destPath });
      console.log(`[backup] OK — ${label} → ${result.filePath} (${(result.size / 1024).toFixed(0)} KB)`);
      pruneOldBackups(userDir);

      if (OFFSITE_UPLOAD) {
        try {
          await uploadOffsite(bucket, userId, destPath);
          console.log(`[backup] enviado pra nuvem (offsite) — ${label}`);
        } catch (offsiteErr) {
          console.error(`[backup] falhou upload offsite — ${label}:`, offsiteErr.message);
        }
      }

      ok += 1;
    } catch (err) {
      console.error(`[backup] FALHOU — ${label}:`, err.message);
      failed += 1;
    }
  }

  console.log(`[backup] Concluído: ${ok} ok, ${failed} falharam.`);
  if (failed > 0) process.exitCode = 1;
}

backupAllUsers().catch((err) => {
  console.error('[backup] erro fatal:', err);
  process.exitCode = 1;
});
