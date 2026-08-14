import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.join(__dirname, '..', '..');
const DEPLOY_SCRIPT = path.join(__dirname, '..', 'scripts', 'deploy.sh');
const TRIGGER_LOG = path.join(__dirname, '..', 'logs', 'deploy-trigger.log');

const router = express.Router();

// Sem express.json() global no meio do caminho: o HMAC precisa dos BYTES
// crus do corpo, não do objeto já parseado (a assinatura do GitHub é sobre o
// payload exato, byte a byte). O `verify` callback em express.json() no
// index.js guarda esses bytes em req.rawBody ANTES de parsear — reaproveitado
// aqui em vez de duplicar o parsing.
function isValidSignature(req) {
  const secret = process.env.DEPLOY_WEBHOOK_SECRET;
  const signature = req.headers['x-hub-signature-256'];
  if (!secret || !signature || !req.rawBody) return false;

  const expected = `sha256=${crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex')}`;
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  // Buffer.compare (via timingSafeEqual) exige o mesmo tamanho — comparar
  // digests de tamanho diferente já denuncia adulteração sem precisar do
  // timingSafeEqual pra isso, mas timingSafeEqual em si já lançaria se os
  // tamanhos não baterem, por isso o check de length explícito antes.
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

// Dispara o deploy.sh como processo destacado — precisa sobreviver ao PRÓPRIO
// pm2 restart que o script vai disparar lá dentro (ver deploy.sh); se
// rodasse anexado a este processo Node, o restart mataria o script no meio
// do caminho. stdio vai pra um arquivo de log (não pros pipes do processo
// pai, que fecham quando ele reinicia) e unref() solta o processo filho do
// event loop do pai sem esperar por ele.
function triggerDeploy() {
  fs.mkdirSync(path.dirname(TRIGGER_LOG), { recursive: true });
  const out = fs.openSync(TRIGGER_LOG, 'a');
  const child = spawn('bash', [DEPLOY_SCRIPT], {
    cwd: REPO_DIR,
    detached: true,
    stdio: ['ignore', out, out],
    env: process.env
  });
  child.unref();
}

router.post('/', (req, res) => {
  if (!isValidSignature(req)) {
    return res.status(401).json({ error: 'Assinatura inválida.' });
  }

  if (req.headers['x-github-event'] !== 'push') {
    return res.json({ success: true, ignored: 'evento não é push' });
  }

  const branch = (req.body?.ref || '').replace('refs/heads/', '');
  const targetBranch = process.env.DEPLOY_BRANCH || 'main';
  if (branch !== targetBranch) {
    return res.json({ success: true, ignored: `push em "${branch}", esperando "${targetBranch}"` });
  }

  // Responde ANTES de disparar o deploy — o script pode demorar (npm
  // install, healthcheck com retries) e vai reiniciar este mesmo processo no
  // meio do caminho; o GitHub só espera uma resposta rápida do webhook.
  res.json({ success: true, deploying: true });
  triggerDeploy();
});

export default router;
