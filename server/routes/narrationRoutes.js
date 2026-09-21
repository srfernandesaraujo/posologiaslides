import express from 'express';
import axios from 'axios';

// Pública (sem requireAuth — montada assim de propósito em index.js): um slide
// de código com narração pode acabar num link de apresentação compartilhado
// (ver publicRoutes.js), onde quem assiste não tem login nenhum. Por isso a
// chave do ElevenLabs mora só aqui no servidor (ELEVENLABS_API_KEY) — o slide
// chama esta rota em vez da API do ElevenLabs direto, então a chave nunca
// aparece no HTML/DevTools de quem só está assistindo (caso real, 2026-09-21:
// caso clínico com narração embutia a chave em texto puro no slide).
const router = express.Router();

const DEFAULT_VOICE_ID = 'C9fbwSpEaejywLWx722Z';
const DEFAULT_MODEL_ID = 'eleven_multilingual_v2';
const DEFAULT_OUTPUT_FORMAT = 'mp3_44100_128';
const MAX_TEXT_LENGTH = 2000;

// Sem login pra identificar quem pede, o único jeito de limitar abuso (alguém
// achar a rota e ficar chamando em loop, estourando a cota paga do ElevenLabs)
// é por IP. Rate limit em memória (não sobrevive a restart/múltiplas
// instâncias) é suficiente aqui: baixo tráfego esperado, um só processo pm2
// (ver server/scripts/README.md), e o pior caso de um restart é só resetar a
// janela, não abrir brecha de segurança.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const requestLog = new Map(); // ip -> timestamps (ms) das últimas requisições dentro da janela

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT_MAX_REQUESTS;
}

router.post('/tts', async (req, res) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Narração por IA não configurada neste servidor.' });
  }

  if (isRateLimited(req.ip)) {
    return res.status(429).json({ error: 'Muitas narrações pedidas em pouco tempo. Aguarde alguns minutos.' });
  }

  const { text, voiceId, modelId, outputFormat } = req.body || {};
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Campo "text" é obrigatório.' });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return res.status(400).json({ error: `Texto muito longo — limite de ${MAX_TEXT_LENGTH} caracteres por narração.` });
  }

  try {
    const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId || DEFAULT_VOICE_ID)}`;
    const response = await axios.post(
      endpoint,
      { text, model_id: modelId || DEFAULT_MODEL_ID },
      {
        params: { output_format: outputFormat || DEFAULT_OUTPUT_FORMAT },
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
        responseType: 'arraybuffer',
        timeout: 20000
      }
    );

    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(response.data));
  } catch (error) {
    // Erro do ElevenLabs vem em JSON, mas como arraybuffer (responseType acima
    // vale pra resposta de erro também) — decodifica pra não logar um Buffer ilegível.
    const detail = error.response?.data ? Buffer.from(error.response.data).toString('utf-8') : error.message;
    console.error('Erro na rota /api/public/narration/tts:', error.response?.status, detail);
    res.status(502).json({ error: 'Não foi possível gerar a narração agora.' });
  }
});

export default router;
