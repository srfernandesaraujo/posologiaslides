import express from 'express';
import { getUserSettings, saveUserSettings } from '../services/store.js';

const router = express.Router();

// Configurações do usuário (chaves de API) ficam no Firestore, vinculadas ao
// UID do Firebase Auth — disponíveis em qualquer dispositivo em que ele logar,
// ao contrário do antigo armazenamento em localStorage (preso ao navegador).
router.get('/', async (req, res) => {
  try {
    const settings = await getUserSettings(req.user.id);
    res.json({ success: true, ...settings });
  } catch (error) {
    console.error('Erro na rota GET /settings:', error);
    res.status(500).json({ error: 'Falha ao buscar configurações.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { geminiApiKey, openaiApiKey, anthropicApiKey, unsplashApiKey, pexelsApiKey, giphyApiKey } = req.body;
    const settings = await saveUserSettings(req.user.id, { geminiApiKey, openaiApiKey, anthropicApiKey, unsplashApiKey, pexelsApiKey, giphyApiKey });
    res.json({ success: true, ...settings });
  } catch (error) {
    console.error('Erro na rota POST /settings:', error);
    res.status(500).json({ error: 'Falha ao salvar configurações.' });
  }
});

export default router;
