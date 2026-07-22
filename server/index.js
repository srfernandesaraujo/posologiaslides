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
import settingsRoutes from './routes/settingsRoutes.js';
import mediaSearchRoutes from './routes/mediaSearchRoutes.js';
import { requireAuth } from './middleware/auth.js';
import { setupSocketIO } from './sockets/sessionSocket.js';

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 3001;

// Configurar Socket.io
const io = setupSocketIO(httpServer);

app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Healthcheck
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Servidor de Apresentações HTML com IA e Socket.io operacional.' });
});

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/ai', requireAuth, aiRoutes);
app.use('/api/materials', requireAuth, materialsRoutes);
app.use('/api/sessions', requireAuth, sessionsRoutes);
app.use('/api/presentations', requireAuth, presentationsRoutes);
app.use('/api/settings', requireAuth, settingsRoutes);
app.use('/api/media-search', requireAuth, mediaSearchRoutes);

httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor e WebSockets rodando em http://localhost:${PORT}`);
});
