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

// Dispara o deploy.sh via `systemd-run --user`, NÃO via child_process.spawn
// direto — testado em produção (2026-08-14) e o spawn direto falha: mesmo
// com { detached: true }, o processo filho continua sendo filho DESTE
// processo Node até ele morrer de verdade (detached só cria uma nova
// sessão/grupo de processos, não muda o PPID). `pm2 restart` mata a árvore
// de processos INTEIRA do PID que está sendo reiniciado — inclusive esse
// filho "detached" — matando o deploy.sh no meio do próprio passo em que
// ELE manda reiniciar o pm2 (log ficava truncado logo após "Reiniciando
// pm2...", sem nunca chegar no healthcheck).
// `systemd-run --user` entrega o processo pro gerenciador systemd do
// usuário (um daemon completamente separado, nunca descendente do pm2/Node)
// — a partir do instante em que nasce, não numa corrida de reparentamento.
// Precisa de `loginctl enable-linger <user>` rodado uma vez no servidor,
// senão essa sessão do systemd para de existir quando ninguém está logado.
// `--collect` remove a unit transiente sozinho quando o processo termina.
function triggerDeploy() {
  fs.mkdirSync(path.dirname(TRIGGER_LOG), { recursive: true });
  const unitName = `posologia-deploy-${Date.now()}`;

  const child = spawn('systemd-run', [
    '--user', '--collect', `--unit=${unitName}`,
    'bash', DEPLOY_SCRIPT
  ], {
    cwd: REPO_DIR,
    stdio: 'ignore',
    env: process.env
  });

  // O `systemd-run` em si só entrega o comando pro systemd e sai rápido — o
  // que importa aqui é só saber se a ENTREGA falhou (ex.: bus do systemd
  // inacessível), não o resultado do deploy (esse fica em logs/deploy.log,
  // escrito pelo próprio deploy.sh independente de quem o lançou).
  child.on('error', (err) => {
    fs.appendFileSync(TRIGGER_LOG, `[${new Date().toISOString()}] Falha ao disparar systemd-run (unit ${unitName}): ${err.message}\n`);
  });
  fs.appendFileSync(TRIGGER_LOG, `[${new Date().toISOString()}] Deploy disparado via systemd-run, unit=${unitName}\n`);
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
