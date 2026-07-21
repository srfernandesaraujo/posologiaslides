import express from 'express';
import { generatePresentationOutline, generateSlideHtml, editSlideWithAi } from '../services/aiService.js';

const router = express.Router();

// Rota 1: Gerar Outline da Apresentação
router.post('/generate-outline', async (req, res) => {
  try {
    const { prompt, materials, numSlides, apiKey } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'O prompt principal é obrigatório.' });
    }

    const outline = await generatePresentationOutline({ prompt, materials, numSlides, apiKey });
    res.json({ success: true, outline });
  } catch (error) {
    console.error('Erro na rota generate-outline:', error);
    res.status(500).json({ error: 'Falha ao gerar o roteiro da apresentação.' });
  }
});

// Rota 2: Gerar Slides HTML a partir do Outline
router.post('/generate-slides', async (req, res) => {
  try {
    const { outline, apiKey } = req.body;
    if (!outline || !outline.slides) {
      return res.status(400).json({ error: 'O outline com lista de slides é obrigatório.' });
    }

    const generatedSlides = [];
    for (let i = 0; i < outline.slides.length; i++) {
      const slideInfo = outline.slides[i];
      const html = await generateSlideHtml({
        slideOutline: slideInfo,
        presentationTitle: outline.title,
        index: i + 1,
        totalSlides: outline.slides.length,
        apiKey
      });

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
      }
    });
  } catch (error) {
    console.error('Erro na rota generate-slides:', error);
    res.status(500).json({ error: 'Falha ao gerar os slides da apresentação.' });
  }
});

// Rota 3: Editar slide específico via Prompt do Usuário
router.post('/edit-slide', async (req, res) => {
  try {
    const { currentHtml, instruction, apiKey } = req.body;
    if (!currentHtml || !instruction) {
      return res.status(400).json({ error: 'HTML atual e instrução são obrigatórios.' });
    }

    const newHtml = await editSlideWithAi({ currentHtml, instruction, apiKey });
    res.json({ success: true, newHtml });
  } catch (error) {
    console.error('Erro na rota edit-slide:', error);
    res.status(500).json({ error: 'Falha ao editar o slide com IA.' });
  }
});

export default router;
