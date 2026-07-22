import express from 'express';
import axios from 'axios';
import { getUserSettings } from '../services/store.js';

const router = express.Router();

async function resolveKey(userId, keyName, requestApiKey) {
  if (requestApiKey) return requestApiKey;
  const settings = await getUserSettings(userId);
  return settings[keyName] || undefined;
}

const NO_KEY_MESSAGE = {
  unsplash: 'Nenhuma chave do Unsplash configurada. Cadastre uma gratuitamente em unsplash.com/developers e salve em Configurações.',
  pexels: 'Nenhuma chave do Pexels configurada. Cadastre uma gratuitamente em pexels.com/api e salve em Configurações.',
  giphy: 'Nenhuma chave do GIPHY configurada. Cadastre uma gratuitamente em developers.giphy.com e salve em Configurações.'
};

// Busca de fotos de estoque — Unsplash ou Pexels, conforme o parâmetro "source".
router.get('/photos', async (req, res) => {
  try {
    const { query, source } = req.query;
    if (!query) return res.status(400).json({ error: 'O termo de busca é obrigatório.' });
    const effectiveSource = source === 'pexels' ? 'pexels' : 'unsplash';

    if (effectiveSource === 'unsplash') {
      const apiKey = await resolveKey(req.user.id, 'unsplashApiKey', req.query.apiKey);
      if (!apiKey) return res.status(400).json({ error: NO_KEY_MESSAGE.unsplash, needsKey: 'unsplash' });

      const response = await axios.get('https://api.unsplash.com/search/photos', {
        params: { query, per_page: 24 },
        headers: { Authorization: `Client-ID ${apiKey}` },
        timeout: 8000
      });

      const results = (response.data.results || []).map((photo) => ({
        id: photo.id,
        thumbUrl: photo.urls.small,
        fullUrl: photo.urls.regular,
        alt: photo.alt_description || query,
        credit: { name: photo.user?.name, url: photo.user?.links?.html },
        // Exigência dos termos de uso do Unsplash: registrar o "download" via
        // este endpoint sempre que a foto for efetivamente usada (não só listada
        // na busca) — disparado pela rota /photos/unsplash-track abaixo.
        downloadLocation: photo.links?.download_location || null
      }));
      return res.json({ success: true, source: 'unsplash', results });
    }

    const apiKey = await resolveKey(req.user.id, 'pexelsApiKey', req.query.apiKey);
    if (!apiKey) return res.status(400).json({ error: NO_KEY_MESSAGE.pexels, needsKey: 'pexels' });

    const response = await axios.get('https://api.pexels.com/v1/search', {
      params: { query, per_page: 24 },
      headers: { Authorization: apiKey },
      timeout: 8000
    });

    const results = (response.data.photos || []).map((photo) => ({
      id: String(photo.id),
      thumbUrl: photo.src.medium,
      fullUrl: photo.src.large,
      alt: photo.alt || query,
      credit: { name: photo.photographer, url: photo.photographer_url },
      downloadLocation: null
    }));
    res.json({ success: true, source: 'pexels', results });
  } catch (error) {
    console.error('Erro na rota /media-search/photos:', error.response?.data || error.message);
    res.status(500).json({ error: 'Falha ao buscar fotos — verifique se a chave de API é válida.' });
  }
});

// Registra o "download" de uma foto do Unsplash — exigido pelos termos de uso
// da API sempre que a foto é efetivamente usada, não só exibida na busca.
router.post('/photos/unsplash-track', async (req, res) => {
  try {
    const { downloadLocation } = req.body;
    if (!downloadLocation) return res.status(400).json({ error: 'downloadLocation é obrigatório.' });

    const apiKey = await resolveKey(req.user.id, 'unsplashApiKey', req.body.apiKey);
    if (!apiKey) return res.status(400).json({ error: NO_KEY_MESSAGE.unsplash });

    await axios.get(downloadLocation, { headers: { Authorization: `Client-ID ${apiKey}` }, timeout: 8000 });
    res.json({ success: true });
  } catch (error) {
    // Não bloqueia a inserção da imagem por causa disso — só registra o problema.
    console.error('Erro ao registrar download no Unsplash:', error.response?.data || error.message);
    res.status(200).json({ success: false });
  }
});

// Busca de GIFs — GIPHY.
router.get('/gifs', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'O termo de busca é obrigatório.' });

    const apiKey = await resolveKey(req.user.id, 'giphyApiKey', req.query.apiKey);
    if (!apiKey) return res.status(400).json({ error: NO_KEY_MESSAGE.giphy, needsKey: 'giphy' });

    const response = await axios.get('https://api.giphy.com/v1/gifs/search', {
      params: { api_key: apiKey, q: query, limit: 24, rating: 'g' },
      timeout: 8000
    });

    const results = (response.data.data || []).map((gif) => ({
      id: gif.id,
      thumbUrl: gif.images.fixed_height_small?.url || gif.images.fixed_height.url,
      fullUrl: gif.images.original.url,
      alt: gif.title || query,
      credit: { name: gif.username || 'GIPHY', url: gif.url }
    }));
    res.json({ success: true, results });
  } catch (error) {
    console.error('Erro na rota /media-search/gifs:', error.response?.data || error.message);
    res.status(500).json({ error: 'Falha ao buscar GIFs — verifique se a chave de API é válida.' });
  }
});

export default router;
