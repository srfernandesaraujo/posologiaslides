import React, { useState, useRef, useEffect } from 'react';
import PresentationViewer from './PresentationViewer';
import DrawingCanvas from './DrawingCanvas';
import PresentationControls from './PresentationControls';
import SlideList from './SlideList';
import ActiveMethodologiesOverlay from './ActiveMethodologiesOverlay';
import MediaLibraryDrawer from './MediaLibraryDrawer';
import PresenterWindow from './PresenterWindow';
import PresentationReportModal from './PresentationReportModal';
import { io } from 'socket.io-client';
import { apiFetch, API_URL } from '../lib/api';
import { auth } from '../lib/firebase';
import { Bot, Send, Sparkles, Download, Play, Code, Image, BarChart3, Tv } from 'lucide-react';

export default function PresentationEditor({ presentation, setPresentation, onOpenModal }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeTool, setActiveTool] = useState('pointer');
  const [activeColor, setActiveColor] = useState('#ef4444');
  const [clearTrigger, setClearTrigger] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [isMediaDrawerOpen, setIsMediaDrawerOpen] = useState(false);
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

  const stageRef = useRef(null);

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
        title: presentation.title || 'Apresentação'
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

  const handleNext = () => {
    if (activeIndex < presentation.slides.length - 1) {
      const nextIdx = activeIndex + 1;
      setActiveIndex(nextIdx);
      if (socket) socket.emit('slide_changed', { pin, newIndex: nextIdx });
    }
  };

  const handlePrev = () => {
    if (activeIndex > 0) {
      const prevIdx = activeIndex - 1;
      setActiveIndex(prevIdx);
      if (socket) socket.emit('slide_changed', { pin, newIndex: prevIdx });
    }
  };

  const toggleFullscreen = () => {
    if (!stageRef.current) return;
    if (!document.fullscreenElement) {
      stageRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => setIsFullscreen(false));
    }
  };

  const handleNavigateBranch = (targetSlideId) => {
    const targetIndex = presentation.slides.findIndex(s => s.id === targetSlideId || s.title.includes(targetSlideId));
    if (targetIndex !== -1) {
      setActiveIndex(targetIndex);
      if (socket) socket.emit('slide_changed', { pin, newIndex: targetIndex });
    } else {
      handleNext();
    }
  };

  const handleInsertMedia = (media) => {
    let mediaTag = '';
    if (media.type === 'image') {
      mediaTag = `<img src="${media.url}" alt="${media.name}" style="max-width: 100%; height: auto; border-radius: 0.5rem; margin: 1rem 0;" />`;
    } else if (media.type === 'video') {
      mediaTag = `<video src="${media.url}" controls style="max-width: 100%; border-radius: 0.5rem; margin: 1rem 0;"></video>`;
    } else if (media.type === 'audio') {
      mediaTag = `<audio src="${media.url}" controls style="width: 100%; margin: 1rem 0;"></audio>`;
    }

    const updatedSlides = [...presentation.slides];
    updatedSlides[activeIndex] = {
      ...updatedSlides[activeIndex],
      html: currentSlide.html + mediaTag
    };
    setPresentation({ ...presentation, slides: updatedSlides });
    setIsMediaDrawerOpen(false);
  };

  const handleSendChatMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userText = chatInput;
    setChatInput('');
    setChatMessages(prev => [...prev, { sender: 'user', text: userText }]);
    setChatLoading(true);

    try {
      const res = await apiFetch('/api/ai/edit-slide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentHtml: currentSlide.html,
          instruction: userText
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
        setChatMessages(prev => [...prev, { sender: 'ai', text: `✨ Slide #${activeIndex + 1} atualizado com sucesso!` }]);
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
            setActiveIndex(idx);
            if (socket) socket.emit('slide_changed', { pin, newIndex: idx });
          }
        }}
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
          onSelectSlide={(idx) => {
            setActiveIndex(idx);
            if (socket) socket.emit('slide_changed', { pin, newIndex: idx });
          }}
          onAddSlide={() => {
            const newSlide = { id: `slide-${Date.now()}`, title: `Novo Slide ${presentation.slides.length + 1}`, html: '<div style="padding:2rem; color:white;">Novo Slide Interativo</div>' };
            setPresentation({ ...presentation, slides: [...presentation.slides, newSlide] });
          }}
          onDeleteSlide={(idxToDelete) => {
            if (presentation.slides.length <= 1) return;
            const newSlides = presentation.slides.filter((_, i) => i !== idxToDelete);
            setPresentation({ ...presentation, slides: newSlides });
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

            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button className="btn-icon" onClick={() => setIsMediaDrawerOpen(!isMediaDrawerOpen)} title="Biblioteca de Mídias (Drag & Drop)">
                <Image size={18} />
              </button>
              <button className="btn-icon" onClick={() => setShowCodeEditor(!showCodeEditor)} title="Ver / Editar HTML do Slide">
                <Code size={18} />
              </button>
              <button className="btn-primary" onClick={() => setIsReportOpen(true)} style={{ background: 'rgba(255,255,255,0.08)', fontSize: '0.82rem' }}>
                <BarChart3 size={16} /> Relatórios
              </button>
              <button className="btn-primary" onClick={() => setShowPresenterWindow(true)} style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)', fontSize: '0.82rem' }}>
                <Tv size={16} /> Visão Apresentador
              </button>
              <button className="btn-primary" onClick={toggleFullscreen} style={{ fontSize: '0.82rem' }}>
                <Play size={16} /> Apresentar (F)
              </button>
            </div>
          </div>
        )}

        {/* Palco do Slide com Overlay de Metodologias Ativas */}
        <div ref={stageRef} className={`presentation-stage ${isFullscreen ? 'fullscreen-stage' : ''}`}>
          <PresentationViewer htmlContent={currentSlide.html} />

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
            <Bot size={18} color="#a855f7" />
            <span>Editar Slide #{activeIndex + 1} com IA</span>
          </div>

          <div className="chat-messages">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`chat-msg ${msg.sender}`}>
                {msg.text}
              </div>
            ))}
          </div>

          <form onSubmit={handleSendChatMessage} className="chat-input-area">
            <input
              type="text"
              className="chat-input"
              placeholder="Instrua a IA sobre este slide..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
            />
            <button type="submit" className="btn-primary" style={{ padding: '0.6rem 0.8rem' }}>
              <Send size={16} />
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
