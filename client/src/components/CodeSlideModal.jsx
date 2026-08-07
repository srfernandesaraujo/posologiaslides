import React, { useState, useMemo, useRef } from 'react';
import { Code, X, Copy, Check, Sparkles, Plus, FileCode, FileJson, FileText, RefreshCw, AlertCircle, FolderUp, Loader2 } from 'lucide-react';
import SlideThumbnail from './SlideThumbnail';
import { bundleLocalFiles } from '../lib/fileBundler';

// Prompt recomendado para copiar e colar em IAs externas (ChatGPT, Claude, Gemini, DeepSeek, etc.)
const AI_PROMPT_TEMPLATE = `Atue como um designer de slides profissional. Gere o código HTML para 1 slide de apresentação sobre o seguinte tema:
[INSIRA SEU TEMA AQUI]

REGRAS DE FORMATAÇÃO DO CÓDIGO HTML:
1. O elemento raiz DEVE ser: <div class="slide-root" style="display:flex; flex-direction:column; justify-content:center; align-items:flex-start; height:100%; padding:2.5rem; color:#f3f4f6; text-align:left; box-sizing:border-box; background:#0b1220; font-family:'Plus Jakarta Sans', sans-serif;">...</div>
2. Use gradientes modernos, cores vibrantes (ex.: #22d3ee, #a78bfa, #34d399) e boas margens.
3. Se desejar usar cards em grade, use: <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:1.2rem; width:100%; max-width:900px; margin-top:1.5rem;">
4. Forneça APENAS o código HTML dentro do container .slide-root (sem markdown \`\`\`html, sem <html> ou <body>).`;

// Modelos de exemplo pré-prontos
const EXAMPLES = {
  html: `<div class="slide-root" style="display:flex; flex-direction:column; justify-content:center; align-items:flex-start; height:100%; padding:2.5rem; color:#f3f4f6; text-align:left; box-sizing:border-box; background:#0b1220; font-family:'Plus Jakarta Sans', sans-serif;">
  <span style="font-size:0.85rem; font-weight:700; text-transform:uppercase; tracking:0.1em; color:#67e8f9; background:rgba(34,211,238,0.1); padding:0.35rem 0.8rem; border-radius:1rem; margin-bottom:1rem;">
    Módulo Especial
  </span>
  <h1 style="font-size:2.4rem; font-weight:800; color:#ffffff; margin:0 0 1rem 0; line-height:1.2;">
    Título do Slide Customizado
  </h1>
  <p style="font-size:1.1rem; color:#9ca3af; max-width:720px; margin:0 0 2rem 0; line-height:1.6;">
    Este slide foi criado por inserção direta de código HTML customizado. Você pode ajustar estilos, adicionar imagens ou usar componentes dinâmicos.
  </p>
  <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1.2rem; width:100%; max-width:780px;">
    <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); padding:1.2rem; border-radius:0.75rem; text-align:left;">
      <h3 style="color:#38bdf8; font-size:1.1rem; margin:0 0 0.5rem 0;">Ponto A</h3>
      <p style="color:#d1d5db; font-size:0.9rem; margin:0;">Descrição detalhada do primeiro elemento relevante do tópico.</p>
    </div>
    <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); padding:1.2rem; border-radius:0.75rem; text-align:left;">
      <h3 style="color:#a78bfa; font-size:1.1rem; margin:0 0 0.5rem 0;">Ponto B</h3>
      <p style="color:#d1d5db; font-size:0.9rem; margin:0;">Descrição detalhada do segundo elemento relevante do tópico.</p>
    </div>
  </div>
</div>`,

  json: `{
  "title": "Comparativo Clínico",
  "html": "<div class=\\"slide-root\\" style=\\"display:flex; flex-direction:column; justify-content:center; align-items:center; height:100%; padding:2.5rem; color:#ffffff; background:#0b1220;\\"><h1 style=\\"font-size:2.2rem; color:#67e8f9;\\">Análise Comparativa</h1><p style=\\"color:#9ca3af;\\">Estrutura importada via formato JSON estronutrado.</p></div>"
}`,

  markdown: `# Conceitos Fundamentais

## Destaques do Estudo
- **Fase 1:** Avaliação de tolerabilidade e farmacocinética
- **Fase 2:** Eficácia clínica e determinação da dose ideal
- **Fase 3:** Ensaio randomizado multicêntrico de grande escala

*Obs: Este slide foi gerado automaticamente a partir de texto em Markdown.*`
};

export default function CodeSlideModal({ isOpen, onClose, onInsert }) {
  const [code, setCode] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [activeTab, setActiveTab] = useState('auto'); // 'auto' | 'html' | 'json' | 'markdown'
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [bundling, setBundling] = useState(false);
  const [bundleMessage, setBundleMessage] = useState(null); // { type: 'success' | 'error', text }
  const bundleInputRef = useRef(null);
  const bundleFolderInputRef = useRef(null);

  // Converte o código bruto inserido para HTML + Título processado
  const processedResult = useMemo(() => {
    const trimmed = code.trim();
    if (!trimmed) {
      return { html: '', title: '', error: null, format: 'none' };
    }

    let extractedTitle = customTitle.trim();
    let finalHtml = '';
    let error = null;
    let warning = null;
    let format = activeTab;

    try {
      // Detecção de código React / JSX (ex.: export default function App, import React, className=, etc.)
      const isReactJsx = trimmed.includes('import React') || trimmed.includes('export default function') || (trimmed.includes('className=') && trimmed.includes('return'));

      // Detecção de referência a arquivo local externo (ex.: <link href="styles.css">,
      // <script src="app.js">, <image href="foto.jpg">) — comum em páginas exportadas de
      // ferramentas como o Antigravity, que geram HTML + CSS + JS em arquivos separados.
      // Aqui só entra o HTML colado; sem o conteúdo desses arquivos embutido diretamente
      // (CSS em <style>, JS em <script>, imagem em base64), o slide fica sem estilo e sem
      // interatividade — o mesmo HTML "cru" que dispara este aviso.
      const externalAssetPattern = /\b(?:href|src)\s*=\s*["'](?!https?:\/\/|\/\/|data:|#)[^"']+\.(?:css|js|mjs|jpe?g|png|gif|webp|svg)["']/i;
      const hasExternalLocalAssets = externalAssetPattern.test(trimmed);

      const warnings = [];
      if (isReactJsx) {
        warnings.push('Código React (JSX) detectado. O criador de slides necessita de HTML/CSS/JS nativo. Variáveis como {currentCase.title} não funcionam sem compilação.');
      }
      if (hasExternalLocalAssets) {
        warnings.push('Este HTML referencia um arquivo local externo (ex.: styles.css, app.js, uma imagem) que não será carregado aqui. Cole o CONTEÚDO desses arquivos direto no código: CSS dentro de uma tag <style>, JS dentro de uma tag <script>, e imagens como base64 (data:image/...;base64,...).');
      }
      if (warnings.length) warning = warnings.join(' ');

      // 1. Tentar como JSON se começar com '{' ou o tab for JSON
      if ((activeTab === 'json' || activeTab === 'auto') && trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.html) {
            finalHtml = parsed.html;
            if (!extractedTitle && parsed.title) {
              extractedTitle = parsed.title;
            }
            format = 'json';
          } else if (parsed.slides && Array.isArray(parsed.slides) && parsed.slides[0]?.html) {
            finalHtml = parsed.slides[0].html;
            if (!extractedTitle && parsed.slides[0].title) {
              extractedTitle = parsed.slides[0].title;
            }
            format = 'json';
          }
        } catch (jsonErr) {
          if (activeTab === 'json') {
            error = 'Sintaxe JSON inválida. Verifique vírgulas e aspas.';
          }
        }
      }

      // 2. Tentar como Markdown se o tab for Markdown ou se contiver sintaxe md (sem tags HTML claras)
      if (!finalHtml && (activeTab === 'markdown' || (activeTab === 'auto' && /^#+\s/.test(trimmed)))) {
        format = 'markdown';
        const lines = trimmed.split('\n');
        let mdHtml = '';
        let inList = false;

        lines.forEach((line) => {
          const l = line.trim();
          if (l.startsWith('# ')) {
            if (inList) { mdHtml += '</ul>'; inList = false; }
            const h1Text = l.slice(2);
            if (!extractedTitle) extractedTitle = h1Text;
            mdHtml += `<h1 style="font-size:2.4rem; font-weight:800; color:#ffffff; margin:0 0 1rem 0; line-height:1.2;">${h1Text}</h1>`;
          } else if (l.startsWith('## ')) {
            if (inList) { mdHtml += '</ul>'; inList = false; }
            mdHtml += `<h2 style="font-size:1.6rem; font-weight:700; color:#67e8f9; margin:1.2rem 0 0.8rem 0;">${l.slice(3)}</h2>`;
          } else if (l.startsWith('### ')) {
            if (inList) { mdHtml += '</ul>'; inList = false; }
            mdHtml += `<h3 style="font-size:1.2rem; font-weight:600; color:#a78bfa; margin:1rem 0 0.5rem 0;">${l.slice(4)}</h3>`;
          } else if (l.startsWith('- ') || l.startsWith('* ')) {
            if (!inList) { mdHtml += '<ul style="text-align:left; max-width:750px; width:100%; margin:1rem auto; padding-left:1.5rem; color:#d1d5db; font-size:1.05rem; line-height:1.7;">'; inList = true; }
            let itemText = l.slice(2);
            itemText = itemText.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#ffffff;">$1</strong>');
            itemText = itemText.replace(/\*(.*?)\*/g, '<em style="color:#9ca3af;">$1</em>');
            mdHtml += `<li style="margin-bottom:0.4rem;">${itemText}</li>`;
          } else if (l.length > 0) {
            if (inList) { mdHtml += '</ul>'; inList = false; }
            let pText = l.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#ffffff;">$1</strong>');
            pText = pText.replace(/\*(.*?)\*/g, '<em>$1</em>');
            mdHtml += `<p style="font-size:1.05rem; color:#9ca3af; max-width:800px; margin:0 0 1rem 0; line-height:1.6;">${pText}</p>`;
          }
        });
        if (inList) mdHtml += '</ul>';

        finalHtml = `<div class="slide-root" style="display:flex; flex-direction:column; justify-content:center; align-items:flex-start; height:100%; padding:2.5rem; color:#f3f4f6; text-align:left; box-sizing:border-box; background:#0b1220; font-family:'Plus Jakarta Sans', sans-serif;">${mdHtml}</div>`;
      }

      // 3. Fallback ou processamento padrão HTML
      if (!finalHtml && !error) {
        format = 'html';
        finalHtml = trimmed;

        // Se for React JSX, limpa automaticamente className -> class e comentários JSX
        if (isReactJsx) {
          finalHtml = finalHtml.replace(/className=/g, 'class=');
          finalHtml = finalHtml.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
        }

        // Se o HTML não incluir um elemento com a classe "slide-root", embrulha
        // automaticamente. Casa "slide-root" como QUALQUER uma das classes do
        // atributo (ex.: class="slide-root app-container dark-theme"), não só
        // como valor exato — um HTML colado que já declara slide-root junto de
        // outras classes próprias (comum em páginas com CSS/JS embutidos, ver
        // fluxo de import do Antigravity) não deve ser embrulhado de novo: a
        // div extra centraliza o conteúdo (justify-content/align-items:center)
        // dentro dos 720px do slide, e conteúdo bem mais alto que isso fica com
        // o topo empurrado pra fora da área rolável — parece "sumido" mesmo
        // rolando até o fim pra cima.
        const hasSlideRootClass = /class\s*=\s*["'][^"']*\bslide-root\b[^"']*["']/.test(finalHtml);
        if (!hasSlideRootClass) {
          finalHtml = `<div class="slide-root" style="display:flex; flex-direction:column; justify-content:center; align-items:flex-start; height:100%; padding:2.5rem; color:#f3f4f6; text-align:left; box-sizing:border-box; background:#0b1220; font-family:'Plus Jakarta Sans', sans-serif;">${finalHtml}</div>`;
        }

        // Tentar extrair título das tags h1 ou h2 do HTML caso não tenha sido preenchido
        if (!extractedTitle) {
          const match = finalHtml.match(/<h[12][^>]*>(.*?)<\/h[12]>/i);
          if (match && match[1]) {
            extractedTitle = match[1].replace(/<[^>]+>/g, '').trim();
          }
        }
      }
    } catch (err) {
      error = 'Erro ao processar o código: ' + err.message;
    }

    if (!extractedTitle) {
      extractedTitle = 'Slide por Código';
    }

    return { html: finalHtml, title: extractedTitle, error, warning, format };
  }, [code, customTitle, activeTab]);

  if (!isOpen) return null;

  const handleReset = () => {
    setCode('');
    setCustomTitle('');
    setActiveTab('auto');
    setCopiedPrompt(false);
    setBundleMessage(null);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(AI_PROMPT_TEMPLATE);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2500);
  };

  // Página exportada de outra ferramenta (ex.: Antigravity) com HTML + CSS +
  // JS + imagens em arquivos SEPARADOS — colar só o .html deixa o slide sem
  // estilo/interatividade (os outros arquivos não existem aqui dentro). Este
  // botão deixa selecionar TODOS os arquivos de uma vez e o bundleLocalFiles
  // (ver lib/fileBundler.js) junta tudo num fragmento só, com CSS/JS inline e
  // imagens enviadas pro Cloud Storage (referenciadas por URL, não embutidas
  // como base64 — isso já estourou o limite de 1 MiB por documento do
  // Firestore numa apresentação real, 2026-08-07) — o mesmo trabalho que
  // antes precisava ser feito à mão.
  // Usado tanto pelo <input> de arquivos soltos quanto pelo <input
  // webkitdirectory> de pasta inteira (bundleFolderInputRef) — em ambos os
  // casos o resultado é um FileList comum, então o mesmo handler serve pros
  // dois (bundleLocalFiles já lida com file.webkitRelativePath quando presente).
  const handleBundleFilesSelected = async (e) => {
    const fileList = e.target.files;
    if (!fileList || !fileList.length) return;
    setBundling(true);
    setBundleMessage(null);
    try {
      const result = await bundleLocalFiles(fileList);
      if (result.error) {
        setBundleMessage({ type: 'error', text: result.error });
      } else {
        setCode(result.html);
        setActiveTab('html');
        setBundleMessage({
          type: 'success',
          text: `"${result.htmlFileName}" combinado com ${result.usedFiles} arquivo(s) local(is) num bloco só — confira a prévia e clique em "Inserir Slide".`
        });
      }
    } catch (err) {
      setBundleMessage({ type: 'error', text: 'Erro ao processar os arquivos: ' + err.message });
    } finally {
      setBundling(false);
      e.target.value = ''; // permite selecionar os mesmos arquivos de novo depois, se precisar
    }
  };

  const handleInsert = () => {
    if (!processedResult.html || processedResult.error) return;
    onInsert(processedResult.title, processedResult.html);
    handleReset();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div
        className="modal-card"
        style={{ maxWidth: '940px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho do Modal */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)', padding: '0.55rem', borderRadius: '0.6rem' }}>
              <Code size={22} color="#ffffff" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>Criar Slide por Código</h2>
              <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>
                Cole o código HTML, JSON ou Markdown gerado no ChatGPT, Claude ou de outro lugar para criar o slide.
              </p>
            </div>
          </div>
          <button className="btn-icon" onClick={handleClose}>
            <X size={20} />
          </button>
        </div>

        {/* Barra de Ações Rápida / Modelos / Prompt */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.85rem', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', tracking: '0.05em', marginRight: '0.2rem' }}>
              Exemplos:
            </span>
            <button
              className="btn-secondary"
              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', fontWeight: 600, gap: '0.35rem' }}
              onClick={() => { setCode(EXAMPLES.html); setActiveTab('html'); }}
            >
              <FileCode size={13} color="#67e8f9" /> Modelo HTML
            </button>
            <button
              className="btn-secondary"
              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', fontWeight: 600, gap: '0.35rem' }}
              onClick={() => { setCode(EXAMPLES.json); setActiveTab('json'); }}
            >
              <FileJson size={13} color="#a78bfa" /> Modelo JSON
            </button>
            <button
              className="btn-secondary"
              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', fontWeight: 600, gap: '0.35rem' }}
              onClick={() => { setCode(EXAMPLES.markdown); setActiveTab('markdown'); }}
            >
              <FileText size={13} color="#34d399" /> Modelo Markdown
            </button>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              ref={bundleInputRef}
              type="file"
              multiple
              accept=".html,.htm,.css,.js,.mjs,image/*"
              onChange={handleBundleFilesSelected}
              style={{ display: 'none' }}
            />
            {/* Seleção de arquivos soltos não permite escolher uma pasta (ex.:
                "images/") junto dos arquivos no mesmo diálogo — por isso este
                segundo input usa webkitdirectory: escolhendo a pasta-mãe do
                projeto, TODOS os arquivos são incluídos recursivamente
                (inclusive os que estão dentro de subpastas de imagens). */}
            <input
              ref={bundleFolderInputRef}
              type="file"
              webkitdirectory=""
              directory=""
              multiple
              onChange={handleBundleFilesSelected}
              style={{ display: 'none' }}
            />
            <button
              className="btn-secondary"
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', fontWeight: 700, gap: '0.4rem', background: 'rgba(167, 139, 250, 0.12)', color: '#a78bfa', border: '1px solid rgba(167, 139, 250, 0.25)' }}
              onClick={() => bundleInputRef.current?.click()}
              disabled={bundling}
              title="Selecione o .html principal junto com seus .css/.js/imagens locais — tudo vira um bloco só, autocontido"
            >
              {bundling ? <Loader2 size={14} className="animate-spin" /> : <FolderUp size={14} />}
              {bundling ? 'Juntando arquivos...' : 'Importar Arquivos'}
            </button>
            <button
              className="btn-secondary"
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', fontWeight: 700, gap: '0.4rem', background: 'rgba(52, 211, 153, 0.12)', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.25)' }}
              onClick={() => bundleFolderInputRef.current?.click()}
              disabled={bundling}
              title="Selecione a pasta inteira do projeto (ex.: com uma subpasta 'images/') — todos os arquivos dentro, incluindo os de subpastas, são incluídos automaticamente"
            >
              {bundling ? <Loader2 size={14} className="animate-spin" /> : <FolderUp size={14} />}
              {bundling ? 'Juntando arquivos...' : 'Importar Pasta Inteira'}
            </button>
            <button
              className="btn-secondary"
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', fontWeight: 700, gap: '0.4rem', background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.25)' }}
              onClick={handleCopyPrompt}
              title="Copiar instrução pronta para colar no ChatGPT/Claude e pedir a geração do slide"
            >
              {copiedPrompt ? <Check size={14} color="#34d399" /> : <Sparkles size={14} />}
              {copiedPrompt ? 'Prompt Copiado!' : 'Copiar Prompt para IAs'}
            </button>
          </div>
        </div>

        {bundleMessage && (
          <div
            style={{
              fontSize: '0.78rem',
              color: bundleMessage.type === 'error' ? '#f87171' : '#6ee7b7',
              background: bundleMessage.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
              border: `1px solid ${bundleMessage.type === 'error' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(16, 185, 129, 0.25)'}`,
              padding: '0.5rem 0.75rem',
              borderRadius: '0.4rem',
              marginBottom: '0.75rem',
              flexShrink: 0
            }}
          >
            {bundleMessage.text}
          </div>
        )}

        {/* Título opcional */}
        <div style={{ marginBottom: '0.75rem', flexShrink: 0 }}>
          <input
            type="text"
            className="chat-input"
            placeholder={`Título do Slide (opcional — detectado automaticamente: "${processedResult.title || 'Slide por Código'}")`}
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            style={{ width: '100%', fontSize: '0.85rem', padding: '0.5rem 0.75rem', boxSizing: 'border-box' }}
          />
        </div>

        {/* Área Principal: Editor de Código + Prévia lado a lado */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', flex: 1, minHeight: '320px', overflow: 'hidden' }}>
          {/* Lado Esquerdo: Textarea do Código */}
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#9ca3af' }}>Código-Fonte:</span>
              {code && (
                <button
                  onClick={() => setCode('')}
                  style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}
                >
                  Limpar código
                </button>
              )}
            </div>
            <textarea
              className="chat-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Cole aqui o seu código HTML (ex.: <div class=&quot;slide-root&quot;>...</div>), JSON ou Markdown..."
              spellCheck={false}
              style={{
                flex: 1,
                width: '100%',
                boxSizing: 'border-box',
                fontFamily: "'Fira Code', 'Consolas', 'Courier New', monospace",
                fontSize: '0.82rem',
                lineHeight: '1.5',
                padding: '0.75rem',
                background: '#070b12',
                color: '#38bdf8',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '0.5rem',
                resize: 'none'
              }}
            />
          </div>

          {/* Lado Direito: Prévia em Tempo Real */}
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#9ca3af' }}>Prévia em Tempo Real:</span>
              {processedResult.format !== 'none' && (
                <span style={{ fontSize: '0.72rem', color: '#67e8f9', background: 'rgba(34,211,238,0.1)', padding: '0.1rem 0.4rem', borderRadius: '0.3rem' }}>
                  Formato: {processedResult.format.toUpperCase()}
                </span>
              )}
            </div>

            {processedResult.warning && (
              <div style={{ fontSize: '0.75rem', color: '#fbbf24', background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.25)', padding: '0.45rem 0.75rem', borderRadius: '0.4rem', marginBottom: '0.5rem' }}>
                ⚠️ {processedResult.warning}
              </div>
            )}

            <div
              style={{
                flex: 1,
                borderRadius: '0.5rem',
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.12)',
                background: '#000000',
                display: 'flex',
                alignItems: 'center',
                justify: 'center',
                position: 'relative'
              }}
            >
              {processedResult.error ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: '#f87171' }}>
                  <AlertCircle size={28} style={{ margin: '0 auto 0.5rem auto' }} />
                  <p style={{ fontSize: '0.85rem', margin: 0 }}>{processedResult.error}</p>
                </div>
              ) : processedResult.html ? (
                <div style={{ width: '100%', height: '100%', aspectRatio: '16/9' }}>
                  <SlideThumbnail html={processedResult.html} />
                </div>
              ) : (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: '#6b7280' }}>
                  <Code size={32} style={{ margin: '0 auto 0.5rem auto', opacity: 0.4 }} />
                  <p style={{ fontSize: '0.85rem', margin: 0 }}>
                    A prévia do slide renderizado aparecerá aqui assim que você colar ou digitar o código.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Rodapé de Ações */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <button
            className="btn-secondary"
            style={{ padding: '0.5rem 1.2rem', fontSize: '0.85rem' }}
            onClick={handleClose}
          >
            Cancelar
          </button>
          <button
            className="btn-primary"
            style={{ padding: '0.5rem 1.4rem', fontSize: '0.85rem', gap: '0.4rem' }}
            onClick={handleInsert}
            disabled={!processedResult.html || !!processedResult.error}
          >
            <Plus size={16} /> Inserir Slide
          </button>
        </div>
      </div>
    </div>
  );
}
