import express from 'express';
import { generatePresentationOutline, generateOutlineFromImport, generateSlideHtml, editSlideWithAi, generateInfographicFragment, generateClosingQuote } from '../services/aiService.js';
import { getUserSettings } from '../services/store.js';

const router = express.Router();

// Resolve a chave efetiva: prioriza um valor enviado explicitamente na
// requisição (uso avançado/pontual) e cai para a chave salva na nuvem
// (Firestore, por usuário) — assim funciona em qualquer dispositivo, sem
// depender de localStorage do navegador.
export async function resolveApiKey(userId, requestApiKey) {
  if (requestApiKey) return requestApiKey;
  const { geminiApiKey } = await getUserSettings(userId);
  return geminiApiKey || undefined;
}

// Rota 1: Gerar Outline da Apresentação
router.post('/generate-outline', async (req, res) => {
  try {
    const { prompt, materials, numSlides, apiKey, images } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'O prompt principal é obrigatório.' });
    }

    const effectiveApiKey = await resolveApiKey(req.user.id, apiKey);
    const { outline, warning } = await generatePresentationOutline({ prompt, materials, numSlides, apiKey: effectiveApiKey, images });
    res.json({ success: true, outline, warning: warning || null });
  } catch (error) {
    console.error('Erro na rota generate-outline:', error);
    res.status(500).json({ error: 'Falha ao gerar o roteiro da apresentação.' });
  }
});

// Rota 1b: Gerar Outline a partir de uma apresentação IMPORTADA (páginas de
// um PDF já extraídas, ver materialsRoutes.js /upload-presentation) — mesma
// forma de resposta de /generate-outline, só a origem do outline muda.
router.post('/import-outline', async (req, res) => {
  try {
    const { pages, apiKey } = req.body;
    if (!Array.isArray(pages) || pages.length === 0) {
      return res.status(400).json({ error: 'A lista de páginas do PDF é obrigatória.' });
    }

    const effectiveApiKey = await resolveApiKey(req.user.id, apiKey);
    const { outline, warning } = await generateOutlineFromImport({ pages, apiKey: effectiveApiKey });
    res.json({ success: true, outline, warning: warning || null });
  } catch (error) {
    console.error('Erro na rota import-outline:', error);
    res.status(500).json({ error: 'Falha ao gerar o roteiro a partir da apresentação importada.' });
  }
});

// Rota 2: Gerar Slides HTML a partir do Outline
router.post('/generate-slides', async (req, res) => {
  try {
    const { outline, apiKey, images } = req.body;
    if (!outline || !outline.slides) {
      return res.status(400).json({ error: 'O outline com lista de slides é obrigatório.' });
    }

    const effectiveApiKey = await resolveApiKey(req.user.id, apiKey);
    const generatedSlides = [];
    let firstWarning = null;
    for (let i = 0; i < outline.slides.length; i++) {
      const slideInfo = outline.slides[i];
      const { html, warning } = await generateSlideHtml({
        slideOutline: slideInfo,
        presentationTitle: outline.title,
        index: i + 1,
        totalSlides: outline.slides.length,
        apiKey: effectiveApiKey,
        images
      });
      if (warning && !firstWarning) firstWarning = warning;

      generatedSlides.push({
        id: `slide-${i + 1}-${Date.now()}`,
        index: i + 1,
        title: slideInfo.title,
        html
      });
    }

    res.json({
      success: true,
      presentation: {
        title: outline.title,
        description: outline.description,
        slides: generatedSlides
      },
      warning: firstWarning
    });
  } catch (error) {
    console.error('Erro na rota generate-slides:', error);
    res.status(500).json({ error: 'Falha ao gerar os slides da apresentação.' });
  }
});

// Rota 3: Editar slide específico via Prompt do Usuário
router.post('/edit-slide', async (req, res) => {
  try {
    const { currentHtml, instruction, apiKey, materials, images, elementHtml } = req.body;
    if (!currentHtml || !instruction) {
      return res.status(400).json({ error: 'HTML atual e instrução são obrigatórios.' });
    }

    const effectiveApiKey = await resolveApiKey(req.user.id, apiKey);
    // `elementHtml` presente: usuário selecionou um elemento específico do
    // slide — a IA edita e devolve só esse fragmento, sem reescrever (e sem
    // risco de derrubar) o resto do slide.
    const { html: newHtml, warning } = await editSlideWithAi({ currentHtml, instruction, apiKey: effectiveApiKey, materials, images, elementHtml });
    res.json({ success: true, newHtml, warning: warning || null });
  } catch (error) {
    console.error('Erro na rota edit-slide:', error);
    res.status(500).json({ error: 'Falha ao editar o slide com IA.' });
  }
});

// Rota 4: Gerar fragmento de infográfico (pra inserir dentro de um slide)
router.post('/generate-infographic', async (req, res) => {
  try {
    const { topic, materials, apiKey, images } = req.body;
    if (!topic) {
      return res.status(400).json({ error: 'O tema do infográfico é obrigatório.' });
    }

    const effectiveApiKey = await resolveApiKey(req.user.id, apiKey);
    const { html, warning } = await generateInfographicFragment({ topic, materials, apiKey: effectiveApiKey, images });
    res.json({ success: true, html, warning: warning || null });
  } catch (error) {
    console.error('Erro na rota generate-infographic:', error);
    res.status(500).json({ error: 'Falha ao gerar o infográfico com IA.' });
  }
});

// Rota 5: Gerar citação de encerramento (slide virtual pós-último slide)
router.post('/generate-quote', async (req, res) => {
  try {
    const { presentationTitle, description, apiKey } = req.body;
    const effectiveApiKey = await resolveApiKey(req.user.id, apiKey);
    const { quote, warning } = await generateClosingQuote({ presentationTitle, description, apiKey: effectiveApiKey });
    res.json({ success: true, quote, warning: warning || null });
  } catch (error) {
    console.error('Erro na rota generate-quote:', error);
    res.status(500).json({ error: 'Falha ao gerar a citação de encerramento.' });
  }
});

export default router;
