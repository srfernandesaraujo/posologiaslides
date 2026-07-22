import React, { useState, useRef, useEffect } from 'react';
import PresentationViewer, { SLIDE_EDITOR_MESSAGE_SOURCE } from './PresentationViewer';
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
import {
  appendIntoRoot, getElementAt, removeElementAt, replaceElementAt, replaceElementInnerAt,
  moveElementAt, setAlignmentAt, groupWithNeighborAt, ungroupAt, isGroupedAt, getElementMeta,
  setAnimationAt, getAnimationAt, clearAnimationAt
} from '../lib/slideHtmlUtils';
import { ANIMATION_PRESETS, ANIMATION_DEFAULTS } from '../lib/animationCatalog';
import {
  Bot, Send, Sparkles, Download, Play, Code, Image, BarChart3, Tv, Paperclip, Link as LinkIcon, X, FileText, Loader2, Puzzle, Menu,
  AlignLeft, AlignCenter, AlignRight, ArrowUp, ArrowDown, Columns2, Rows3, Pencil, Trash2, Target, Wand2
} from 'lucide-react';

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
  // Em telas compactas (≤1024px), a lista de slides e o chat de IA viram
  // gavetas off-canvas em vez de colunas fixas — abertas/fechadas por aqui.
  const [mobileSlideListOpen, setMobileSlideListOpen] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  // Elemento de topo selecionado no slide (clique dentro do iframe editável)
  // — { index, scope, rect } | null. `scope` distingue filhos de ".slide-root"
  // dos de <body> direto (slides sem ".slide-root", ex. slide em branco novo).
  const [selectedEl, setSelectedEl] = useState(null);
  // Elemento pré-carregado no WidgetLibraryDrawer pra edição de campos (reabrir
  // o mesmo formulário de configuração usado na inserção original).
  const [editingWidgetContext, setEditingWidgetContext] = useState(null);
  // Quando setado, a próxima mensagem do chat de IA edita só este elemento
  // (envia o fragmento, não o slide inteiro) — ver handleSendChatMessage.
  const [chatScope, setChatScope] = useState(null);
  // Painel "Animar" do elemento selecionado — aberto/fechado + duração/atraso
  // configurados no momento (pré-preenchidos com a animação já aplicada, se houver).
  const [animPanelOpen, setAnimPanelOpen] = useState(false);
  const [animDuration, setAnimDuration] = useState(ANIMATION_DEFAULTS.duration);
  const [animDelay, setAnimDelay] = useState(ANIMATION_DEFAULTS.delay);

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

  // Recebe a seleção de elemento vinda do script injetado no iframe do slide
  // (ver PresentationViewer). Só um PresentationViewer "editable" existe por
  // vez (o palco principal, fora do modo tela cheia), então o identificador
  // na mensagem já é suficiente pra distinguir do resto do app.
  useEffect(() => {
    const handleMessage = (e) => {
      const data = e.data;
      if (!data || data.source !== SLIDE_EDITOR_MESSAGE_SOURCE) return;
      if (data.type === 'select') {
        setSelectedEl({ index: data.index, scope: data.scope, rect: data.rect });
      } else if (data.type === 'deselect') {
        setSelectedEl(null);
        setAnimPanelOpen(false);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Índices de seleção só fazem sentido pro slide/estado atual — trocar de
  // slide ou entrar/sair de tela cheia sempre recarrega o iframe do zero.
  useEffect(() => {
    setSelectedEl(null);
    setChatScope(null);
    setAnimPanelOpen(false);
  }, [activeIndex, isFullscreen]);

  // Ao selecionar um elemento novo, pré-preenche os controles de duração/atraso
  // do painel "Animar" com a animação já aplicada a ele (se houver) — sem isso,
  // ajustar os sliders num elemento recém-selecionado partiria de valores
  // deixados por uma seleção anterior, em vez do que já está de fato aplicado.
  useEffect(() => {
    if (!selectedEl) return;
    const anim = getAnimationAt(currentSlide.html, selectedEl.index);
    setAnimDuration(anim?.duration ?? ANIMATION_DEFAULTS.duration);
    setAnimDelay(anim?.delay ?? ANIMATION_DEFAULTS.delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEl?.index]);

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
      html: appendIntoRoot(currentSlide.html, mediaTag)
    };
    setPresentation({ ...presentation, slides: updatedSlides });
    setIsMediaDrawerOpen(false);
  };

  // `meta` ({ source, config }) só vem preenchido pra itens com formulário de
  // configuração (blocos/layouts/diagramas/widgets/ícones) — habilita a ação
  // "Editar campos" depois de inserido. Mídia e infográfico de IA não passam meta.
  const handleInsertWidget = (widgetHtml, meta) => {
    const updatedSlides = [...presentation.slides];
    updatedSlides[activeIndex] = {
      ...updatedSlides[activeIndex],
      html: appendIntoRoot(currentSlide.html, widgetHtml, meta)
    };
    setPresentation({ ...presentation, slides: updatedSlides });
    setIsWidgetDrawerOpen(false);
  };

  // Aplica uma mutação estrutural (alinhar/mover/agrupar/apagar/substituir) ao
  // HTML do slide atual e limpa a seleção — o iframe recarrega do zero com o
  // novo HTML, então manter um índice de seleção "antigo" não faz sentido.
  const mutateCurrentSlideHtml = (mutator) => {
    updateCurrentSlideHtml(mutator);
    setSelectedEl(null);
  };

  // Igual a `mutateCurrentSlideHtml`, mas mantém a seleção — usada por ações
  // que não mudam a posição do elemento na lista (animar), pra deixar a barra
  // e o painel abertos e testar vários presets em sequência sem reclicar.
  const updateCurrentSlideHtml = (mutator) => {
    const updatedSlides = [...presentation.slides];
    updatedSlides[activeIndex] = { ...updatedSlides[activeIndex], html: mutator(currentSlide.html) };
    setPresentation({ ...presentation, slides: updatedSlides });
  };

  const handleAlignElement = (align) => {
    if (!selectedEl) return;
    mutateCurrentSlideHtml((html) => setAlignmentAt(html, selectedEl.index, align));
  };

  const handleMoveElement = (direction) => {
    if (!selectedEl) return;
    mutateCurrentSlideHtml((html) => moveElementAt(html, selectedEl.index, direction));
  };

  const handleGroupElement = (neighbor) => {
    if (!selectedEl) return;
    mutateCurrentSlideHtml((html) => groupWithNeighborAt(html, selectedEl.index, neighbor));
  };

  const handleUngroupElement = () => {
    if (!selectedEl) return;
    mutateCurrentSlideHtml((html) => ungroupAt(html, selectedEl.index));
  };

  const handleDeleteElement = () => {
    if (!selectedEl) return;
    mutateCurrentSlideHtml((html) => removeElementAt(html, selectedEl.index));
  };

  // Abre o drawer de widgets pré-carregado no item/valores que geraram o
  // elemento selecionado, pra editar os campos sem precisar apagar e reinserir.
  const handleEditElementFields = () => {
    if (!selectedEl) return;
    const meta = getElementMeta(currentSlide.html, selectedEl.index);
    if (!meta) return;
    setEditingWidgetContext({ index: selectedEl.index, source: meta.source, config: meta.config });
    setIsWidgetDrawerOpen(true);
  };

  const handleUpdateWidgetElement = (index, newInnerHtml, config) => {
    mutateCurrentSlideHtml((html) => replaceElementInnerAt(html, index, newInnerHtml, config));
    setIsWidgetDrawerOpen(false);
    setEditingWidgetContext(null);
  };

  // Aplica um preset de animação ao elemento selecionado com a duração/atraso
  // configurados no momento — a troca de HTML já recarrega o palco, então a
  // animação toca na hora, servindo de preview automático.
  const handleApplyAnimation = (preset) => {
    if (!selectedEl) return;
    updateCurrentSlideHtml((html) => setAnimationAt(html, selectedEl.index, {
      presetId: preset.id, keyframe: preset.keyframe, loop: preset.loop, duration: animDuration, delay: animDelay
    }));
  };

  // Mexer nos sliders só reaplica ao vivo se já houver uma animação — caso
  // contrário, os valores só ficam prontos pro próximo preset escolhido.
  const handleAnimSliderChange = (field, value) => {
    if (field === 'duration') setAnimDuration(value); else setAnimDelay(value);
    if (!selectedEl) return;
    const current = getAnimationAt(currentSlide.html, selectedEl.index);
    if (!current) return;
    const preset = ANIMATION_PRESETS.find((p) => p.id === current.presetId);
    if (!preset) return;
    updateCurrentSlideHtml((html) => setAnimationAt(html, selectedEl.index, {
      presetId: preset.id,
      keyframe: preset.keyframe,
      loop: preset.loop,
      duration: field === 'duration' ? value : animDuration,
      delay: field === 'delay' ? value : animDelay
    }));
  };

  const handleClearAnimation = () => {
    if (!selectedEl) return;
    updateCurrentSlideHtml((html) => clearAnimationAt(html, selectedEl.index));
  };

  // Restringe a próxima mensagem da IA a editar só o elemento selecionado —
  // evita o problema de pedir uma mudança pontual e a IA reescrever/derrubar
  // o resto do slide (ela só recebe e só devolve o fragmento deste elemento).
  const handleScopeChatToSelection = () => {
    if (!selectedEl) return;
    setChatScope({ index: selectedEl.index });
    setMobileChatOpen(true);
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
    const scopeAtSend = chatScope;
    setChatInput('');
    setChatAttachments([]);
    setChatScope(null);
    setChatMessages(prev => [...prev, { sender: 'user', text: userText, attachments: attachmentsSent }]);
    setChatLoading(true);

    const materials = attachmentsSent.filter(a => a.kind === 'text').map(a => `[${a.name}]\n${a.content}`).join('\n\n');
    const images = attachmentsSent.filter(a => a.kind === 'image').map(({ mimeType, data }) => ({ mimeType, data }));
    const elementHtml = scopeAtSend ? getElementAt(currentSlide.html, scopeAtSend.index) : null;

    try {
      const res = await apiFetch('/api/ai/edit-slide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentHtml: currentSlide.html,
          instruction: userText,
          materials: materials || undefined,
          images: images.length ? images : undefined,
          elementHtml: elementHtml || undefined
        })
      });
      const data = await res.json();

      if (data.success && data.newHtml) {
        // Com escopo: a resposta é só o fragmento do elemento selecionado —
        // substitui apenas ele, preservando o resto do slide intacto.
        const updatedHtml = scopeAtSend
          ? replaceElementAt(currentSlide.html, scopeAtSend.index, data.newHtml)
          : data.newHtml;
        const updatedSlides = [...presentation.slides];
        updatedSlides[activeIndex] = {
          ...updatedSlides[activeIndex],
          html: updatedHtml
        };
        setPresentation({ ...presentation, slides: updatedSlides });
        const successText = scopeAtSend
          ? `✨ Elemento selecionado atualizado com sucesso!`
          : `✨ Slide #${activeIndex + 1} atualizado com sucesso!`;
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
      {/* Gavetas móveis (lista de slides / chat) usam a mesma sobreposição pra fechar ao tocar fora */}
      {!isFullscreen && (mobileSlideListOpen || mobileChatOpen) && (
        <div
          className="mobile-drawer-backdrop below-header"
          onClick={() => {
            setMobileSlideListOpen(false);
            setMobileChatOpen(false);
          }}
        />
      )}

      {/* Sidebar Esquerda (Miniaturas de Slides) */}
      {!isFullscreen && (
        <SlideList
          className={mobileSlideListOpen ? 'mobile-open' : ''}
          slides={presentation.slides}
          activeIndex={activeIndex}
          onSelectSlide={(idx) => {
            emitSlideChanged(idx);
            setMobileSlideListOpen(false);
          }}
          onClose={() => setMobileSlideListOpen(false)}
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
          <div style={{ display: 'flex', flexWrap: 'wrap', rowGap: '0.5rem', gap: '0.5rem', marginBottom: '1rem', width: '100%', maxWidth: '1100px', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                className="btn-icon mobile-toggle-btn"
                onClick={() => setMobileSlideListOpen(true)}
                title="Ver Lista de Slides"
                style={{ background: 'rgba(255,255,255,0.08)' }}
              >
                <Menu size={18} />
              </button>
              <h1 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f3f4f6' }}>
                {presentation.title} <span style={{ fontSize: '0.85rem', fontWeight: 400, color: '#9ca3af' }}>({activeIndex + 1}/{presentation.slides.length})</span>
              </h1>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', rowGap: '0.4rem', gap: '0.4rem', alignItems: 'center' }}>
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
                <BarChart3 size={16} /> <span className="btn-label">Relatórios</span>
              </button>
              <button className="btn-primary" onClick={() => setShowPresenterWindow(true)} style={{ background: 'linear-gradient(135deg, #22d3ee, #10b981)', fontSize: '0.82rem' }}>
                <Tv size={16} /> <span className="btn-label">Visão Apresentador</span>
              </button>
              <button className="btn-primary" onClick={toggleFullscreen} style={{ fontSize: '0.82rem' }}>
                <Play size={16} /> <span className="btn-label">Apresentar (F)</span>
              </button>
              <button
                className="btn-icon mobile-toggle-btn"
                onClick={() => setMobileChatOpen(true)}
                title="Editar Slide com IA"
                style={{ background: 'rgba(255,255,255,0.08)' }}
              >
                <Bot size={18} />
              </button>
            </div>
          </div>
        )}

        {!isFullscreen && currentSlide.type === 'quiz' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', width: '100%', maxWidth: '1100px', fontSize: '0.8rem', color: '#9ca3af' }}>
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-start', marginBottom: '0.75rem', width: '100%', maxWidth: '1100px', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '0.5rem' }}>
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
          <PresentationViewer htmlContent={currentSlide.html} reloadKey={isFullscreen} editable={!isFullscreen} />

          {/* Barra de ação do elemento selecionado (clique num elemento de topo do slide) */}
          {!isFullscreen && selectedEl && (() => {
            const elementMeta = getElementMeta(currentSlide.html, selectedEl.index);
            const grouped = isGroupedAt(currentSlide.html, selectedEl.index);
            const currentAnim = getAnimationAt(currentSlide.html, selectedEl.index);
            const btnStyle = { width: '30px', height: '30px' };
            const divider = <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.15)', margin: '0 0.15rem' }} />;
            const toolbarTop = Math.max(4, selectedEl.rect.top - 46);
            const toolbarLeft = Math.max(4, selectedEl.rect.left);

            return (
              <>
                <div
                  className="glass-panel"
                  style={{
                    position: 'absolute',
                    top: `${toolbarTop}px`,
                    left: `${toolbarLeft}px`,
                    zIndex: 40,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.15rem',
                    padding: '0.3rem',
                    background: 'rgba(15, 23, 42, 0.95)'
                  }}
                >
                  <button className="btn-icon" style={btnStyle} title="Alinhar à esquerda" onClick={() => handleAlignElement('left')}><AlignLeft size={15} /></button>
                  <button className="btn-icon" style={btnStyle} title="Centralizar" onClick={() => handleAlignElement('center')}><AlignCenter size={15} /></button>
                  <button className="btn-icon" style={btnStyle} title="Alinhar à direita" onClick={() => handleAlignElement('right')}><AlignRight size={15} /></button>
                  {divider}
                  <button className="btn-icon" style={btnStyle} title="Mover para cima" onClick={() => handleMoveElement('up')}><ArrowUp size={15} /></button>
                  <button className="btn-icon" style={btnStyle} title="Mover para baixo" onClick={() => handleMoveElement('down')}><ArrowDown size={15} /></button>
                  {divider}
                  {grouped ? (
                    <button className="btn-icon" style={btnStyle} title="Desagrupar" onClick={handleUngroupElement}><Rows3 size={15} /></button>
                  ) : (
                    <>
                      <button className="btn-icon" style={btnStyle} title="Colocar ao lado do anterior" onClick={() => handleGroupElement('prev')}><Columns2 size={15} /></button>
                      <button className="btn-icon" style={btnStyle} title="Colocar ao lado do próximo" onClick={() => handleGroupElement('next')}><Columns2 size={15} style={{ transform: 'scaleX(-1)' }} /></button>
                    </>
                  )}
                  {divider}
                  <button
                    className={`btn-icon ${animPanelOpen ? 'active' : ''}`}
                    style={btnStyle}
                    title="Animar elemento"
                    onClick={() => setAnimPanelOpen((v) => !v)}
                  >
                    <Wand2 size={15} />
                  </button>
                  {elementMeta && (
                    <>
                      {divider}
                      <button className="btn-icon" style={btnStyle} title="Editar campos" onClick={handleEditElementFields}><Pencil size={15} /></button>
                    </>
                  )}
                  {divider}
                  <button className="btn-icon" style={btnStyle} title="Editar este elemento com IA" onClick={handleScopeChatToSelection}><Bot size={15} /></button>
                  <button className="btn-icon" style={{ ...btnStyle, color: '#f87171' }} title="Apagar elemento" onClick={handleDeleteElement}><Trash2 size={15} /></button>
                </div>

                {animPanelOpen && (
                  <div
                    className="glass-panel"
                    style={{
                      position: 'absolute',
                      top: `${toolbarTop + 40}px`,
                      left: `${toolbarLeft}px`,
                      zIndex: 41,
                      width: '230px',
                      padding: '0.7rem',
                      background: 'rgba(15, 23, 42, 0.97)'
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem', marginBottom: '0.65rem' }}>
                      {ANIMATION_PRESETS.map((preset) => {
                        const active = currentAnim?.presetId === preset.id;
                        return (
                          <button
                            key={preset.id}
                            onClick={() => handleApplyAnimation(preset)}
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              padding: '0.4rem 0.3rem',
                              borderRadius: '0.4rem',
                              cursor: 'pointer',
                              border: active ? '1px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.1)',
                              background: active ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.04)',
                              color: active ? '#67e8f9' : '#e5e7eb'
                            }}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>

                    <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#9ca3af', marginBottom: '0.15rem' }}>
                      <span>Duração</span><span>{animDuration.toFixed(1)}s</span>
                    </label>
                    <input
                      type="range" min="0.2" max="1.5" step="0.1" value={animDuration}
                      onChange={(e) => handleAnimSliderChange('duration', Number(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--accent-primary)', marginBottom: '0.5rem' }}
                    />

                    <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#9ca3af', marginBottom: '0.15rem' }}>
                      <span>Atraso</span><span>{animDelay.toFixed(1)}s</span>
                    </label>
                    <input
                      type="range" min="0" max="1.5" step="0.1" value={animDelay}
                      onChange={(e) => handleAnimSliderChange('delay', Number(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--accent-primary)' }}
                    />

                    {currentAnim && (
                      <button
                        className="btn-icon"
                        style={{ width: '100%', marginTop: '0.6rem', color: '#f87171', fontSize: '0.75rem', gap: '0.35rem' }}
                        onClick={handleClearAnimation}
                      >
                        <Trash2 size={13} /> Remover animação
                      </button>
                    )}
                  </div>
                )}
              </>
            );
          })()}

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
        <div className={`sidebar-chat ${mobileChatOpen ? 'mobile-open' : ''}`}>
          <div className="chat-header">
            <Bot size={18} color="var(--accent-primary)" />
            <span style={{ flex: 1 }}>Editar Slide #{activeIndex + 1} com IA</span>
            <button className="btn-icon mobile-toggle-btn" onClick={() => setMobileChatOpen(false)} style={{ width: '28px', height: '28px' }}>
              <X size={16} />
            </button>
          </div>

          {chatScope && (
            <div style={{ margin: '0.75rem 1rem 0', padding: '0.4rem 0.7rem', background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.3)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: '#67e8f9' }}>
              <Target size={13} /> Editando só o elemento selecionado
              <button type="button" onClick={() => setChatScope(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#67e8f9', cursor: 'pointer', display: 'flex' }}>
                <X size={13} />
              </button>
            </div>
          )}

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
        onClose={() => { setIsWidgetDrawerOpen(false); setEditingWidgetContext(null); }}
        onInsertWidget={handleInsertWidget}
        editingContext={editingWidgetContext}
        onUpdateElement={handleUpdateWidgetElement}
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
