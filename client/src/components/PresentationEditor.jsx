import React, { useState, useRef, useEffect } from 'react';
import PresentationViewer from './PresentationViewer';
import DrawingCanvas from './DrawingCanvas';
import PresentationControls from './PresentationControls';
import SlideList from './SlideList';
import ActiveMethodologiesOverlay from './ActiveMethodologiesOverlay';
import MediaLibraryDrawer from './MediaLibraryDrawer';
import WidgetLibraryDrawer from './WidgetLibraryDrawer';
import PresenterWindow from './PresenterWindow';
import PresentationReportModal from './PresentationReportModal';
import { io } from 'socket.io-client';
import { apiFetch, API_URL } from '../lib/api';
import { auth } from '../lib/firebase';
import { Bot, Send, Sparkles, Download, Play, Code, Image, BarChart3, Tv, Paperclip, Link as LinkIcon, X, FileText, Loader2, Puzzle } from 'lucide-react';

export default function PresentationEditor({ presentation, setPresentation, onOpenModal }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeTool, setActiveTool] = useState('pointer');
  const [activeColor, setActiveColor] = useState('#ef4444');
  const [clearTrigger, setClearTrigger] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [isMediaDrawerOpen, setIsMediaDrawerOpen] = useState(false);
  const [isWidgetDrawerOpen, setIsWidgetDrawerOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [showPresenterWindow, setShowPresenterWindow] = useState(false);

  // Sockets & PIN para sessão ao vivo
  const [socket, setSocket] = useState(null);
  const [pin, setPin] = useState('849201');

  // Chat com IA
  const [chatMessages, setChatMessages] = useState([
    { sender: 'ai', text: 'Olá! Sou seu assistente de IA. Selecione um slide e me peça para alterar cores, adicionar gráficos, simuladores ou novos conteúdos!' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatAttachments, setChatAttachments] = useState([]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [attachLinkUrl, setAttachLinkUrl] = useState('');
  const [attachLoading, setAttachLoading] = useState(false);

  const stageRef = useRef(null);
  const chatMessagesRef = useRef(null);

  useEffect(() => {
    let newSocket;
    let cancelled = false;

    (async () => {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (cancelled) return;

      newSocket = io(API_URL || window.location.origin, { auth: { token } });
      setSocket(newSocket);

      newSocket.emit('create_session', {
        presentationId: presentation.id || 'p-1',
        title: presentation.title || 'Apresentação',
        slideType: presentation.slides?.[0]?.type || null,
        correctAnswer: presentation.slides?.[0]?.correctAnswer || null,
        hotspotConfig: presentation.slides?.[0]?.hotspotConfig || null
      });

      newSocket.on('session_created', ({ pin: newPin }) => {
        setPin(newPin);
      });
    })();

    return () => {
      cancelled = true;
      if (newSocket) newSocket.close();
    };
  }, [presentation.title]);

  const currentSlide = presentation?.slides?.[activeIndex] || {
    title: 'Slide Inicial',
    html: '<div style="color:white; padding:2rem;">Nenhum slide gerado ainda.</div>'
  };

  // Centraliza a troca de slide ativo: atualiza o estado local e avisa a
  // sessão ao vivo (se houver) do novo índice E do tipo de interatividade
  // do slide, pra o celular do aluno já saber o que mostrar.
  const emitSlideChanged = (newIndex) => {
    setActiveIndex(newIndex);
    if (socket) {
      const slide = presentation.slides[newIndex];
      socket.emit('slide_changed', {
        pin,
        newIndex,
        slideType: slide?.type || null,
        correctAnswer: slide?.correctAnswer || null,
        hotspotConfig: slide?.hotspotConfig || null
      });
    }
  };

  const handleChangeSlideType = (type) => {
    const updatedSlides = [...presentation.slides];
    updatedSlides[activeIndex] = { ...updatedSlides[activeIndex], type: type || undefined };
    setPresentation({ ...presentation, slides: updatedSlides });
  };

  const handleChangeCorrectAnswer = (answer) => {
    const updatedSlides = [...presentation.slides];
    updatedSlides[activeIndex] = { ...updatedSlides[activeIndex], correctAnswer: answer || undefined };
    setPresentation({ ...presentation, slides: updatedSlides });
  };

  const handleChangeHotspotConfig = (patch) => {
    const updatedSlides = [...presentation.slides];
    const prevConfig = updatedSlides[activeIndex].hotspotConfig || { imageUrl: '', x: null, y: null, radius: 10 };
    updatedSlides[activeIndex] = { ...updatedSlides[activeIndex], hotspotConfig: { ...prevConfig, ...patch } };
    setPresentation({ ...presentation, slides: updatedSlides });
  };

  const handleMarkHotspotPoint = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    handleChangeHotspotConfig({ x, y });
  };

  const handleNext = () => {
    if (activeIndex < presentation.slides.length - 1) {
      emitSlideChanged(activeIndex + 1);
    }
  };

  const handlePrev = () => {
    if (activeIndex > 0) {
      emitSlideChanged(activeIndex - 1);
    }
  };

  const toggleFullscreen = () => {
    if (!stageRef.current) return;
    if (!document.fullscreenElement) {
      stageRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Mantém isFullscreen sincronizado com o estado real do navegador: cobre a
  // saída nativa (tecla Esc, UI do navegador), que não passa por toggleFullscreen
  // e por isso deixava a UI (lista de slides, chat) escondida mesmo após sair.
  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Rola o chat até o fim sempre que uma mensagem nova ou o indicador de
  // "digitando" aparece — sem isso o feedback de carregamento podia ficar
  // fora da área visível e passar despercebido.
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [chatMessages, chatLoading]);

  const handleNavigateBranch = (targetSlideId) => {
    const targetIndex = presentation.slides.findIndex(s => s.id === targetSlideId || s.title.includes(targetSlideId));
    if (targetIndex !== -1) {
      emitSlideChanged(targetIndex);
    } else {
      handleNext();
    }
  };

  const handleInsertMedia = (media) => {
    let mediaTag = '';
    if (media.type === 'image') {
      mediaTag = `<img src="${media.url}" alt="${media.name}" style="max-width: 100%; height: auto; border-radius: 0.5rem; margin: 1rem 0;" />`;
    } else if (media.type === 'image-credited') {
      // Fotos/GIFs vindos de busca externa (Unsplash, Pexels, GIPHY) — os termos
      // de uso dessas APIs pedem crédito visível ao autor/serviço de origem.
      const creditLine = media.credit?.name
        ? `<div style="font-size:0.7rem;color:#6b7280;margin:-0.75rem 0 1rem;">Foto: <a href="${media.credit.url || '#'}" target="_blank" rel="noopener noreferrer" style="color:#9ca3af;">${media.credit.name}</a>${media.source ? ` via ${media.source}` : ''}</div>`
        : '';
      mediaTag = `<img src="${media.url}" alt="${media.name}" style="max-width: 100%; height: auto; border-radius: 0.5rem; margin: 1rem 0 0;" />${creditLine}`;
    } else if (media.type === 'video') {
      mediaTag = `<video src="${media.url}" controls style="max-width: 100%; border-radius: 0.5rem; margin: 1rem 0;"></video>`;
    } else if (media.type === 'audio') {
      mediaTag = `<audio src="${media.url}" controls style="width: 100%; margin: 1rem 0;"></audio>`;
    } else if (media.type === 'webpage') {
      mediaTag = `<div style="position: relative; width: 100%; aspect-ratio: 16/9; margin: 1rem 0; border-radius: 0.5rem; overflow: hidden;"><iframe src="${media.url}" style="position:absolute; top:0; left:0; width:100%; height:100%; border:0;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe></div>`;
    }

    const updatedSlides = [...presentation.slides];
    updatedSlides[activeIndex] = {
      ...updatedSlides[activeIndex],
      html: currentSlide.html + mediaTag
    };
    setPresentation({ ...presentation, slides: updatedSlides });
    setIsMediaDrawerOpen(false);
  };

  const handleInsertWidget = (widgetHtml) => {
    const updatedSlides = [...presentation.slides];
    updatedSlides[activeIndex] = {
      ...updatedSlides[activeIndex],
      html: currentSlide.html + widgetHtml
    };
    setPresentation({ ...presentation, slides: updatedSlides });
    setIsWidgetDrawerOpen(false);
  };

  const handleAttachFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    setAttachLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await apiFetch('/api/materials/upload-file', { method: 'POST', body: formData });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Falha ao anexar arquivo.');

      if (data.mimeType && data.mimeType.startsWith('image/')) {
        setChatAttachments(prev => [...prev, { id: Date.now().toString(), kind: 'image', name: data.filename, mimeType: data.mimeType, data: data.base64 }]);
      } else {
        setChatAttachments(prev => [...prev, { id: Date.now().toString(), kind: 'text', name: data.filename, content: data.text }]);
      }
    } catch (err) {
      alert('Erro ao anexar arquivo: ' + err.message);
    } finally {
      setAttachLoading(false);
      setShowAttachMenu(false);
    }
  };

  const handleAttachLink = async () => {
    if (!attachLinkUrl.trim()) return;
    setAttachLoading(true);

    try {
      const res = await apiFetch('/api/materials/parse-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: attachLinkUrl })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Falha ao ler o link.');

      setChatAttachments(prev => [...prev, { id: Date.now().toString(), kind: 'text', name: attachLinkUrl, content: data.text }]);
      setAttachLinkUrl('');
    } catch (err) {
      alert('Erro ao anexar link: ' + err.message);
    } finally {
      setAttachLoading(false);
      setShowAttachMenu(false);
    }
  };

  const removeAttachment = (id) => {
    setChatAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleSendChatMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userText = chatInput;
    const attachmentsSent = chatAttachments;
    setChatInput('');
    setChatAttachments([]);
    setChatMessages(prev => [...prev, { sender: 'user', text: userText, attachments: attachmentsSent }]);
    setChatLoading(true);

    const materials = attachmentsSent.filter(a => a.kind === 'text').map(a => `[${a.name}]\n${a.content}`).join('\n\n');
    const images = attachmentsSent.filter(a => a.kind === 'image').map(({ mimeType, data }) => ({ mimeType, data }));

    try {
      const res = await apiFetch('/api/ai/edit-slide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentHtml: currentSlide.html,
          instruction: userText,
          materials: materials || undefined,
          images: images.length ? images : undefined
        })
      });
      const data = await res.json();

      if (data.success && data.newHtml) {
        const updatedSlides = [...presentation.slides];
        updatedSlides[activeIndex] = {
          ...updatedSlides[activeIndex],
          html: data.newHtml
        };
        setPresentation({ ...presentation, slides: updatedSlides });
        const successText = `✨ Slide #${activeIndex + 1} atualizado com sucesso!`;
        setChatMessages(prev => [
          ...prev,
          { sender: 'ai', text: data.warning ? `${successText}\n⚠️ ${data.warning}` : successText }
        ]);
      } else {
        throw new Error(data.error || 'Falha ao atualizar.');
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { sender: 'ai', text: `❌ Erro: ${err.message}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  if (showPresenterWindow) {
    return (
      <PresenterWindow
        slides={presentation.slides}
        currentIndex={activeIndex}
        onSelectSlide={(idx) => {
          if (idx >= 0 && idx < presentation.slides.length) {
            emitSlideChanged(idx);
          }
        }}
        onClose={() => setShowPresenterWindow(false)}
      />
    );
  }

  return (
    <div className={`main-layout ${isFullscreen ? 'full-presentation' : ''}`}>
      {/* Sidebar Esquerda (Miniaturas de Slides) */}
      {!isFullscreen && (
        <SlideList
          slides={presentation.slides}
          activeIndex={activeIndex}
          onSelectSlide={emitSlideChanged}
          onAddSlide={() => {
            const newSlide = { id: `slide-${Date.now()}`, title: `Novo Slide ${presentation.slides.length + 1}`, html: '<div style="padding:2rem; color:white;">Novo Slide Interativo</div>' };
            setPresentation({ ...presentation, slides: [...presentation.slides, newSlide] });
          }}
          onDeleteSlide={(idxToDelete) => {
            if (presentation.slides.length <= 1) return;
            const newSlides = presentation.slides.filter((_, i) => i !== idxToDelete);
            setPresentation({ ...presentation, slides: newSlides });
            // Sem isto, apagar o slide ativo (ou qualquer um antes dele) deixava
            // activeIndex apontando para fora do novo array — o palco caía no
            // placeholder "Nenhum slide gerado" e parecia que nada tinha acontecido.
            setActiveIndex((prev) => {
              const shifted = idxToDelete < prev ? prev - 1 : prev;
              return Math.min(shifted, newSlides.length - 1);
            });
          }}
        />
      )}

      {/* Palco Principal de Apresentação */}
      <div className="stage-container">
        {!isFullscreen && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', width: '100%', maxWidth: '1100px', justifyContent: 'space-between', alignItems: 'center' }}>
            <h1 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f3f4f6' }}>
              {presentation.title} <span style={{ fontSize: '0.85rem', fontWeight: 400, color: '#9ca3af' }}>({activeIndex + 1}/{presentation.slides.length})</span>
            </h1>

            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <select
                className="chat-input"
                value={currentSlide.type || ''}
                onChange={(e) => handleChangeSlideType(e.target.value)}
                title="Modo de Interatividade deste Slide (ativa o painel de resultados ao vivo para o apresentador)"
                style={{ fontSize: '0.78rem', padding: '0.4rem 0.6rem', width: 'auto' }}
              >
                <option value="">Sem interatividade</option>
                <option value="quiz">Quiz ao Vivo</option>
                <option value="wordcloud">Nuvem de Palavras</option>
                <option value="tbl">TBL — Verificação Individual (iRAT)</option>
                <option value="hotspot">Hotspot em Imagem</option>
              </select>
              <button className="btn-icon" onClick={() => setIsMediaDrawerOpen(!isMediaDrawerOpen)} title="Biblioteca de Mídias (Drag & Drop)">
                <Image size={18} />
              </button>
              <button className="btn-icon" onClick={() => setIsWidgetDrawerOpen(!isWidgetDrawerOpen)} title="Inserir Blocos, Layouts e Widgets Interativos">
                <Puzzle size={18} />
              </button>
              <button className="btn-icon" onClick={() => setShowCodeEditor(!showCodeEditor)} title="Ver / Editar HTML do Slide">
                <Code size={18} />
              </button>
              <button className="btn-primary" onClick={() => setIsReportOpen(true)} style={{ background: 'rgba(255,255,255,0.08)', fontSize: '0.82rem' }}>
                <BarChart3 size={16} /> Relatórios
              </button>
              <button className="btn-primary" onClick={() => setShowPresenterWindow(true)} style={{ background: 'linear-gradient(135deg, #22d3ee, #10b981)', fontSize: '0.82rem' }}>
                <Tv size={16} /> Visão Apresentador
              </button>
              <button className="btn-primary" onClick={toggleFullscreen} style={{ fontSize: '0.82rem' }}>
                <Play size={16} /> Apresentar (F)
              </button>
            </div>
          </div>
        )}

        {!isFullscreen && currentSlide.type === 'quiz' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', width: '100%', maxWidth: '1100px', fontSize: '0.8rem', color: '#9ca3af' }}>
            Resposta certa (opcional, ativa pontuação):
            {['A', 'B', 'C', 'D'].map((opt) => (
              <button
                key={opt}
                className="btn-icon"
                onClick={() => handleChangeCorrectAnswer(currentSlide.correctAnswer === opt ? '' : opt)}
                style={{
                  width: '32px',
                  height: '32px',
                  background: currentSlide.correctAnswer === opt ? 'var(--accent-primary)' : undefined,
                  color: currentSlide.correctAnswer === opt ? '#071019' : undefined
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        {!isFullscreen && currentSlide.type === 'hotspot' && (
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', marginBottom: '0.75rem', width: '100%', maxWidth: '1100px', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '0.5rem' }}>
            <div style={{ flex: 1 }}>
              <input
                type="text"
                className="chat-input"
                placeholder="URL da imagem"
                value={currentSlide.hotspotConfig?.imageUrl || ''}
                onChange={(e) => handleChangeHotspotConfig({ imageUrl: e.target.value })}
                style={{ width: '100%', marginBottom: '0.5rem', fontSize: '0.8rem', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Raio de tolerância (%)</label>
                <input
                  type="number"
                  className="chat-input"
                  min="3"
                  max="40"
                  value={currentSlide.hotspotConfig?.radius ?? 10}
                  onChange={(e) => handleChangeHotspotConfig({ radius: Number(e.target.value) })}
                  style={{ width: '70px', fontSize: '0.8rem' }}
                />
              </div>
              <p style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: '0.4rem' }}>
                Clique na miniatura ao lado para marcar o ponto correto.
              </p>
            </div>

            {currentSlide.hotspotConfig?.imageUrl && (
              <div style={{ position: 'relative', width: '160px', flexShrink: 0, cursor: 'crosshair' }} onClick={handleMarkHotspotPoint}>
                <img src={currentSlide.hotspotConfig.imageUrl} alt="Prévia do hotspot" style={{ width: '100%', borderRadius: '0.5rem', display: 'block' }} />
                {currentSlide.hotspotConfig?.x != null && (
                  <div
                    style={{
                      position: 'absolute',
                      left: `${currentSlide.hotspotConfig.x}%`,
                      top: `${currentSlide.hotspotConfig.y}%`,
                      transform: 'translate(-50%, -50%)',
                      width: '14px',
                      height: '14px',
                      borderRadius: '50%',
                      background: 'var(--accent-primary)',
                      border: '2px solid #fff',
                      boxShadow: '0 0 8px rgba(34,211,238,0.8)',
                      pointerEvents: 'none'
                    }}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Palco do Slide com Overlay de Metodologias Ativas */}
        <div ref={stageRef} className={`presentation-stage ${isFullscreen ? 'fullscreen-stage' : ''}`}>
          <PresentationViewer htmlContent={currentSlide.html} reloadKey={isFullscreen} />

          <ActiveMethodologiesOverlay
            socket={socket}
            pin={pin}
            currentSlide={currentSlide}
            slideIndex={activeIndex}
            onNavigateBranch={handleNavigateBranch}
          />

          <DrawingCanvas
            tool={activeTool}
            color={activeColor}
            clearTrigger={clearTrigger}
          />

          <PresentationControls
            currentIndex={activeIndex}
            totalSlides={presentation.slides.length}
            onPrev={handlePrev}
            onNext={handleNext}
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            activeColor={activeColor}
            setActiveColor={setActiveColor}
            onClearDrawing={() => setClearTrigger(prev => prev + 1)}
            isFullscreen={isFullscreen}
            toggleFullscreen={toggleFullscreen}
          />
        </div>
      </div>

      {/* Sidebar Direita (Chat de IA) */}
      {!isFullscreen && (
        <div className="sidebar-chat">
          <div className="chat-header">
            <Bot size={18} color="var(--accent-primary)" />
            <span>Editar Slide #{activeIndex + 1} com IA</span>
          </div>

          <div className="chat-messages" ref={chatMessagesRef}>
            {chatMessages.map((msg, i) => (
              <div key={i} className={`chat-msg ${msg.sender}`} style={{ whiteSpace: 'pre-line' }}>
                {msg.text}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.5rem' }}>
                    {msg.attachments.map(a => (
                      <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.72rem', background: 'rgba(255,255,255,0.08)', padding: '0.2rem 0.4rem', borderRadius: '0.3rem' }}>
                        {a.kind === 'image' ? <Image size={11} /> : <FileText size={11} />} {a.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {chatLoading && (
              <div className="chat-msg ai" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Loader2 size={14} className="animate-spin" />
                <span>A IA está editando o slide...</span>
              </div>
            )}
          </div>

          {chatAttachments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', padding: '0 1rem 0.5rem' }}>
              {chatAttachments.map(a => (
                <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', background: 'rgba(56,189,248,0.1)', color: '#38bdf8', padding: '0.25rem 0.5rem', borderRadius: '0.4rem' }}>
                  {a.kind === 'image' ? <Image size={12} /> : <FileText size={12} />}
                  <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                  <button type="button" onClick={() => removeAttachment(a.id)} style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', display: 'flex' }}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {showAttachMenu && (
            <div style={{ margin: '0 1rem 0.5rem', padding: '0.75rem', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-glass)', borderRadius: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label className="btn-icon" style={{ width: 'auto', padding: '0.4rem 0.7rem', justifyContent: 'flex-start', gap: '0.4rem', cursor: 'pointer' }}>
                <Paperclip size={14} /> <span style={{ fontSize: '0.78rem' }}>Anexar PDF / TXT / Imagem</span>
                <input type="file" accept=".pdf,.txt,image/*" style={{ display: 'none' }} onChange={handleAttachFile} disabled={attachLoading} />
              </label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input
                  type="url"
                  className="chat-input"
                  placeholder="https://exemplo.com/artigo"
                  style={{ fontSize: '0.78rem', padding: '0.4rem 0.6rem' }}
                  value={attachLinkUrl}
                  onChange={(e) => setAttachLinkUrl(e.target.value)}
                />
                <button type="button" className="btn-icon" onClick={handleAttachLink} disabled={attachLoading} style={{ background: 'rgba(255,255,255,0.1)' }}>
                  <LinkIcon size={14} />
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSendChatMessage} className="chat-input-area">
            <button type="button" className="btn-icon" onClick={() => setShowAttachMenu(!showAttachMenu)} disabled={chatLoading} title="Anexar material de referência (PDF, imagem, link)">
              <Paperclip size={16} />
            </button>
            <input
              type="text"
              className="chat-input"
              placeholder={chatLoading ? 'Aguarde a IA terminar...' : 'Instrua a IA sobre este slide...'}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={chatLoading}
            />
            <button type="submit" className="btn-primary" style={{ padding: '0.6rem 0.8rem' }} disabled={chatLoading}>
              {chatLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </form>
        </div>
      )}

      {/* Drawer de Mídias */}
      <MediaLibraryDrawer
        isOpen={isMediaDrawerOpen}
        onClose={() => setIsMediaDrawerOpen(false)}
        onInsertMedia={handleInsertMedia}
      />

      {/* Drawer de Widgets Interativos */}
      <WidgetLibraryDrawer
        isOpen={isWidgetDrawerOpen}
        onClose={() => setIsWidgetDrawerOpen(false)}
        onInsertWidget={handleInsertWidget}
      />

      {/* Modal de Relatório Pós-Aula */}
      <PresentationReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        presentationTitle={presentation.title}
        pin={pin}
        slides={presentation.slides}
      />
    </div>
  );
}
