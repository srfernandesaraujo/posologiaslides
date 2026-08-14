// Precisa ser o primeiro import: módulos abaixo (ex. firebaseAdmin.js, via
// authRoutes.js) lêem process.env no topo do arquivo, então o .env já tem que
// estar carregado antes deles serem avaliados (imports ES module são
// resolvidos em ordem, antes de qualquer código do próprio index.js rodar).
import 'dotenv/config';

import express from 'express';
import http from 'http';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import materialsRoutes from './routes/materialsRoutes.js';
import sessionsRoutes from './routes/sessionsRoutes.js';
import presentationsRoutes from './routes/presentationsRoutes.js';
import foldersRoutes from './routes/foldersRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import mediaSearchRoutes from './routes/mediaSearchRoutes.js';
import backupRoutes from './routes/backupRoutes.js';
import publicRoutes from './routes/publicRoutes.js';
import deployWebhookRoutes from './routes/deployWebhookRoutes.js';
import multer from 'multer';
import { requireAuth } from './middleware/auth.js';
import { setupSocketIO } from './sockets/sessionSocket.js';

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 3001;

// Configurar Socket.io
const io = setupSocketIO(httpServer);

// Frontend (Cloudflare Pages) e backend (servidor doméstico) ficam em origens
// diferentes, então CORS precisa de uma lista explícita — `CLIENT_URL` no
// .env aceita uma ou várias origens separadas por vírgula (uma pra cada
// ambiente: produção, preview do Cloudflare, dev local...). O domínio de
// produção fica hardcoded como rede de segurança: se o .env do servidor ficar
// desatualizado ou vazio, o site ainda funciona em vez de travar toda
// gravação silenciosamente (foi exatamente isso que aconteceu — CORS barrando
// todo POST /api/presentations sem nenhum aviso pro usuário).
const PRODUCTION_ORIGIN = 'https://slides.posologia.app';
const allowedOrigins = [
  PRODUCTION_ORIGIN,
  ...(process.env.CLIENT_URL || '').split(',').map((o) => o.trim()).filter(Boolean)
];

app.use(cors({
  origin(origin, callback) {
    // Sem Origin (curl, healthcheck, requisição same-origin) sempre passa.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`Origem não permitida pelo CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', cors());
// `verify` guarda os bytes crus do corpo em req.rawBody ANTES de parsear —
// necessário pro webhook de deploy validar a assinatura HMAC do GitHub
// (ver deployWebhookRoutes.js), que é calculada sobre o payload exato, não
// sobre o objeto já reserializado. Roda pra toda requisição JSON (custo
// desprezível: já é o mesmo buffer que o parser ia ler de qualquer forma),
// não só pra rota do webhook.
app.use(express.json({ limit: '10mb', verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Healthcheck — também usado pelo deploy.sh pra confirmar que o restart
// funcionou antes de considerar o deploy concluído (ver scripts/deploy.sh).
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Servidor de Apresentações HTML com IA e Socket.io operacional.' });
});

// Webhook do GitHub (push → auto-deploy, ver deployWebhookRoutes.js) — sem
// requireAuth de propósito: o GitHub não tem como mandar um Bearer token do
// Firebase. A segurança aqui vem da assinatura HMAC (DEPLOY_WEBHOOK_SECRET),
// verificada dentro da própria rota.
app.use('/api/deploy-webhook', deployWebhookRoutes);

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/ai', requireAuth, aiRoutes);
app.use('/api/materials', requireAuth, materialsRoutes);
app.use('/api/sessions', requireAuth, sessionsRoutes);
app.use('/api/presentations', requireAuth, presentationsRoutes);
app.use('/api/folders', requireAuth, foldersRoutes);
app.use('/api/settings', requireAuth, settingsRoutes);
app.use('/api/media-search', requireAuth, mediaSearchRoutes);
app.use('/api/backup', requireAuth, backupRoutes);
// Pública, de propósito (sem requireAuth) — serve apresentações via link de
// compartilhamento só-visualização, sem exigir login (ver publicRoutes.js).
app.use('/api/public/presentations', publicRoutes);

// Tratador de erro genérico — SEM isto, qualquer erro que escape de uma rota
// (ex.: multer rejeitando um arquivo grande demais, antes mesmo do handler da
// rota rodar) cai no tratador padrão do Express, que devolve uma página HTML
// de erro. O cliente sempre espera JSON (`res.json()`), então essa página
// HTML quebra com "Unexpected token '<' ... is not valid JSON" — um erro real
// de arquivo vira uma mensagem sem sentido pro usuário. Precisa ser o último
// `app.use`, depois de todas as rotas.
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Arquivo muito grande para o limite permitido.' });
  }
  console.error('Erro não tratado:', err);
  // `err.status` marca um erro deliberadamente seguro de mostrar (mensagem
  // já pensada pra não vazar nada sensível) — ver diagnosedError em
  // store.js#savePresentation. Sem isso, todo erro vira o genérico abaixo.
  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor e WebSockets rodando em http://localhost:${PORT}`);
});
