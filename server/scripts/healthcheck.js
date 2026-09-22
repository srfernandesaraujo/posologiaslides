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
//
// Também checa LENTIDÃO (não só fora-do-ar), mesmo debounce de N checagens
// seguidas: achado real em 2026-09-22, a biblioteca ficou levando ~30s pra
// carregar (não fora do ar, só muito lenta) por causa da internet da casa
// degradada — só descoberto manualmente, medindo à mão com o DevTools. Ver
// [[project_library_loading_performance]].
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HEALTH_URL = process.env.HEALTH_URL || `http://localhost:${process.env.PORT || 3001}/api/health`;
const LATENCY_URL = process.env.LATENCY_URL || HEALTH_URL.replace(/\/health\/?$/, '/health/latency');

const FAIL_STATE_FILE = path.join(__dirname, '..', '.healthcheck-fail-count');
const FAILURE_THRESHOLD = 3; // ~3 checagens seguidas falhando antes de alertar

const SLOW_STATE_FILE = path.join(__dirname, '..', '.healthcheck-slow-count');
const SLOW_THRESHOLD_COUNT = 3; // ~15min de lentidão sustentada antes de alertar
// Baseline saudável observado em produção: consulta mínima ao Firestore em
// ~100-400ms. Acima disto por 3 checagens seguidas já é degradação real, não
// ruído de uma medição isolada.
const SLOW_LATENCY_MS = 3000;

function readCount(file) {
  try {
    return parseInt(fs.readFileSync(file, 'utf8'), 10) || 0;
  } catch {
    return 0;
  }
}

function writeCount(file, n) {
  fs.writeFileSync(file, String(n));
}

async function checkHealth() {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(10000) });
    return res.ok;
  } catch {
    return false;
  }
}

// Retorna quantos ms a sonda de latência (ver /api/health/latency em
// index.js) levou pra ler 1 documento no Firestore. Se a sonda nem responder
// dentro do timeout (bem mais generoso que o do checkHealth acima — aqui é
// justamente pra medir demora, não só liveness), trata como "bem lento" em
// vez de erro separado: o caso de estar totalmente fora do ar já é coberto
// por checkHealth, não precisa duplicar alerta.
async function checkLatency() {
  try {
    const res = await fetch(LATENCY_URL, { signal: AbortSignal.timeout(15000) });
    const data = await res.json().catch(() => ({}));
    return typeof data.firestoreMs === 'number' ? data.firestoreMs : SLOW_LATENCY_MS + 1;
  } catch {
    return SLOW_LATENCY_MS + 1;
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
  const failCount = readCount(FAIL_STATE_FILE);

  if (!healthy) {
    const newCount = failCount + 1;
    writeCount(FAIL_STATE_FILE, newCount);
    if (newCount === FAILURE_THRESHOLD) {
      await notify(
        'Backend fora do ar',
        `${HEALTH_URL} não respondeu em ${FAILURE_THRESHOLD} checagens seguidas.\n\nVerifique o servidor (pm2 list, pm2 logs posologia-backend).`
      );
    }
    return; // fora do ar não responde latência nenhuma — não faz sentido checar
  }

  if (failCount >= FAILURE_THRESHOLD) {
    // Estava fora do ar e voltou — avisa que normalizou, pra não deixar
    // Sergio pensando que ainda está quebrado.
    await notify('Backend voltou ao ar', `${HEALTH_URL} voltou a responder normalmente.`);
  }
  writeCount(FAIL_STATE_FILE, 0);

  const latencyMs = await checkLatency();
  const slowCount = readCount(SLOW_STATE_FILE);

  if (latencyMs <= SLOW_LATENCY_MS) {
    if (slowCount >= SLOW_THRESHOLD_COUNT) {
      await notify('Servidor normalizou', `A conexão do servidor com o Firestore voltou ao normal (${latencyMs}ms numa consulta simples).`);
    }
    writeCount(SLOW_STATE_FILE, 0);
    return;
  }

  const newSlowCount = slowCount + 1;
  writeCount(SLOW_STATE_FILE, newSlowCount);
  if (newSlowCount === SLOW_THRESHOLD_COUNT) {
    await notify(
      'Servidor lento (provável internet da casa)',
      `As últimas ${SLOW_THRESHOLD_COUNT} checagens mostraram uma consulta simples ao Firestore levando mais de ${SLOW_LATENCY_MS}ms (última: ${latencyMs}ms).\n\n` +
      `O processo está no ar e respondendo, só devagar — mesmo padrão visto em 22/09/2026 (a biblioteca demorava dezenas de segundos pra carregar), causado pela internet da casa degradada e resolvido reiniciando o roteador.\n\n` +
      `Verifique a conexão do servidor com a internet.`
    );
  }
}

main().catch((err) => {
  console.error('healthcheck.js: erro inesperado:', err.message);
  process.exit(0);
});
