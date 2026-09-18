#!/usr/bin/env node
// Roda periodicamente via cron (ver instruções de setup) — checa se o
// backend está respondendo e manda um e-mail se estiver fora do ar. Só
// alerta depois de FAILURE_THRESHOLD falhas seguidas (guardado num arquivo
// de estado simples em disco), pra não disparar um e-mail por causa de um
// hiccup de rede de 1 minuto — só quando parece um problema real.
// NÃO cobre a máquina inteira ficando inacessível (energia/internet caindo):
// se a máquina cair, o próprio cron para de rodar junto. Pra isso, precisa
// de um monitor EXTERNO de verdade (ex.: UptimeRobot gratuito) — ver
// [[project_backend_deploy_pipeline]] na memória.
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, '..', '.healthcheck-fail-count');
const FAILURE_THRESHOLD = 3; // ~3 checagens seguidas falhando antes de alertar
const HEALTH_URL = process.env.HEALTH_URL || `http://localhost:${process.env.PORT || 3001}/api/health`;

function readFailCount() {
  try {
    return parseInt(fs.readFileSync(STATE_FILE, 'utf8'), 10) || 0;
  } catch {
    return 0;
  }
}

function writeFailCount(n) {
  fs.writeFileSync(STATE_FILE, String(n));
}

async function checkHealth() {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(10000) });
    return res.ok;
  } catch {
    return false;
  }
}

function notify(subject, body) {
  // Chama notify.js como processo separado (não importa o módulo direto) —
  // mesmo estilo best-effort, sem travar este script se o e-mail falhar.
  const child = spawn('node', [path.join(__dirname, 'notify.js'), subject, body], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit'
  });
  return new Promise((resolve) => child.on('exit', resolve));
}

async function main() {
  const healthy = await checkHealth();
  const failCount = readFailCount();

  if (healthy) {
    if (failCount >= FAILURE_THRESHOLD) {
      // Estava fora do ar e voltou — avisa que normalizou, pra não deixar
      // Sergio pensando que ainda está quebrado.
      await notify('Backend voltou ao ar', `${HEALTH_URL} voltou a responder normalmente.`);
    }
    writeFailCount(0);
    return;
  }

  const newCount = failCount + 1;
  writeFailCount(newCount);
  if (newCount === FAILURE_THRESHOLD) {
    await notify(
      'Backend fora do ar',
      `${HEALTH_URL} não respondeu em ${FAILURE_THRESHOLD} checagens seguidas.\n\nVerifique o servidor (pm2 list, pm2 logs posologia-backend).`
    );
  }
}

main().catch((err) => {
  console.error('healthcheck.js: erro inesperado:', err.message);
  process.exit(0);
});
