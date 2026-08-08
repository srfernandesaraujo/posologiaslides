import React, { useState, useRef, useEffect } from 'react';
import PresentationViewer, { SLIDE_EDITOR_MESSAGE_SOURCE } from './PresentationViewer';
import DrawingCanvas from './DrawingCanvas';
import PresentationControls from './PresentationControls';
import SlideList from './SlideList';
import ActiveMethodologiesOverlay from './ActiveMethodologiesOverlay';
import MediaLibraryDrawer from './MediaLibraryDrawer';
import WidgetLibraryDrawer from './WidgetLibraryDrawer';
import SlideTemplateGallery from './SlideTemplateGallery';
import AISingleSlideModal from './AISingleSlideModal';
import CodeSlideModal from './CodeSlideModal';
import SlideBackgroundModal from './SlideBackgroundModal';
import SlideBrandingModal from './SlideBrandingModal';
import LayoutVariationsModal from './LayoutVariationsModal';
import TableFieldEditor from './TableFieldEditor';
import RelatedPresentationPicker from './RelatedPresentationPicker';
import PresenterWindow from './PresenterWindow';
import PresentationReportModal from './PresentationReportModal';
import ShareLinkModal from './ShareLinkModal';
import RemoteControlModal from './RemoteControlModal';
import ExportModal from './ExportModal';
import PromptGeneratorModal from './PromptGeneratorModal';
import { io } from 'socket.io-client';
import { apiFetch, API_URL } from '../lib/api';
import { auth } from '../lib/firebase';
import {
  appendIntoRoot, getElementAt, removeElementAt, replaceElementAt, replaceElementInnerAt,
  moveElementAt, bringToFrontAt, sendToBackAt, regenerateElementIds, setAlignmentAt, groupWithNeighborAt, ungroupAt, isGroupedAt, getElementMeta,
  setAnimationEntryAt, getAnimationsAt, clearAnimationEntryAt, setAllAnimationsAt, setPositionAt, clearPositionAt, isPositionedAt,
  setCropAt, clearCropAt, isCroppedAt, setTextStyleAt, getTextStyleAt,
  hasTableAt, getTableRowsAt, setTableRowsAt,
  getSlideBackground, setSlideBackground, applyBrandingToSlideHtml, removeBrandingFromSlideHtml,
  getSlideScrollable, setSlideScrollable,
  scaleSlideToCanvas, unscaleSlideFromCanvas, isSlideScaledToCanvas
} from '../lib/slideHtmlUtils';
import { ANIMATION_PRESETS, ANIMATION_CATEGORIES, ANIMATION_TRIGGERS, ANIMATION_DEFAULTS } from '../lib/animationCatalog';
import { FONT_OPTIONS, TEXT_COLOR_SWATCHES } from '../lib/fontCatalog';
import { TRANSITION_PRESETS, TRANSITION_DEFAULTS, TRANSITION_DURATION_RANGE, resolveTransition } from '../lib/transitionCatalog';
import { buildClosingSlideHtml, RELATED_LINK_MESSAGE_SOURCE } from '../lib/closingSlideTemplate';
import useCanvasFit from '../lib/useCanvasFit';
import { SLIDE_NATIVE_WIDTH, SLIDE_NATIVE_HEIGHT, STAGE_BOTTOM_RESERVE, ZOOM_EDIT_RANGE, ZOOM_PRESENT_RANGE, ZOOM_STEP } from '../lib/canvasConstants';
import useUndoHistory from '../lib/useUndoHistory';
import useScreenWakeLock from '../lib/useScreenWakeLock';
import { useAuth } from '../context/AuthContext';
import {
  Bot, Send, Sparkles, Download, Play, Code, Image, BarChart3, Tv, Paperclip, Link as LinkIcon, X, FileText, Loader2, Puzzle, Menu, Upload,
  AlignLeft, AlignCenter, AlignRight, ArrowUp, ArrowDown, Columns2, Rows3, Pencil, Trash2, Target, Wand2, Save, PinOff, ArrowLeftRight, Undo2, Redo2, Share2, Crop,
  GitBranch, Plus, BringToFront, SendToBack, Milestone, Copy, ClipboardPaste, ClipboardCopy, Baseline, Shuffle, Table2, Palette, UserCheck, ScrollText, Maximize2, StickyNote,
  Smartphone, MousePointer2
} from 'lucide-react';

// Tamanho do canvas ANTES da migração pra 1920x1080 (ver lib/canvasConstants.js)
// — slides antigos (a maioria da biblioteca do usuário até 2026-08-05) foram
// desenhados assumindo esta resolução; usado só por handleToggleNativeScale
// pra calcular o fator de escala, não é mais o tamanho ativo do canvas.
const LEGACY_SLIDE_WIDTH = 1280;
const LEGACY_SLIDE_HEIGHT = 720;

// Trackpad do controle remoto (ver RemoteControl.jsx): os deltas que chegam
// do celular já vêm em % da própria área de toque dele (não pixels crus, pra
// não depender do tamanho de tela do aparelho — ver remote_cursor_move em
// sessionSocket.js). Estes multiplicadores é que decidem o quanto isso se
// traduz em movimento real aqui — CURSOR_SENSITIVITY calibrado pra um arrasto
// de ponta a ponta da área de toque não passar muito de metade do slide de
// uma vez (controle preciso); SCROLL_SENSITIVITY só precisa "parecer" uma
// rolagem normal de página.
const CURSOR_SENSITIVITY = 2.5;
const SCROLL_SENSITIVITY = 6;

// O DOM normaliza valores de estilo ao ler de volta (cor hex vira "rgb(...)",
// aspas de font-family podem mudar) — estas duas convertem pra uma forma
// canônica só pra COMPARAR com as opções do painel "Texto" (swatch ativo,
// item selecionado no <select> de fonte); o valor de fato aplicado ao slide
// continua sendo o que `setTextStyleAt` grava, sem passar por aqui.
function colorToHex(color) {
  if (!color) return '';
  if (color.startsWith('#')) return color.toLowerCase();
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return '';
  const toHex = (n) => Number(n).toString(16).padStart(2, '0');
  return `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`;
}

function normalizeFontValue(value) {
  return (value || '').replace(/["']/g, '').trim().toLowerCase();
}

export default function PresentationEditor({ presentation, setPresentation, onOpenModal, onOpenPresentation }) {
  const { user } = useAuth();
  // Desfazer/Refazer: `commit`/`commitDebounced` substituem `setPresentation`
  // direto em todo handler que muda `presentation` (ver troca abaixo) — só
  // handlers de leitura/estado de UI (seleção, painéis abertos) continuam
  // usando os setters normais, esses não fazem parte do histórico.
  const { commit, commitDebounced, undo, redo, canUndo, canRedo } = useUndoHistory(presentation, setPresentation);
  const [activeIndex, setActiveIndex] = useState(0);
  // Refs "sempre frescas" — usadas só por handlers que continuam depois de um
  // `await` (upload de mídia, resposta da IA no chat): a variável `presentation`/
  // `activeIndex` capturada por closure nesses handlers é a versão de QUANDO
  // o handler começou, não a atual. Se o usuário inserir/editar outros slides
  // por outro caminho (síncrono) enquanto isso, commitar `{ ...presentation,
  // slides: X }` construído a partir da closure antiga sobrescreve — e
  // descarta — essas mudanças concorrentes (bug relatado: slides recém-
  // inseridos, e até um slide preexistente, somem depois do autosave). Ler
  // destas refs no momento do commit em vez da variável capturada resolve,
  // sem afetar handlers síncronos (a ref já está em dia nesse caso).
  const presentationRef = useRef(presentation);
  const activeIndexRef = useRef(activeIndex);
  useEffect(() => { presentationRef.current = presentation; }, [presentation]);
  useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);
  // Slide de encerramento virtual: exibido ao avançar a partir do último
  // slide real, nunca é gravado em presentation.slides (ver handleNext /
  // currentSlide abaixo).
  const [atClosingSlide, setAtClosingSlide] = useState(false);
  const [closingQuote, setClosingQuote] = useState(null);
  const [closingQuoteLoading, setClosingQuoteLoading] = useState(false);
  const [activeTool, setActiveTool] = useState('pointer');
  const [activeColor, setActiveColor] = useState('#ef4444');
  const [clearTrigger, setClearTrigger] = useState(0);
  // Modo destaque: liga/desliga independente das ferramentas de desenho —
  // só tem efeito de verdade em apresentação real (ver spotlightEnabled
  // passado a PresentationViewer abaixo), mas fica "armado" mesmo editando.
  const [spotlightOn, setSpotlightOn] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [isMediaDrawerOpen, setIsMediaDrawerOpen] = useState(false);
  const [isWidgetDrawerOpen, setIsWidgetDrawerOpen] = useState(false);
  const [showBranchPanel, setShowBranchPanel] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [promptGeneratorOpen, setPromptGeneratorOpen] = useState(false);
  const [showPresenterWindow, setShowPresenterWindow] = useState(false);
  // Painel de anotações do apresentador (como o painel de notas do
  // PowerPoint), embaixo do canvas — fechado por padrão pra não encolher o
  // slide em telas mais baixas logo de cara; o usuário liga quando precisa.
  const [notesPanelOpen, setNotesPanelOpen] = useState(false);
  // Em telas compactas (≤1024px), a lista de slides e o chat de IA viram
  // gavetas off-canvas em vez de colunas fixas — abertas/fechadas por aqui.
  const [mobileSlideListOpen, setMobileSlideListOpen] = useState(false);
  // Galeria de templates (ver SlideTemplateGallery) — `templateInsertIndex`
  // guarda onde o slide escolhido deve entrar (fim da lista ou logo após uma
  // miniatura específica), decidido no momento em que a galeria é aberta.
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState(false);
  const [templateInsertIndex, setTemplateInsertIndex] = useState(0);
  // Modal "Novo Slide com IA" (ver AISingleSlideModal) — reaproveita
  // `templateInsertIndex` acima pra guardar onde o slide gerado deve entrar.
  const [aiSingleSlideOpen, setAiSingleSlideOpen] = useState(false);
  // Modal "Novo Slide por Código" (ver CodeSlideModal)
  const [codeSlideOpen, setCodeSlideOpen] = useState(false);
  // Modais de Fundo de Slide e Informações Identificadoras (Branding)
  const [slideBgModalOpen, setSlideBgModalOpen] = useState(false);
  const [slideBrandingModalOpen, setSlideBrandingModalOpen] = useState(false);
  // Modal "Trocar Layout" (ver LayoutVariationsModal) — sempre escopado ao
  // elemento selecionado no momento em que abre (mesmo `selectedEl` da barra
  // de ação), não precisa de índice próprio.
  const [layoutVariationsOpen, setLayoutVariationsOpen] = useState(false);
  // Modal "Editar tabela" — mesma ideia, escopado ao `selectedEl` atual;
  // edita o PRIMEIRO <table> dentro do elemento (ver hasTableAt/getTableRowsAt/
  // setTableRowsAt), funciona mesmo em elementos sem metadado de catálogo
  // (ex.: tabela dentro de um template escrito à mão).
  const [tableEditOpen, setTableEditOpen] = useState(false);
  const [tableDraft, setTableDraft] = useState('');
  // Só recarrega o rascunho quando o modal ABRE (não a cada render enquanto
  // fica aberto) — senão qualquer novo render do componente pai (não raro,
  // já que `currentSlide.html` muda a cada tecla se algo mais estivesse
  // editando ao mesmo tempo) apagaria as edições feitas na grade.
  useEffect(() => {
    if (tableEditOpen && selectedEl) {
      setTableDraft(getTableRowsAt(currentSlide.html, selectedEl.index) || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableEditOpen]);
  // Aula relacionada (ver RelatedPresentationPicker) — link mostrado no slide
  // de encerramento virtual, guardado como relatedPresentationId/Title direto
  // no objeto `presentation` (persistido pelo autosave normal).
  const [relatedPickerOpen, setRelatedPickerOpen] = useState(false);
  // Copiar/colar elemento entre slides — guarda o outerHTML exato do elemento
  // copiado (inclui data-el-source/config, posição livre, recorte, animação,
  // já que tudo isso vive como atributo/estilo no próprio nó de topo). Fica só
  // em memória (React state): não precisa sobreviver a um recarregamento de
  // página pra atender o pedido ("copiar de um slide, colar em outro").
  const [elementClipboard, setElementClipboard] = useState(null);
  // Igual acima, mas guarda a lista de entradas de `data-el-anim` de um
  // elemento (ver getAnimationsAt) pra "copiar animação de um objeto, colar
  // em outro" — inclusive entre slides diferentes, mesmo espírito.
  const [animationClipboard, setAnimationClipboard] = useState(null);
  // Chat de IA: painel flutuante que só aparece quando aberto (não é mais só
  // uma gaveta mobile — em qualquer largura de tela ele fica escondido até
  // ser aberto por este botão ou por "Editar este elemento com IA").
  const [chatOpen, setChatOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const handleSaveTitle = () => {
    setIsEditingTitle(false);
    if (titleDraft.trim() && titleDraft.trim() !== presentation?.title) {
      commit({ ...presentation, title: titleDraft.trim() });
    }
  };

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
  // Painel "Texto" (cor da fonte + família) do elemento selecionado — mesmo
  // espírito do animPanelOpen: persiste ao trocar de elemento dentro do mesmo
  // slide, reseta ao desselecionar/trocar de slide/desfazer.
  const [textStylePanelOpen, setTextStylePanelOpen] = useState(false);
  // Modo de recorte (aparar bordas) do elemento selecionado — troca as alças
  // de redimensionar por 4 alças de borda no palco (ver PresentationViewer/
  // buildEditorScript). Mesmo espírito do animPanelOpen: persiste ao trocar
  // de elemento selecionado dentro do mesmo slide, reseta ao desselecionar
  // ou trocar de slide (ver handleMessage/'deselect' e o efeito de troca de
  // slide mais abaixo).
  const [cropMode, setCropMode] = useState(false);
  const [hotspotUploading, setHotspotUploading] = useState(false);
  const [hotspotUploadError, setHotspotUploadError] = useState('');
  const [animDuration, setAnimDuration] = useState(ANIMATION_DEFAULTS.duration);
  const [animDelay, setAnimDelay] = useState(ANIMATION_DEFAULTS.delay);
  const [animTrigger, setAnimTrigger] = useState(ANIMATION_DEFAULTS.trigger);
  // Categoria (Entrada/Ênfase/Saída) exibida no momento no painel "Animar" —
  // só filtra quais presets aparecem no grid; duração/atraso/gatilho exibidos
  // são os da entrada JÁ APLICADA nessa categoria (elemento pode ter uma
  // entrada por categoria ao mesmo tempo, ver ANIMATION_CATEGORIES). Ver
  // useEffect abaixo (sincroniza ao selecionar um elemento novo) e
  // handleSelectAnimCategory (sincroniza ao trocar de aba).
  const [animCategory, setAnimCategory] = useState('entrance');
  // Painel "Transição" do slide atual (como este slide entra em cena) —
  // aberto/fechado igual ao painel "Animar" de elemento, mas em escopo de slide.
  const [transitionPanelOpen, setTransitionPanelOpen] = useState(false);
  // Editor de HTML bruto do elemento selecionado — alternativa ao "Editar
  // campos" pra elementos sem metadado de catálogo (títulos, texto solto,
  // diagramas/gráficos escritos direto pela IA na geração do slide), que por
  // não terem vindo da gaveta "Inserir Conteúdo" não têm um formulário
  // estruturado pra reabrir. String com o HTML em edição quando aberto, null
  // quando fechado.
  const [elementHtmlDraft, setElementHtmlDraft] = useState(null);

  // Sockets & PIN para sessão ao vivo
  const [socket, setSocket] = useState(null);
  const [pin, setPin] = useState('849201');
  const [remoteControlOpen, setRemoteControlOpen] = useState(false);
  // Amplia o painel de QR Code/resultados ao vivo (ActiveMethodologiesOverlay)
  // pra turma ver melhor — ver botão dedicado dentro do próprio overlay.
  const [overlayExpanded, setOverlayExpanded] = useState(false);
  // handleNext/handlePrev são recriadas a cada render (fecham sobre
  // activeIndex/presentation atuais) — o listener de 'remote_navigate' vive
  // dentro do useEffect que cria o socket, que só roda de novo quando
  // presentation.title muda, então chamaria sempre a versão do PRIMEIRO
  // render sem essas refs (index/slides desatualizados assim que o
  // apresentador avançasse um slide). As refs são realinhadas a cada render
  // no useEffect logo abaixo da definição de handleNext/handlePrev.
  const handleNextRef = useRef(() => {});
  const handlePrevRef = useRef(() => {});

  // Trackpad do controle remoto (ver RemoteControl.jsx): posição do cursor
  // virtual, em % do canvas nativo (0-100), null enquanto o celular não
  // mandou nenhum movimento ainda — só aparece em tela cheia (ver JSX do
  // overlay). `stageIframeRef` aponta pro <iframe> do slide sendo exibido
  // agora (mesmo PresentationViewer usado em edição e apresentação, ver
  // `ref={stageIframeRef}` mais abaixo) — usado tanto pra simular o clique
  // (elementFromPoint + dispatchEvent) quanto pra rolar o documento do slide.
  const stageIframeRef = useRef(null);
  const [remoteCursor, setRemoteCursor] = useState(null);
  const remoteCursorRef = useRef(null);
  useEffect(() => { remoteCursorRef.current = remoteCursor; }, [remoteCursor]);

  // Chat com IA
  const [chatMessages, setChatMessages] = useState([
    { sender: 'ai', text: 'Olá! Sou seu assistente de IA. Selecione um slide e me peça para alterar cores, adicionar gráficos, simuladores ou novos conteúdos!' }
  ]);
  const [chatInput, setChatInput] = useState('');
  // Auto-cresce o campo de instrução (textarea) conforme o texto ganha linhas
  // — ver useEffect logo abaixo, que recalcula a altura toda vez que
  // `chatInput` muda (digitação OU limpeza programática ao enviar).
  const chatInputRef = useRef(null);
  const CHAT_INPUT_MAX_HEIGHT = 140;
  const [chatLoading, setChatLoading] = useState(false);
  const [chatAttachments, setChatAttachments] = useState([]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [attachLinkUrl, setAttachLinkUrl] = useState('');
  const [attachLoading, setAttachLoading] = useState(false);

  // Canvas nativo fixo (1920x1080) escalado via CSS transform pra caber na
  // caixa real do palco — mesma matemática de layout em edição e apresentação
  // (só o multiplicador `scale` muda entre os dois modos). `bottomReserve`
  // garante uma faixa inferior sempre livre pra PresentationControls nunca
  // ficar atrás do conteúdo do slide em telas pequenas.
  const { outerRef: stageRef, scale: canvasScale } = useCanvasFit(SLIDE_NATIVE_WIDTH, SLIDE_NATIVE_HEIGHT, { bottomReserve: STAGE_BOTTOM_RESERVE });
  const chatMessagesRef = useRef(null);

  // Zoom manual (multiplicador em cima de canvasScale — ver ZOOM_EDIT_RANGE/
  // ZOOM_PRESENT_RANGE em canvasConstants.js): estado de UI pura, nunca entra
  // no histórico de desfazer/refazer. `scrollOffset` acompanha a rolagem do
  // `.zoom-scrollport` (novo wrapper, ver JSX abaixo) só pra manter a barra de
  // ação do elemento selecionado alinhada — a navegação em si (arrastar a
  // visão) é rolagem nativa do navegador, sem nenhum código de arraste.
  const [zoom, setZoom] = useState(1);
  const [scrollOffset, setScrollOffset] = useState({ top: 0, left: 0 });
  const zoomScrollportRef = useRef(null);
  const effectiveScale = canvasScale * zoom;

  const clampZoom = (z) => {
    const [min, max] = isFullscreen ? ZOOM_PRESENT_RANGE : ZOOM_EDIT_RANGE;
    return Math.min(max, Math.max(min, z));
  };
  const handleZoomIn = () => setZoom((z) => clampZoom(z + ZOOM_STEP));
  const handleZoomOut = () => setZoom((z) => clampZoom(z - ZOOM_STEP));
  const handleZoomReset = () => setZoom(1);

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
        hotspotConfig: presentation.slides?.[0]?.hotspotConfig || null,
        pointsConfig: presentation.slides?.[0]?.pointsConfig || null,
        branches: presentation.slides?.[0]?.branches || null,
        slideTitle: presentation.slides?.[0]?.title || null,
        slideNotes: presentation.slides?.[0]?.notes || null,
        totalSlides: presentation.slides?.length || null
      });

      newSocket.on('session_created', ({ pin: newPin }) => {
        setPin(newPin);
      });

      // Controle remoto (celular) pediu pra avançar/voltar — ver
      // RemoteControlModal/RemoteControl.jsx. Usa as refs (não handleNext/
      // handlePrev direto) porque este listener é registrado uma vez só,
      // dentro de um efeito que não roda de novo a cada troca de slide.
      newSocket.on('remote_navigate', ({ direction }) => {
        if (direction === 'next') handleNextRef.current();
        else if (direction === 'prev') handlePrevRef.current();
      });

      // Trackpad do controle remoto — modo cursor: acumula o delta recebido
      // (ver CURSOR_SENSITIVITY acima) na posição atual do cursor virtual,
      // sempre travado entre 0-100% do canvas nativo. Lido a partir do valor
      // anterior via updater function (não closure), então não precisa de
      // ref pra "current remoteCursor" aqui.
      newSocket.on('remote_cursor_move', ({ dxPercent, dyPercent }) => {
        setRemoteCursor((prev) => {
          const base = prev || { xPct: 50, yPct: 50 };
          return {
            xPct: Math.min(100, Math.max(0, base.xPct + (dxPercent || 0) * CURSOR_SENSITIVITY)),
            yPct: Math.min(100, Math.max(0, base.yPct + (dyPercent || 0) * CURSOR_SENSITIVITY))
          };
        });
      });

      // Trackpad — toque curto no modo cursor: simula um clique de verdade no
      // elemento que está embaixo do cursor virtual DENTRO do documento do
      // slide (mesma origem do app, ver PresentationViewer.jsx — por isso dá
      // pra acessar contentDocument direto). elementFromPoint usa coordenadas
      // de VIEWPORT do iframe, que é sempre 1920x1080 "de verdade" (o zoom da
      // apresentação é só um transform CSS no container de fora, não muda o
      // tamanho de layout interno do iframe) — não precisa descontar zoom
      // nem rolagem aqui.
      newSocket.on('remote_cursor_click', () => {
        const iframe = stageIframeRef.current;
        const cursor = remoteCursorRef.current;
        const doc = iframe?.contentDocument;
        if (!doc || !cursor) return;

        const x = (cursor.xPct / 100) * SLIDE_NATIVE_WIDTH;
        const y = (cursor.yPct / 100) * SLIDE_NATIVE_HEIGHT;
        const target = doc.elementFromPoint(x, y);
        if (!target) return;

        const eventInit = { bubbles: true, cancelable: true, view: iframe.contentWindow, clientX: x, clientY: y };
        target.dispatchEvent(new PointerEvent('pointerdown', eventInit));
        target.dispatchEvent(new MouseEvent('mousedown', eventInit));
        target.dispatchEvent(new PointerEvent('pointerup', eventInit));
        target.dispatchEvent(new MouseEvent('mouseup', eventInit));
        target.dispatchEvent(new MouseEvent('click', eventInit));
      });

      // Trackpad — modo rolar: aplica o delta direto no scroll do documento
      // do slide (o mesmo body com overflow-y:auto usado por slides mais
      // altos que os 1080px nativos, ver PresentationViewer.jsx).
      newSocket.on('remote_scroll', ({ dyPercent }) => {
        const doc = stageIframeRef.current?.contentDocument;
        // Quem rola de verdade é o <body> (overflow-y:auto, ver
        // PresentationViewer.jsx) — o <html> tem overflow:hidden de
        // propósito ali (evita scrollbar duplicada), então
        // `document.scrollingElement` (que aponta pro <html> em modo
        // standards) NUNCA é null e o `||` abaixo nunca chegava a usar o
        // body de verdade. Corrigido: usa body primeiro.
        const scrollEl = doc?.body || doc?.scrollingElement;
        if (!scrollEl) return;
        scrollEl.scrollTop += (dyPercent || 0) * SCROLL_SENSITIVITY;
      });
    })();

    return () => {
      cancelled = true;
      if (newSocket) newSocket.close();
    };
  }, [presentation.title]);

  const currentSlide = atClosingSlide
    ? {
        title: 'Encerramento',
        html: buildClosingSlideHtml({
          presentationTitle: presentation?.title,
          userName: user?.name,
          quote: closingQuote,
          quoteLoading: !closingQuote,
          relatedPresentation: presentation?.relatedPresentationId
            ? { id: presentation.relatedPresentationId, title: presentation.relatedPresentationTitle }
            : null
        })
      }
    : presentation?.slides?.[activeIndex] || {
        title: 'Slide Inicial',
        html: '<div style="color:white; padding:2rem;">Nenhum slide gerado ainda.</div>'
      };

  const isCurrentSlideScrollable = currentSlide ? getSlideScrollable(currentSlide.html) : false;

  const handleToggleSlideScrollable = () => {
    if (atClosingSlide || !currentSlide) return;
    const nextScrollable = !isCurrentSlideScrollable;
    const nextHtml = setSlideScrollable(currentSlide.html, nextScrollable);
    const updatedSlides = presentation.slides.map((s, idx) =>
      idx === activeIndex ? { ...s, html: nextHtml } : s
    );
    commit({ ...presentation, slides: updatedSlides });
  };

  const isCurrentSlideNativeScaled = currentSlide ? isSlideScaledToCanvas(currentSlide.html) : false;

  // Slide feito pro tamanho antigo do canvas (1280x720, ver LEGACY_SLIDE_*
  // acima) ficando pequeno/desconfigurado dentro do canvas atual, maior (ver
  // SLIDE_NATIVE_WIDTH/HEIGHT) — em vez de reescrever fonte/espaçamento um por
  // um, embrulha o conteúdo intocado numa caixa do tamanho antigo escalada
  // pra caber no tamanho atual (ver scaleSlideToCanvas). Clicar de novo com o
  // slide já ajustado desfaz (volta pro tamanho original, sem escala).
  const handleToggleNativeScale = () => {
    if (atClosingSlide || !currentSlide) return;
    const nextHtml = isCurrentSlideNativeScaled
      ? unscaleSlideFromCanvas(currentSlide.html)
      : scaleSlideToCanvas(currentSlide.html, LEGACY_SLIDE_WIDTH, LEGACY_SLIDE_HEIGHT, SLIDE_NATIVE_WIDTH, SLIDE_NATIVE_HEIGHT);
    const updatedSlides = presentation.slides.map((s, idx) =>
      idx === activeIndex ? { ...s, html: nextHtml } : s
    );
    commit({ ...presentation, slides: updatedSlides });
  };

  // Centraliza a troca de slide ativo: atualiza o estado local e avisa a
  // sessão ao vivo (se houver) do novo índice E do tipo de interatividade
  // do slide, pra o celular do aluno já saber o que mostrar.
  const emitSlideChanged = (newIndex) => {
    setActiveIndex(newIndex);
    setAtClosingSlide(false);
    if (socket) {
      const slide = presentation.slides[newIndex];
      socket.emit('slide_changed', {
        pin,
        newIndex,
        slideType: slide?.type || null,
        correctAnswer: slide?.correctAnswer || null,
        hotspotConfig: slide?.hotspotConfig || null,
        pointsConfig: slide?.pointsConfig || null,
        branches: slide?.branches || null,
        slideTitle: slide?.title || null,
        slideNotes: slide?.notes || null,
        totalSlides: presentation.slides.length
      });
    }
  };

  // Gera a citação de encerramento (relacionada ao tema da aula) assim que o
  // slide de encerramento é alcançado pela primeira vez — não refaz a busca
  // se o apresentador voltar e avançar de novo (mesma citação durante a sessão).
  useEffect(() => {
    if (!atClosingSlide || closingQuote || closingQuoteLoading) return;
    let cancelled = false;
    setClosingQuoteLoading(true);
    (async () => {
      try {
        const res = await apiFetch('/api/ai/generate-quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ presentationTitle: presentation?.title, description: presentation?.description })
        });
        const data = await res.json();
        if (!cancelled) {
          // Mesmo se a API responder mas sem sucesso (ex.: sessão expirada,
          // erro 500), cai pro mesmo texto de fallback — sem isso o slide
          // ficava preso no placeholder "Preparando..." pra sempre, já que
          // fetch só rejeita em falha de rede, não em respostas de erro HTTP.
          setClosingQuote(data.success ? data.quote : 'Que o aprendizado de hoje ilumine decisões mais seguras amanhã.');
        }
      } catch {
        if (!cancelled) setClosingQuote('Que o aprendizado de hoje ilumine decisões mais seguras amanhã.');
      } finally {
        if (!cancelled) setClosingQuoteLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [atClosingSlide]);

  const handleChangeSlideType = (type) => {
    const updatedSlides = [...presentation.slides];
    updatedSlides[activeIndex] = { ...updatedSlides[activeIndex], type: type || undefined };
    commit({ ...presentation, slides: updatedSlides });
  };

  // Transição de ENTRADA deste slide específico — cada slide guarda a sua
  // própria (slide.transition = { type, duration }), independente dos demais.
  // commitDebounced porque também é chamado a cada pixel arrastado no slider
  // de duração (ver painel de transição), não só nos botões de preset.
  const handleChangeSlideTransition = (patch) => {
    if (atClosingSlide) return;
    const updatedSlides = [...presentation.slides];
    const current = resolveTransition(updatedSlides[activeIndex].transition);
    updatedSlides[activeIndex] = { ...updatedSlides[activeIndex], transition: { ...current, ...patch } };
    commitDebounced({ ...presentation, slides: updatedSlides });
  };

  const handleChangeCorrectAnswer = (answer) => {
    const updatedSlides = [...presentation.slides];
    updatedSlides[activeIndex] = { ...updatedSlides[activeIndex], correctAnswer: answer || undefined };
    commit({ ...presentation, slides: updatedSlides });
  };

  // Anotações do apresentador para o slide atual (painel embaixo do canvas,
  // ver notesPanelOpen) — commitDebounced porque roda a cada tecla digitada,
  // igual ao restante dos campos de texto livre desta lista.
  const handleChangeSlideNotes = (text) => {
    if (atClosingSlide) return;
    const updatedSlides = [...presentation.slides];
    updatedSlides[activeIndex] = { ...updatedSlides[activeIndex], notes: text };
    commitDebounced({ ...presentation, slides: updatedSlides });
  };

  // commitDebounced: cobre tanto digitação contínua (URL da imagem, raio) quanto
  // o clique de marcar o ponto certo na miniatura — todos passam por aqui,
  // inclusive depois de um `await` (upload da imagem do hotspot, ver
  // handleUploadHotspotImage), por isso lê das refs "sempre frescas" (ver
  // presentationRef acima) em vez de `presentation`/`activeIndex` direto.
  const handleChangeHotspotConfig = (patch) => {
    const latestPresentation = presentationRef.current;
    const latestIndex = activeIndexRef.current;
    const updatedSlides = [...latestPresentation.slides];
    const prevConfig = updatedSlides[latestIndex].hotspotConfig || { imageUrl: '', x: null, y: null, radius: 10 };
    updatedSlides[latestIndex] = { ...updatedSlides[latestIndex], hotspotConfig: { ...prevConfig, ...patch } };
    commitDebounced({ ...latestPresentation, slides: updatedSlides });
  };

  // Distribuir 100 Pontos: pergunta livre + rótulo de cada uma das 4 opções
  // (A/B/C/D continuam sendo as chaves internas de alocação/pontuação, ver
  // StudentJoin.jsx/ActiveMethodologiesOverlay.jsx — só o TEXTO exibido pro
  // aluno/apresentador é customizável aqui).
  const handleChangePointsConfig = (patch) => {
    const updatedSlides = [...presentation.slides];
    const prevConfig = updatedSlides[activeIndex].pointsConfig || { question: '', labels: { A: '', B: '', C: '', D: '' } };
    const nextConfig = { ...prevConfig, ...patch };
    if (patch.labels) nextConfig.labels = { ...prevConfig.labels, ...patch.labels };
    updatedSlides[activeIndex] = { ...updatedSlides[activeIndex], pointsConfig: nextConfig };
    commitDebounced({ ...presentation, slides: updatedSlides });
  };

  // Trilha de Decisão: cada branch é { optionText, targetSlideId } — ver
  // ActiveMethodologiesOverlay (painel "Tomada de Decisão") e StudentJoin
  // (votação da turma). Independente de `currentSlide.type` (pode coexistir
  // com quiz/wordcloud/etc.), por isso fica num botão/painel à parte.
  const handleChangeBranches = (branches) => {
    const updatedSlides = [...presentation.slides];
    updatedSlides[activeIndex] = { ...updatedSlides[activeIndex], branches };
    commit({ ...presentation, slides: updatedSlides });
  };

  const handleAddBranch = () => {
    const others = presentation.slides.filter((s) => s.id !== currentSlide.id);
    const nextBranches = [...(currentSlide.branches || []), { optionText: '', targetSlideId: others[0]?.id || '' }];
    handleChangeBranches(nextBranches);
  };

  const handleUpdateBranch = (idx, patch) => {
    const nextBranches = (currentSlide.branches || []).map((b, i) => (i === idx ? { ...b, ...patch } : b));
    handleChangeBranches(nextBranches);
  };

  const handleRemoveBranch = (idx) => {
    const nextBranches = (currentSlide.branches || []).filter((_, i) => i !== idx);
    handleChangeBranches(nextBranches);
  };

  // Cria um slide em branco pronto pro professor montar do zero (chat de IA,
  // biblioteca de blocos/mídia) — usado tanto por "Adicionar Novo Slide Vazio"
  // (sempre no fim) quanto pelo botão "+" que aparece ao passar o mouse numa
  // miniatura (logo depois dela, ver SlideList/onInsertSlideAfter abaixo).
  const handleAddSlideAt = (insertIndex) => {
    const newSlide = {
      id: `slide-${Date.now()}`,
      title: 'Novo Slide',
      html: '<div class="slide-root" data-blank-placeholder="true" style="display:flex; align-items:center; justify-content:center; height:100%; padding:2rem; color:#4b5563; font-size:1.05rem; text-align:center;">Slide em branco — use o chat de IA ou a biblioteca de blocos pra começar.</div>'
    };
    const newSlides = [...presentation.slides];
    newSlides.splice(insertIndex, 0, newSlide);
    commit({ ...presentation, slides: newSlides });
    emitSlideChanged(insertIndex);
  };

  // Abre a galeria de templates (ver SlideTemplateGallery/slideTemplateCatalog.js)
  // guardando ONDE o slide escolhido deve entrar — mesma convenção de índice
  // do "+" simples acima (fim da lista ou logo após uma miniatura específica).
  const handleOpenTemplateGallery = (insertIndex) => {
    setTemplateInsertIndex(insertIndex);
    setTemplateGalleryOpen(true);
  };

  const handleSelectTemplate = (html, title) => {
    const newSlide = { id: `slide-${Date.now()}`, title, html };
    const newSlides = [...presentation.slides];
    newSlides.splice(templateInsertIndex, 0, newSlide);
    commit({ ...presentation, slides: newSlides });
    setTemplateGalleryOpen(false);
    emitSlideChanged(templateInsertIndex);
  };

  // Mesma convenção de índice de handleOpenTemplateGallery/handleSelectTemplate
  // acima, só que o slide vem de um prompt de IA (ver AISingleSlideModal) em
  // vez de um template pronto — reaproveita `templateInsertIndex` pra não
  // duplicar o rastreio de "onde entra o próximo slide".
  const handleOpenAISingleSlide = (insertIndex) => {
    setTemplateInsertIndex(insertIndex);
    setAiSingleSlideOpen(true);
  };

  const handleInsertAISlide = (title, html) => {
    const newSlide = { id: `slide-${Date.now()}`, title, html };
    const newSlides = [...presentation.slides];
    newSlides.splice(templateInsertIndex, 0, newSlide);
    commit({ ...presentation, slides: newSlides });
    setAiSingleSlideOpen(false);
    emitSlideChanged(templateInsertIndex);
  };

  // Modal "Novo Slide por Código" (ver CodeSlideModal)
  const handleOpenCodeSlide = (insertIndex) => {
    setTemplateInsertIndex(insertIndex);
    setCodeSlideOpen(true);
  };

  const handleInsertCodeSlide = (title, html) => {
    const newSlide = { id: `slide-${Date.now()}`, title: title || 'Slide por Código', html };
    const newSlides = [...presentation.slides];
    newSlides.splice(templateInsertIndex, 0, newSlide);
    commit({ ...presentation, slides: newSlides });
    setCodeSlideOpen(false);
    emitSlideChanged(templateInsertIndex);
  };

  // Gestão de Cor de Fundo do Slide
  const handleApplySlideBackgroundCurrent = (bgValue) => {
    if (!currentSlide) return;
    const newHtml = setSlideBackground(currentSlide.html, bgValue);
    const newSlides = presentation.slides.map((s, i) => (i === activeIndex ? { ...s, html: newHtml } : s));
    commit({ ...presentation, slides: newSlides });
  };

  const handleApplySlideBackgroundAll = (bgValue) => {
    const newSlides = presentation.slides.map((s) => ({ ...s, html: setSlideBackground(s.html, bgValue) }));
    commit({ ...presentation, slides: newSlides });
  };

  // Gestão de Identificação / Branding do Apresentador (Rodapé)
  const handleApplyBrandingAll = (brandingData) => {
    const newSlides = presentation.slides.map((s) => ({ ...s, html: applyBrandingToSlideHtml(s.html, brandingData) }));
    commit({ ...presentation, slides: newSlides });
  };

  const handleApplyBrandingCurrent = (brandingData) => {
    if (!currentSlide) return;
    const newHtml = applyBrandingToSlideHtml(currentSlide.html, brandingData);
    const newSlides = presentation.slides.map((s, i) => (i === activeIndex ? { ...s, html: newHtml } : s));
    commit({ ...presentation, slides: newSlides });
  };

  const handleRemoveBrandingAll = () => {
    const newSlides = presentation.slides.map((s) => ({ ...s, html: removeBrandingFromSlideHtml(s.html) }));
    commit({ ...presentation, slides: newSlides });
  };

  // "Trocar layout" — abre a galeria de variações (LayoutVariationsModal)
  // escopada ao elemento selecionado; a troca em si (aplicar a variação
  // escolhida) acontece em handleSelectLayoutVariation, chamada pelo modal.
  const handleOpenLayoutVariations = () => {
    if (!selectedEl) return;
    setLayoutVariationsOpen(true);
  };

  // Substitui o elemento selecionado pela variação escolhida — mesmo índice,
  // só troca o HTML (replaceElementAt), igual a como a resposta de um chat
  // de IA escopado a um elemento é aplicada em handleSendChatMessage. Mantém
  // a seleção (não usa mutateCurrentSlideHtml) pra continuar editando o
  // elemento (ex. reaplicar uma animação) sem precisar reclicar nele.
  const handleSelectLayoutVariation = (html) => {
    if (!selectedEl) return;
    updateCurrentSlideHtml((currentHtml) => replaceElementAt(currentHtml, selectedEl.index, html));
  };

  const handleSelectRelatedPresentation = (id, title) => {
    commit({ ...presentation, relatedPresentationId: id, relatedPresentationTitle: title });
    setRelatedPickerOpen(false);
  };

  const handleClearRelatedPresentation = () => {
    commit({ ...presentation, relatedPresentationId: null, relatedPresentationTitle: null });
    setRelatedPickerOpen(false);
  };

  // Mesmo endpoint/fluxo já usado pelo upload de mídia da biblioteca (ver
  // handleFileUpload em MediaLibraryDrawer.jsx): manda pro Cloud Storage e
  // guarda só a URL retornada — o slide (documento inteiro no Firestore, com
  // limite de 1 MiB) nunca embute o arquivo em si, só a referência.
  const handleUploadHotspotImage = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setHotspotUploadError('');
    setHotspotUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiFetch('/api/materials/upload-media', { method: 'POST', body: formData });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Falha ao enviar imagem.');
      handleChangeHotspotConfig({ imageUrl: data.url });
    } catch (err) {
      setHotspotUploadError(err.message || 'Falha ao enviar imagem.');
    } finally {
      setHotspotUploading(false);
    }
  };

  const handleMarkHotspotPoint = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    handleChangeHotspotConfig({ x, y });
  };

  const handleToggleHideSlide = (idxToToggle) => {
    const newSlides = [...presentation.slides];
    if (!newSlides[idxToToggle]) return;
    newSlides[idxToToggle] = { ...newSlides[idxToToggle], hidden: !newSlides[idxToToggle].hidden };
    commit({ ...presentation, slides: newSlides });
  };

  const handleNext = () => {
    if (atClosingSlide) return;
    if (isFullscreen) {
      let nextIdx = -1;
      for (let i = activeIndex + 1; i < presentation.slides.length; i++) {
        if (!presentation.slides[i].hidden) {
          nextIdx = i;
          break;
        }
      }
      if (nextIdx !== -1) {
        emitSlideChanged(nextIdx);
      } else {
        setAtClosingSlide(true);
        if (socket) {
          socket.emit('slide_changed', { pin, newIndex: presentation.slides.length, slideType: null, correctAnswer: null, hotspotConfig: null, pointsConfig: null, branches: null, slideTitle: 'Encerramento', slideNotes: null, totalSlides: presentation.slides.length });
        }
      }
    } else {
      if (activeIndex < presentation.slides.length - 1) {
        emitSlideChanged(activeIndex + 1);
      } else {
        setAtClosingSlide(true);
        if (socket) {
          socket.emit('slide_changed', { pin, newIndex: presentation.slides.length, slideType: null, correctAnswer: null, hotspotConfig: null, pointsConfig: null, branches: null, slideTitle: 'Encerramento', slideNotes: null, totalSlides: presentation.slides.length });
        }
      }
    }
  };

  const handlePrev = () => {
    if (atClosingSlide) {
      setAtClosingSlide(false);
      return;
    }
    if (isFullscreen) {
      let prevIdx = -1;
      for (let i = activeIndex - 1; i >= 0; i--) {
        if (!presentation.slides[i].hidden) {
          prevIdx = i;
          break;
        }
      }
      if (prevIdx !== -1) {
        emitSlideChanged(prevIdx);
      }
    } else {
      if (activeIndex > 0) {
        emitSlideChanged(activeIndex - 1);
      }
    }
  };

  useEffect(() => {
    handleNextRef.current = handleNext;
    handlePrevRef.current = handlePrev;
  });

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
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      // Saindo de tela cheia: o overlay ampliado (position:fixed, cobre a
      // tela toda) não faz sentido em cima do editor — evita deixar a UI de
      // edição obscurecida sem querer.
      if (!document.fullscreenElement) setOverlayExpanded(false);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Inibe a hibernação e o desligamento da tela enquanto estiver em modo Tela Cheia
  useScreenWakeLock(isFullscreen);

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
      if (!data) return;
      // Clique no link "Aula Relacionada" do slide de encerramento (ver
      // closingSlideTemplate.js) — roda SEMPRE (editando ou apresentando de
      // verdade), diferente do resto deste handler, que só existe pro script
      // do modo editável (buildEditorScript). Reseta o palco pro slide 0 da
      // nova apresentação; sem isso, `activeIndex`/`atClosingSlide` ficavam
      // com o valor de antes (este componente não desmonta ao trocar de
      // apresentação, só o objeto `presentation` muda) e a nova apresentação
      // abria direto no PRÓPRIO encerramento em vez do primeiro slide.
      if (data.source === RELATED_LINK_MESSAGE_SOURCE && data.type === 'open-related') {
        if (data.id && onOpenPresentation) {
          setAtClosingSlide(false);
          setActiveIndex(0);
          setClosingQuote(null);
          onOpenPresentation(data.id);
        }
        return;
      }
      if (data.source !== SLIDE_EDITOR_MESSAGE_SOURCE) return;
      if (data.type === 'select') {
        setSelectedEl({ index: data.index, scope: data.scope, rect: data.rect });
        setElementHtmlDraft(null);
      } else if (data.type === 'deselect') {
        setSelectedEl(null);
        setAnimPanelOpen(false);
        setTextStylePanelOpen(false);
        setCropMode(false);
        setElementHtmlDraft(null);
      } else if (data.type === 'reposition') {
        // Arrasto/redimensionamento solto no palco (ver buildEditorScript) —
        // grava a posição livre em % e atualiza o rect da seleção pra barra de
        // ação acompanhar o elemento na nova posição/tamanho, sem perder a
        // seleção (mesmo espírito de `updateCurrentSlideHtml`, usado pelas
        // animações). `heightPct` só vem preenchido quando foi um
        // redimensionamento de verdade (ver sendReposition/resizeState).
        updateCurrentSlideHtml((html) => setPositionAt(html, data.index, {
          leftPct: data.leftPct, topPct: data.topPct, widthPct: data.widthPct, heightPct: data.heightPct
        }));
        setSelectedEl({ index: data.index, scope: data.scope, rect: data.rect });
      } else if (data.type === 'crop') {
        // Alça de recorte solta (ver buildEditorScript/sendCrop) — antes de
        // gravar o recorte em si, persiste a mesma caixa "livre" (posição/
        // tamanho fixados em %) que detach() já tinha aplicado ao vivo no
        // iframe; sem isto o elemento (se ainda não estivesse "livre" antes,
        // ex. imagem recém-inserida) voltava pro fluxo normal no próximo
        // recarregamento e o corte deixava de bater com a caixa real.
        updateCurrentSlideHtml((html) => {
          const positioned = setPositionAt(html, data.index, {
            leftPct: data.posLeftPct, topPct: data.posTopPct, widthPct: data.posWidthPct, heightPct: data.posHeightPct
          });
          return setCropAt(positioned, data.index, {
            topPct: data.topPct, rightPct: data.rightPct, bottomPct: data.bottomPct, leftPct: data.leftPct
          });
        });
      } else if (data.type === 'reset-crop') {
        // Duplo clique num elemento recortado (ver buildEditorScript) — mesma
        // ação do botão "Remover recorte" na barra flutuante, só que disparada
        // direto no palco, sem precisar selecionar e depois clicar no ícone.
        updateCurrentSlideHtml((html) => clearCropAt(html, data.index));
      } else if (data.type === 'zoom-gesture') {
        // Pinça de dois dedos ou Ctrl+roda do mouse (ver buildZoomGestureScript,
        // só ativo em apresentação de verdade) — o script só manda o FATOR de
        // variação; quem decide o valor final e aplica o limite é aqui.
        setZoom((z) => clampZoom(z * data.factor));
      } else if (data.type === 'nav-key') {
        // Setas do teclado com o foco dentro do iframe (ver buildEditorScript
        // em PresentationViewer) — mesma navegação usada pelo teclado da
        // janela pai (PresentationControls). Só chega aqui quando `editable`
        // é true, ou seja, sempre fora de tela cheia (handleNext/handlePrev
        // caem no ramo sem socket/pin, então não há estado obsoleto a
        // considerar pelas deps deste efeito).
        if (data.direction === 'next') handleNext();
        else if (data.direction === 'prev') handlePrev();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentation, activeIndex, isFullscreen]);

  // Índices de seleção só fazem sentido pro slide/estado atual — trocar de
  // slide ou entrar/sair de tela cheia sempre recarrega o iframe do zero.
  // Também reseta o zoom/rolagem — sem isso o próximo slide (ou a volta da
  // tela cheia) "herdaria" o zoom/posição do slide anterior.
  useEffect(() => {
    setSelectedEl(null);
    setChatScope(null);
    setAnimPanelOpen(false);
    setTextStylePanelOpen(false);
    setCropMode(false);
    setElementHtmlDraft(null);
    setTransitionPanelOpen(false);
    setZoom(1);
    setScrollOffset({ top: 0, left: 0 });
    zoomScrollportRef.current?.scrollTo(0, 0);
  }, [activeIndex, isFullscreen, atClosingSlide]);

  // Ao selecionar um elemento novo, pré-preenche os controles de duração/atraso
  // do painel "Animar" com a animação já aplicada a ele (se houver) — sem isso,
  // ajustar os sliders num elemento recém-selecionado partiria de valores
  // deixados por uma seleção anterior, em vez do que já está de fato aplicado.
  useEffect(() => {
    if (!selectedEl) return;
    const entries = getAnimationsAt(currentSlide.html, selectedEl.index);
    // Abre direto na primeira categoria (ordem entrada/ênfase/saída) que já
    // tem um efeito aplicado — evita cair sempre em "Entrada" vazia quando o
    // elemento só tem, por exemplo, uma saída configurada.
    const firstWithEntry = ANIMATION_CATEGORIES.find((cat) => entries.some((e) => e.category === cat.id));
    const cat = firstWithEntry?.id ?? 'entrance';
    setAnimCategory(cat);
    const entry = entries.find((e) => e.category === cat);
    setAnimDuration(entry?.duration ?? ANIMATION_DEFAULTS.duration);
    setAnimDelay(entry?.delay ?? ANIMATION_DEFAULTS.delay);
    setAnimTrigger(entry?.trigger ?? ANIMATION_DEFAULTS.trigger);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEl?.index]);

  // Troca de aba (Entrada/Ênfase/Saída) dentro do painel "Animar" — sincroniza
  // os sliders/gatilho exibidos com o que JÁ está aplicado nessa categoria
  // (ou os valores padrão, se ainda não houver nenhum efeito nela).
  const handleSelectAnimCategory = (cat) => {
    setAnimCategory(cat);
    if (!selectedEl) return;
    const entry = getAnimationsAt(currentSlide.html, selectedEl.index).find((e) => e.category === cat);
    setAnimDuration(entry?.duration ?? ANIMATION_DEFAULTS.duration);
    setAnimDelay(entry?.delay ?? ANIMATION_DEFAULTS.delay);
    setAnimTrigger(entry?.trigger ?? ANIMATION_DEFAULTS.trigger);
  };

  // Desfazer/Refazer: além de trocar `presentation`, limpa seleção/painéis
  // abertos (igual a qualquer outra troca estrutural de HTML, ver o efeito
  // acima) e reajusta `activeIndex` se o slide que estava aberto deixou de
  // existir no estado restaurado — mesmo cuidado já usado ao apagar um slide.
  const handleUndo = () => {
    const restored = undo();
    if (!restored) return;
    setSelectedEl(null);
    setChatScope(null);
    setAnimPanelOpen(false);
    setTextStylePanelOpen(false);
    setElementHtmlDraft(null);
    setTransitionPanelOpen(false);
    setActiveIndex((i) => Math.min(i, restored.slides.length - 1));
  };

  const handleRedo = () => {
    const restored = redo();
    if (!restored) return;
    setSelectedEl(null);
    setChatScope(null);
    setAnimPanelOpen(false);
    setTextStylePanelOpen(false);
    setElementHtmlDraft(null);
    setTransitionPanelOpen(false);
    setActiveIndex((i) => Math.min(i, restored.slides.length - 1));
  };

  // Atalho de teclado Ctrl/Cmd+Z (desfazer) e Ctrl/Cmd+Shift+Z ou Ctrl/Cmd+Y
  // (refazer) — listener dedicado (não em PresentationControls, que só cuida
  // de navegação/tela cheia), com a mesma proteção contra digitação em campo
  // de texto que aquele já usa.
  useEffect(() => {
    const handleUndoKeydown = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleUndoKeydown);
    return () => window.removeEventListener('keydown', handleUndoKeydown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo]);

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

    // Lê o estado mais recente (não a variável `presentation`/`activeIndex`
    // capturada por closure): chamado tanto de forma síncrona (clique na
    // Biblioteca de Mídias) quanto depois de um `await` (colar imagem via
    // Ctrl+V, ver handlePasteImageFile) — no segundo caso, `presentation`
    // pode já estar desatualizada se o usuário mexeu em outros slides
    // enquanto o upload rodava.
    const latestPresentation = presentationRef.current;
    const latestIndex = activeIndexRef.current;
    const updatedSlides = [...latestPresentation.slides];
    updatedSlides[latestIndex] = {
      ...updatedSlides[latestIndex],
      html: appendIntoRoot(updatedSlides[latestIndex].html, mediaTag)
    };
    commit({ ...latestPresentation, slides: updatedSlides });
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
    commit({ ...presentation, slides: updatedSlides });
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
  // `debounced` é usado só pelo slider de duração/atraso de animação
  // (handleAnimSliderChange), que dispara a cada pixel arrastado.
  const updateCurrentSlideHtml = (mutator, { debounced = false } = {}) => {
    const updatedSlides = [...presentation.slides];
    updatedSlides[activeIndex] = { ...updatedSlides[activeIndex], html: mutator(currentSlide.html) };
    const next = { ...presentation, slides: updatedSlides };
    if (debounced) commitDebounced(next); else commit(next);
  };

  const handleAlignElement = (align) => {
    if (!selectedEl) return;
    mutateCurrentSlideHtml((html) => setAlignmentAt(html, selectedEl.index, align));
  };

  const handleMoveElement = (direction) => {
    if (!selectedEl) return;
    mutateCurrentSlideHtml((html) => moveElementAt(html, selectedEl.index, direction));
  };

  // Camadas: pula o elemento direto pro topo/fundo da pilha (ver
  // bringToFrontAt/sendToBackAt em slideHtmlUtils.js) — diferente das setas
  // "mover para cima/baixo" acima, que trocam de posição com o vizinho um
  // passo de cada vez. Mais importante pra elementos com posição livre (ver
  // `positioned` abaixo) que ficam sobrepostos ao arrastar.
  const handleLayerElement = (edge) => {
    if (!selectedEl) return;
    mutateCurrentSlideHtml((html) => (edge === 'front' ? bringToFrontAt : sendToBackAt)(html, selectedEl.index));
  };

  // Copiar/colar entre slides: "copiar" só guarda o outerHTML do elemento
  // selecionado; "colar" insere no slide ATIVO no momento do clique (pode ser
  // outro slide — o usuário seleciona o elemento, copia, troca de slide, cola)
  // via appendIntoRoot, igual a qualquer inserção da Biblioteca de Conteúdo.
  // Não usa mutateCurrentSlideHtml (que exige `selectedEl` e limpa a seleção)
  // porque colar não depende de nenhum elemento estar selecionado no destino.
  const handleCopyElement = () => {
    if (!selectedEl) return;
    const html = getElementAt(currentSlide.html, selectedEl.index);
    if (!html) return;
    setElementClipboard(html);
    // Sobrescreve o clipboard de verdade do SO com uma string vazia: sem
    // isso, uma imagem copiada de fora do app (print, imagem da internet)
    // ANTES continuava "ganhando" na hora de colar (handleWindowPaste
    // prioriza imagem do SO) mesmo depois de copiar um elemento aqui — o
    // usuário quer que valha sempre o último copiado, e é assim que se
    // apaga o formato de imagem que ainda estivesse lá. Falha silenciosa se
    // o navegador negar (fora de foco, sem permissão): não é crítico.
    navigator.clipboard?.writeText?.('').catch(() => {});
  };

  const handlePasteElement = () => {
    if (!elementClipboard) return;
    const pastedHtml = regenerateElementIds(elementClipboard);
    const updatedSlides = [...presentation.slides];
    updatedSlides[activeIndex] = { ...updatedSlides[activeIndex], html: appendIntoRoot(currentSlide.html, pastedHtml) };
    commit({ ...presentation, slides: updatedSlides });
  };

  // Sobe uma imagem (mesma rota que o upload de arquivo da Biblioteca de
  // Mídias já usa) e insere no slide ativo — compartilhado pelo Ctrl+V de
  // imagem do clipboard do SO (ver listener de 'paste' abaixo).
  const handlePasteImageFile = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await apiFetch('/api/materials/upload-media', { method: 'POST', body: formData });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Falha ao colar a imagem.');
      handleInsertMedia({ type: data.type, url: data.url, name: data.name });
    } catch (err) {
      alert('Não foi possível colar a imagem: ' + err.message);
    }
  };

  // Atalho de teclado Ctrl/Cmd+C (copiar elemento selecionado) — mesma
  // proteção contra digitação em campo de texto do atalho de desfazer/refazer
  // acima. NÃO usa uma lista de dependências estreita: `selectedEl` muda a
  // cada seleção, e um closure "velho" faria Ctrl+C copiar o elemento errado
  // (ou nada) até a próxima renderização que recriasse o listener por outro
  // motivo.
  useEffect(() => {
    const handleCopyKeydown = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
      if (!(e.ctrlKey || e.metaKey) || atClosingSlide) return;
      if (e.key.toLowerCase() === 'c' && selectedEl) {
        e.preventDefault();
        handleCopyElement();
      }
    };
    window.addEventListener('keydown', handleCopyKeydown);
    return () => window.removeEventListener('keydown', handleCopyKeydown);
  }, [selectedEl, atClosingSlide, currentSlide]);

  // Ctrl/Cmd+V no palco (fora de campos de texto — o chat tem seu próprio
  // onPaste, ver handleChatInputPaste) usa o evento nativo 'paste' em vez de
  // 'keydown': só ele dá acesso a `e.clipboardData`, necessário pra colar uma
  // imagem copiada de fora do app (print, imagem da internet). Prioriza a
  // imagem do clipboard do sistema operacional quando presente; só cai pro
  // "colar elemento copiado dentro do app" (elementClipboard) se não houver
  // nenhuma imagem — evita colar os dois de uma vez no raro caso de o SO ter
  // uma imagem no clipboard AO MESMO TEMPO que um elemento copiado no app.
  useEffect(() => {
    const handleWindowPaste = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
      if (atClosingSlide) return;
      const items = Array.from(e.clipboardData?.items || []);
      const imageItem = items.find((item) => item.kind === 'file' && item.type.startsWith('image/'));
      if (imageItem) {
        e.preventDefault();
        const file = imageItem.getAsFile();
        if (file) handlePasteImageFile(file);
      } else if (elementClipboard) {
        e.preventDefault();
        handlePasteElement();
      }
    };
    // Mesma lógica acima, mas pro caso em que o foco está DENTRO do iframe do
    // slide (ex.: logo depois de clicar num elemento pra selecioná-lo) — ali
    // o 'paste' nativo dispara no document do IFRAME, não no desta janela, e
    // o listener acima nunca é chamado. buildEditorScript (PresentationViewer)
    // intercepta lá dentro e reencaminha pra cá via postMessage; só falta
    // tratar os 3 formatos que ele manda (mesma prioridade de sempre: bytes
    // reais de imagem > URL de um <img> achado no HTML colado > elemento
    // copiado dentro do app).
    const handleIframePasteMessage = (e) => {
      const data = e.data;
      if (!data || data.source !== SLIDE_EDITOR_MESSAGE_SOURCE || atClosingSlide) return;
      if (data.type === 'paste-image-file') {
        handlePasteImageFile(data.file);
      } else if (data.type === 'paste-image-url') {
        handleInsertMedia({ type: 'image', url: data.url, name: 'Imagem colada' });
      } else if (data.type === 'paste-fallback' && elementClipboard) {
        handlePasteElement();
      }
    };
    window.addEventListener('paste', handleWindowPaste);
    window.addEventListener('message', handleIframePasteMessage);
    return () => {
      window.removeEventListener('paste', handleWindowPaste);
      window.removeEventListener('message', handleIframePasteMessage);
    };
  }, [elementClipboard, atClosingSlide, currentSlide, activeIndex, presentation]);

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

  // Alternativa ao "Editar campos" pra elementos sem metadado de catálogo —
  // abre o HTML bruto do elemento selecionado (título, texto, diagrama etc.
  // gerado direto pela IA) num textarea pra edição manual.
  const handleOpenElementHtmlEdit = () => {
    if (!selectedEl) return;
    setAnimPanelOpen(false);
    setTextStylePanelOpen(false);
    setElementHtmlDraft(getElementAt(currentSlide.html, selectedEl.index) || '');
  };

  const handleSaveElementHtml = () => {
    if (!selectedEl || elementHtmlDraft == null || !elementHtmlDraft.trim()) return;
    const draft = elementHtmlDraft;
    mutateCurrentSlideHtml((html) => replaceElementAt(html, selectedEl.index, draft));
    setElementHtmlDraft(null);
  };

  // Aplica um preset de animação ao elemento selecionado, na categoria (entrada/
  // ênfase/saída) do próprio preset, com a duração/atraso/gatilho configurados
  // no momento — troca só a entrada DAQUELA categoria (ver setAnimationEntryAt),
  // as outras categorias já aplicadas ao elemento continuam intactas. A troca
  // de HTML já recarrega o palco, então um efeito 'auto' toca na hora, servindo
  // de preview automático ('click'/'with-previous'/'after-previous' só tocam
  // de verdade na apresentação em tela cheia, ver buildAnimationTriggerScript).
  const handleApplyAnimation = (preset) => {
    if (!selectedEl) return;
    updateCurrentSlideHtml((html) => setAnimationEntryAt(html, selectedEl.index, preset.category, {
      presetId: preset.id, keyframe: preset.keyframe, loop: preset.loop, duration: animDuration, delay: animDelay, trigger: animTrigger
    }));
  };

  // Mexer nos sliders só reaplica ao vivo se a categoria em exibição já tiver
  // um efeito — caso contrário, os valores só ficam prontos pro próximo
  // preset escolhido.
  const handleAnimSliderChange = (field, value) => {
    if (field === 'duration') setAnimDuration(value); else setAnimDelay(value);
    if (!selectedEl) return;
    const current = getAnimationsAt(currentSlide.html, selectedEl.index).find((e) => e.category === animCategory);
    if (!current) return;
    updateCurrentSlideHtml((html) => setAnimationEntryAt(html, selectedEl.index, animCategory, {
      presetId: current.presetId,
      keyframe: current.keyframe,
      loop: current.loop,
      duration: field === 'duration' ? value : animDuration,
      delay: field === 'delay' ? value : animDelay,
      trigger: current.trigger
    }), { debounced: true });
  };

  // Troca só o GATILHO do efeito já aplicado na categoria em exibição (ver
  // ANIMATION_TRIGGERS) — não mexe em duração/atraso/preset.
  const handleSetAnimTrigger = (trigger) => {
    setAnimTrigger(trigger);
    if (!selectedEl) return;
    const current = getAnimationsAt(currentSlide.html, selectedEl.index).find((e) => e.category === animCategory);
    if (!current) return;
    updateCurrentSlideHtml((html) => setAnimationEntryAt(html, selectedEl.index, animCategory, { ...current, trigger }));
  };

  const handleClearAnimation = () => {
    if (!selectedEl) return;
    updateCurrentSlideHtml((html) => clearAnimationEntryAt(html, selectedEl.index, animCategory));
  };

  // Copiar/colar animação entre elementos (inclusive de outro slide): guarda
  // TODAS as entradas do elemento selecionado (entrada + ênfase + saída, se
  // houver) — "colar" troca o elemento de destino inteiro por essa lista via
  // setAllAnimationsAt, mesmo espírito de handleCopyElement/handlePasteElement
  // mas pro efeito, não pro elemento em si.
  const handleCopyAnimation = () => {
    if (!selectedEl) return;
    const entries = getAnimationsAt(currentSlide.html, selectedEl.index);
    if (!entries.length) return;
    setAnimationClipboard(entries);
  };

  const handlePasteAnimation = () => {
    if (!selectedEl || !animationClipboard) return;
    updateCurrentSlideHtml((html) => setAllAnimationsAt(html, selectedEl.index, animationClipboard));
  };

  // Cor da fonte e família tipográfica do elemento selecionado (painel
  // "Texto") — `updateCurrentSlideHtml` (não `mutateCurrentSlideHtml`) mantém
  // a seleção e o painel aberto, mesmo espírito do preset de animação: dá pra
  // testar várias cores/fontes em sequência sem reclicar no elemento.
  // `debounced` no arrasto do seletor de cor nativo evita um commit de
  // undo/redo por pixel de matiz percorrido.
  const handleSetTextColor = (color) => {
    if (!selectedEl) return;
    updateCurrentSlideHtml((html) => setTextStyleAt(html, selectedEl.index, { color }), { debounced: true });
  };

  const handleSetFontFamily = (fontFamily) => {
    if (!selectedEl) return;
    updateCurrentSlideHtml((html) => setTextStyleAt(html, selectedEl.index, { fontFamily }));
  };

  const handleClearTextStyle = () => {
    if (!selectedEl) return;
    updateCurrentSlideHtml((html) => setTextStyleAt(html, selectedEl.index, { color: '', fontFamily: '' }));
  };

  // Desfaz o arrasto (ver 'reposition' em handleMessage): devolve o elemento
  // pro fluxo normal do slide-root.
  const handleClearPosition = () => {
    if (!selectedEl) return;
    mutateCurrentSlideHtml((html) => clearPositionAt(html, selectedEl.index));
  };

  const handleClearCrop = () => {
    if (!selectedEl) return;
    mutateCurrentSlideHtml((html) => clearCropAt(html, selectedEl.index));
  };

  // Restringe a próxima mensagem da IA a editar só o elemento selecionado —
  // evita o problema de pedir uma mudança pontual e a IA reescrever/derrubar
  // o resto do slide (ela só recebe e só devolve o fragmento deste elemento).
  const handleScopeChatToSelection = () => {
    if (!selectedEl) return;
    setChatScope({ index: selectedEl.index });
    setChatOpen(true);
  };

  // Lê um File direto no navegador e devolve só a parte base64 (sem o prefixo
  // "data:...;base64,") — mesmo formato que a rota /upload-file já devolve
  // pra anexos de imagem (ver handleAttachFile abaixo), mas sem precisar
  // fazer uma viagem ao servidor só pra reencodar um arquivo que já está no
  // navegador (útil pro paste de imagem, que não passa por <input type=file>).
  const readFileAsBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.readAsDataURL(file);
  });

  // Colar (Ctrl+V) uma imagem copiada de fora (print, imagem da internet)
  // direto no campo de instrução do chat — útil pra mostrar exatamente o
  // elemento/trecho do slide que o professor quer alterar, em vez de só
  // descrever em texto. Só intercepta quando o clipboard tem de fato um
  // ARQUIVO de imagem; colar texto normal continua funcionando do jeito
  // padrão do navegador (sem preventDefault nesse caso).
  const handleChatInputPaste = async (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItem = items.find((item) => item.kind === 'file' && item.type.startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    try {
      const data = await readFileAsBase64(file);
      setChatAttachments((prev) => [...prev, { id: Date.now().toString(), kind: 'image', name: 'Imagem colada', mimeType: file.type, data }]);
    } catch {
      alert('Não foi possível colar a imagem.');
    }
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

  // Recalcula a altura do textarea a cada mudança de `chatInput` — cresce com
  // o texto (até CHAT_INPUT_MAX_HEIGHT, depois rola por dentro) e encolhe de
  // volta pra uma linha tanto ao apagar manualmente quanto ao ENVIAR (que
  // limpa `chatInput` via setChatInput('') em handleSendChatMessage, sem
  // passar pelo onChange do campo — por isso o efeito, não só o onChange).
  useEffect(() => {
    const el = chatInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, CHAT_INPUT_MAX_HEIGHT) + 'px';
  }, [chatInput]);

  // Enter sozinho envia (comportamento de sempre); Shift+Enter insere uma
  // quebra de linha — como <textarea> não tem um "onSubmit" nativo pra
  // Enter, precisa deste onKeyDown chamando o mesmo handler do botão de
  // enviar/form (ele já faz e.preventDefault(), funciona igual vindo de um
  // KeyboardEvent).
  const handleChatInputKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      handleSendChatMessage(e);
    }
  };

  const handleSendChatMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userText = chatInput;
    const attachmentsSent = chatAttachments;
    const scopeAtSend = chatScope;
    // Fixa QUAL slide está sendo editado (por id, não por índice numérico) —
    // a resposta da IA só chega depois de vários segundos, tempo em que o
    // usuário pode navegar pra outro slide ou inserir/remover slides antes
    // deste, o que mudaria o índice numérico sem mudar o slide em si.
    const targetSlideId = currentSlide.id;
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
        // Lê o estado mais recente (não `presentation`/`activeIndex`
        // capturados por closure antes do await acima) e localiza o slide
        // alvo pelo id fixado no início — o usuário pode ter navegado,
        // inserido ou reordenado slides enquanto a IA respondia; usar o
        // array desatualizado sobrescreveria (e descartaria) essas mudanças.
        const latestPresentation = presentationRef.current;
        const targetIndex = latestPresentation.slides.findIndex((s) => s.id === targetSlideId);

        if (targetIndex === -1) {
          setChatMessages(prev => [...prev, { sender: 'ai', text: '⚠️ O slide que estava sendo editado não existe mais (foi apagado enquanto a IA respondia).' }]);
        } else {
          const baseHtml = latestPresentation.slides[targetIndex].html;
          // Com escopo: a resposta é só o fragmento do elemento selecionado —
          // substitui apenas ele, preservando o resto do slide intacto.
          const updatedHtml = scopeAtSend
            ? replaceElementAt(baseHtml, scopeAtSend.index, data.newHtml)
            : data.newHtml;
          const updatedSlides = [...latestPresentation.slides];
          updatedSlides[targetIndex] = {
            ...updatedSlides[targetIndex],
            html: updatedHtml
          };
          commit({ ...latestPresentation, slides: updatedSlides });
          const successText = scopeAtSend
            ? `✨ Elemento selecionado atualizado com sucesso!`
            : `✨ Slide #${targetIndex + 1} atualizado com sucesso!`;
          setChatMessages(prev => [
            ...prev,
            { sender: 'ai', text: data.warning ? `${successText}\n⚠️ ${data.warning}` : successText }
          ]);
        }
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
        atClosingSlide={atClosingSlide}
        closingSlide={atClosingSlide ? currentSlide : null}
        onNext={handleNext}
        onPrev={handlePrev}
        onClose={() => setShowPresenterWindow(false)}
        speakerNotes={currentSlide.notes}
      />
    );
  }

  // Traço fino entre grupos da toolbar do editor — mesma linguagem visual do
  // separador já usado em PublicViewerControls.jsx, só reaproveitado aqui.
  const ToolbarDivider = () => (
    <div style={{ width: '1px', height: '22px', background: 'rgba(255,255,255,0.12)', flexShrink: 0, margin: '0 0.1rem' }} />
  );

  return (
    <div className={`main-layout ${isFullscreen ? 'full-presentation' : ''}`}>
      {/* Gaveta móvel da lista de slides usa uma sobreposição pra fechar ao tocar
          fora — o chat flutuante não (fecha só pelo próprio X, como os
          painéis de transição/animação). */}
      {!isFullscreen && mobileSlideListOpen && (
        <div
          className="mobile-drawer-backdrop below-header"
          onClick={() => setMobileSlideListOpen(false)}
        />
      )}

      {/* Sidebar Esquerda (Miniaturas de Slides) — fica sempre montada
          (mesmo em tela cheia, só escondida via CSS) em vez de
          desmontar/remontar com `isFullscreen`: cada miniatura carrega o
          próprio slide num iframe (ver LazySlidePreview em SlideList.jsx,
          que só monta a prévia real quando ela entra na viewport uma vez e
          nunca desmonta depois). Desmontar o componente inteiro toda vez que
          entra/sai da apresentação (F, botão de tela cheia) reiniciava esse
          estado do zero, e voltar pra este painel recarregava TODAS as
          miniaturas já visíveis de novo, uma a uma — exatamente o
          "carregando e recarregando" relatado. */}
      <SlideList
        style={isFullscreen ? { display: 'none' } : undefined}
        className={mobileSlideListOpen ? 'mobile-open' : ''}
        slides={presentation.slides}
        activeIndex={activeIndex}
        onSelectSlide={(idx) => {
          emitSlideChanged(idx);
          setMobileSlideListOpen(false);
        }}
        onClose={() => setMobileSlideListOpen(false)}
        onAddSlide={() => handleAddSlideAt(presentation.slides.length)}
        onAddTemplate={() => handleOpenTemplateGallery(activeIndex + 1)}
        onAddSlideWithAI={() => handleOpenAISingleSlide(activeIndex + 1)}
        onAddSlideWithCode={() => handleOpenCodeSlide(activeIndex + 1)}
        onOpenPromptGenerator={() => setPromptGeneratorOpen(true)}
        onInsertSlideAfter={(idx) => handleAddSlideAt(idx + 1)}
        onToggleHideSlide={handleToggleHideSlide}
        onDeleteSlide={(idxToDelete) => {
          if (presentation.slides.length <= 1) return;
          const newSlides = presentation.slides.filter((_, i) => i !== idxToDelete);
          commit({ ...presentation, slides: newSlides });
          // Sem isto, apagar o slide ativo (ou qualquer um antes dele) deixava
          // activeIndex apontando para fora do novo array — o palco caía no
          // placeholder "Nenhum slide gerado" e parecia que nada tinha acontecido.
          setActiveIndex((prev) => {
            const shifted = idxToDelete < prev ? prev - 1 : prev;
            return Math.min(shifted, newSlides.length - 1);
          });
        }}
        onDuplicateSlide={(idxToDuplicate) => {
          // Clona o slide inteiro (mesmo html/branches/type/etc.) só com um
          // id novo — insere logo depois do original e já seleciona a cópia,
          // pra editar o conteúdo dela sem afetar a original.
          const original = presentation.slides[idxToDuplicate];
          const duplicate = { ...original, id: `slide-${Date.now()}` };
          const newSlides = [...presentation.slides];
          newSlides.splice(idxToDuplicate + 1, 0, duplicate);
          commit({ ...presentation, slides: newSlides });
          setActiveIndex(idxToDuplicate + 1);
        }}
        onReorderSlides={(fromIndex, toIndex) => {
          const newSlides = [...presentation.slides];
          const [moved] = newSlides.splice(fromIndex, 1);
          newSlides.splice(toIndex, 0, moved);
          commit({ ...presentation, slides: newSlides });
          // Reordenar não deve trocar QUAL slide está selecionado — só
          // recalcula onde esse mesmo slide foi parar no array novo.
          setActiveIndex((prevActive) => {
            if (prevActive === fromIndex) return toIndex;
            if (fromIndex < prevActive && toIndex >= prevActive) return prevActive - 1;
            if (fromIndex > prevActive && toIndex <= prevActive) return prevActive + 1;
            return prevActive;
          });
        }}
      />

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
              {isEditingTitle ? (
                <form
                  onSubmit={(e) => { e.preventDefault(); handleSaveTitle(); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <input
                    type="text"
                    autoFocus
                    className="chat-input"
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={handleSaveTitle}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTitle();
                      if (e.key === 'Escape') setIsEditingTitle(false);
                    }}
                    style={{ fontSize: '0.95rem', fontWeight: 700, padding: '0.2rem 0.5rem', width: '240px' }}
                  />
                </form>
              ) : (
                <h1
                  onClick={() => { setIsEditingTitle(true); setTitleDraft(presentation.title || ''); }}
                  title="Clique para renomear a apresentação"
                  style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f3f4f6', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <span>{presentation.title}</span>
                  <Pencil size={13} style={{ opacity: 0.6 }} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 400, color: '#9ca3af' }}>({atClosingSlide ? 'Encerramento' : `${activeIndex + 1}/${presentation.slides.length}`})</span>
                </h1>
              )}
            </div>

            <div style={{ display: 'flex', flexWrap: 'nowrap', columnGap: '0.6rem', alignItems: 'center', overflowX: 'auto', minWidth: 0, flex: '1 1 auto', paddingBottom: '2px' }}>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexShrink: 0 }}>
              {!atClosingSlide && (() => {
                const currentTransition = resolveTransition(currentSlide.transition);
                const currentPreset = TRANSITION_PRESETS.find((p) => p.id === currentTransition.type) || TRANSITION_PRESETS[0];
                return (
                  <div style={{ position: 'relative' }}>
                    <button
                      className={`btn-primary ${transitionPanelOpen ? 'active' : ''}`}
                      onClick={() => setTransitionPanelOpen((v) => !v)}
                      title="Transição de entrada deste slide"
                      style={{ background: 'rgba(255,255,255,0.08)', fontSize: '0.78rem', padding: '0.4rem 0.6rem' }}
                    >
                      <ArrowLeftRight size={15} /> <span className="btn-label">{currentPreset.label}</span>
                    </button>

                    {transitionPanelOpen && (
                      <div
                        className="glass-panel"
                        style={{
                          position: 'absolute',
                          top: 'calc(100% + 6px)',
                          left: 0,
                          zIndex: 41,
                          width: '250px',
                          padding: '0.7rem',
                          background: 'rgba(15, 23, 42, 0.97)'
                        }}
                      >
                        <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginBottom: '0.5rem' }}>
                          Como este slide entra em cena
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem', marginBottom: '0.65rem' }}>
                          {TRANSITION_PRESETS.map((preset) => {
                            const active = currentTransition.type === preset.id;
                            return (
                              <button
                                key={preset.id}
                                onClick={() => handleChangeSlideTransition({ type: preset.id })}
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
                          <span>Duração</span><span>{currentTransition.duration.toFixed(1)}s</span>
                        </label>
                        <input
                          type="range"
                          min={TRANSITION_DURATION_RANGE.min}
                          max={TRANSITION_DURATION_RANGE.max}
                          step={TRANSITION_DURATION_RANGE.step}
                          value={currentTransition.duration}
                          disabled={currentTransition.type === 'none'}
                          onChange={(e) => handleChangeSlideTransition({ duration: Number(e.target.value) })}
                          style={{ width: '100%', accentColor: 'var(--accent-primary)' }}
                        />
                      </div>
                    )}
                  </div>
                );
              })()}
              <select
                className="chat-input"
                value={currentSlide.type || ''}
                onChange={(e) => handleChangeSlideType(e.target.value)}
                title="Modo de Interatividade deste Slide (ativa o painel de resultados ao vivo para o apresentador)"
                disabled={atClosingSlide}
                style={{ fontSize: '0.72rem', padding: '0.35rem 0.45rem', width: 'auto' }}
              >
                <option value="">Sem interatividade</option>
                <option value="quiz">Quiz ao Vivo</option>
                <option value="wordcloud">Nuvem de Palavras</option>
                <option value="tbl">TBL — Verificação Individual (iRAT)</option>
                <option value="hotspot">Hotspot em Imagem</option>
                <option value="points">Distribuir 100 Pontos</option>
              </select>
            </div>

            <ToolbarDivider />

            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexShrink: 0 }}>
              <button className="btn-icon" onClick={handleUndo} disabled={!canUndo} title="Desfazer (Ctrl+Z)">
                <Undo2 size={18} />
              </button>
              <button className="btn-icon" onClick={handleRedo} disabled={!canRedo} title="Refazer (Ctrl+Shift+Z)">
                <Redo2 size={18} />
              </button>
            </div>

            <ToolbarDivider />

            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexShrink: 0 }}>
              <button className="btn-icon" onClick={() => setIsMediaDrawerOpen(!isMediaDrawerOpen)} title="Biblioteca de Mídias (Drag & Drop)">
                <Image size={18} />
              </button>
              <button className="btn-icon" onClick={() => setIsWidgetDrawerOpen(!isWidgetDrawerOpen)} title="Inserir Blocos, Layouts e Widgets Interativos">
                <Puzzle size={18} />
              </button>
              <button className="btn-icon" onClick={() => setSlideBgModalOpen(true)} title="Alterar Cor de Fundo do Slide Ativo (Cor ou Gradiente)">
                <Palette size={18} />
              </button>
              <button className="btn-icon" onClick={() => setSlideBrandingModalOpen(true)} title="Informações Identificadoras (Aplicar Rodapé/Autor em todos os slides)">
                <UserCheck size={18} />
              </button>
              <button
                className={`btn-icon ${isCurrentSlideScrollable ? 'active' : ''}`}
                onClick={handleToggleSlideScrollable}
                disabled={atClosingSlide}
                title={isCurrentSlideScrollable ? "Desativar barra de rolagem no slide" : "Ativar barra de rolagem no slide (Permite rolar o conteúdo caso ultrapasse a tela)"}
                style={isCurrentSlideScrollable ? { background: 'rgba(56, 189, 248, 0.18)', color: '#38bdf8' } : undefined}
              >
                <ScrollText size={18} />
              </button>
              <button
                className={`btn-icon ${isCurrentSlideNativeScaled ? 'active' : ''}`}
                onClick={handleToggleNativeScale}
                disabled={atClosingSlide}
                title={isCurrentSlideNativeScaled ? "Desfazer ajuste de tamanho (voltar ao original)" : "Ajustar conteúdo pro tamanho atual do slide (corrige texto/elementos pequenos após aumento do canvas)"}
                style={isCurrentSlideNativeScaled ? { background: 'rgba(167, 139, 250, 0.18)', color: '#a78bfa' } : undefined}
              >
                <Maximize2 size={18} />
              </button>
              <button
                className={`btn-icon ${showBranchPanel ? 'active' : ''}`}
                onClick={() => setShowBranchPanel(!showBranchPanel)}
                title="Configurar Trilha de Decisão (votação da turma ao vivo)"
                disabled={atClosingSlide}
                style={currentSlide.branches?.length > 0 ? { background: 'rgba(56, 189, 248, 0.18)', color: '#38bdf8' } : undefined}
              >
                <GitBranch size={18} />
              </button>
              <button className="btn-icon" onClick={() => setShowCodeEditor(!showCodeEditor)} title="Ver / Editar HTML do Slide">
                <Code size={18} />
              </button>
              <button
                className="btn-icon"
                onClick={handlePasteElement}
                disabled={!elementClipboard || atClosingSlide}
                title={elementClipboard ? 'Colar elemento copiado neste slide' : 'Copie um elemento primeiro (botão "Copiar" na barra do elemento selecionado)'}
              >
                <ClipboardPaste size={18} />
              </button>
            </div>

            <ToolbarDivider />

            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexShrink: 0 }}>
              <button
                className={`btn-icon ${presentation.relatedPresentationId ? 'active' : ''}`}
                onClick={() => setRelatedPickerOpen(true)}
                title={presentation.relatedPresentationId ? `Aula relacionada: ${presentation.relatedPresentationTitle}` : 'Vincular aula relacionada (aparece no encerramento)'}
              >
                <Milestone size={18} />
              </button>
              <button
                className="btn-icon"
                onClick={() => setIsShareOpen(true)}
                disabled={!presentation.id}
                title={presentation.id ? 'Gerar link público só-visualização' : 'Salve a apresentação antes de compartilhar'}
              >
                <Share2 size={18} />
              </button>
              <button className="btn-icon" onClick={() => setIsReportOpen(true)} title="Relatórios da sessão">
                <BarChart3 size={18} />
              </button>
              <button className="btn-icon" onClick={() => setRemoteControlOpen(true)} title="Controle remoto pelo celular (avançar/voltar slide à distância)">
                <Smartphone size={18} />
              </button>
              <button className="btn-icon" onClick={() => setExportModalOpen(true)} disabled={!presentation.slides?.length} title="Baixar apresentação em PDF ou PPTX">
                <Download size={18} />
              </button>
              {!atClosingSlide && (
                <button
                  className={`btn-icon ${notesPanelOpen ? 'active' : ''}`}
                  onClick={() => setNotesPanelOpen((v) => !v)}
                  title={notesPanelOpen ? 'Ocultar anotações do apresentador' : 'Mostrar anotações do apresentador (visíveis só pra você)'}
                  style={currentSlide.notes ? { color: '#38bdf8' } : undefined}
                >
                  <StickyNote size={18} />
                </button>
              )}
              <button
                className={`btn-icon ${chatOpen ? 'active' : ''}`}
                onClick={() => setChatOpen((v) => !v)}
                title="Editar Slide com IA"
              >
                <Bot size={18} />
              </button>
            </div>
            </div>

            {/* Fora do grupo acima (que tem seu próprio flex-wrap e pode quebrar
                em telas mais estreitas) — como item de nível externo com
                margin-left:auto, "Exibição"/"Apresentar" ficam sempre grudados
                na borda direita da MESMA linha, mesmo se o resto do menu tiver
                quebrado por falta de espaço (antes, por estarem dentro daquele
                grupo, quebravam junto e caíam soltos à esquerda numa segunda
                linha — ver captura de tela do usuário). */}
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginLeft: 'auto', flexShrink: 0 }}>
              <button className="btn-primary" onClick={() => setShowPresenterWindow(true)} title="Visão Apresentador (janela separada com notas e controles)" style={{ background: 'rgba(255,255,255,0.08)', fontSize: '0.82rem' }}>
                <Tv size={16} /> <span className="btn-label">Exibição</span>
              </button>
              <button className="btn-primary" onClick={toggleFullscreen} style={{ fontSize: '0.82rem' }}>
                <Play size={16} /> <span className="btn-label">Apresentar (F)</span>
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
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input
                  type="text"
                  className="chat-input"
                  placeholder="URL da imagem"
                  value={currentSlide.hotspotConfig?.imageUrl || ''}
                  onChange={(e) => handleChangeHotspotConfig({ imageUrl: e.target.value })}
                  style={{ flex: 1, fontSize: '0.8rem', boxSizing: 'border-box' }}
                />
                <label
                  className="btn-secondary"
                  style={{ flexShrink: 0, padding: '0 0.7rem', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 600, opacity: hotspotUploading ? 0.7 : 1, pointerEvents: hotspotUploading ? 'none' : 'auto' }}
                  title="Fazer upload de uma imagem do seu computador"
                >
                  {hotspotUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {hotspotUploading ? 'Enviando...' : 'Upload'}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUploadHotspotImage} disabled={hotspotUploading} />
                </label>
              </div>
              {hotspotUploadError && (
                <p style={{ fontSize: '0.72rem', color: '#f87171', marginTop: '-0.2rem', marginBottom: '0.5rem' }}>{hotspotUploadError}</p>
              )}
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

        {!isFullscreen && currentSlide.type === 'points' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem', width: '100%', maxWidth: '1100px', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '0.5rem' }}>
            <input
              type="text"
              className="chat-input"
              placeholder="Pergunta (ex: Como você distribuiria o orçamento entre estas condutas?)"
              value={currentSlide.pointsConfig?.question || ''}
              onChange={(e) => handleChangePointsConfig({ question: e.target.value })}
              style={{ width: '100%', fontSize: '0.8rem', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem' }}>
              {['A', 'B', 'C', 'D'].map((key) => (
                <input
                  key={key}
                  type="text"
                  className="chat-input"
                  placeholder={`Alternativa ${key}`}
                  value={currentSlide.pointsConfig?.labels?.[key] || ''}
                  onChange={(e) => handleChangePointsConfig({ labels: { [key]: e.target.value } })}
                  style={{ width: '100%', fontSize: '0.8rem', boxSizing: 'border-box' }}
                />
              ))}
            </div>
            <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: 0 }}>
              Deixe em branco pra usar "Opção A/B/C/D" (padrão).
            </p>
          </div>
        )}

        {!isFullscreen && showBranchPanel && !atClosingSlide && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem', width: '100%', maxWidth: '1100px', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '0.5rem', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
            <div style={{ fontSize: '0.78rem', color: '#9ca3af' }}>
              Cada opção leva a turma pra um slide diferente. Ao apresentar, os alunos votam pelo celular em qual conduta seguir antes de você revelar o caminho e avançar.
            </div>

            {(currentSlide.branches || []).map((branch, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="text"
                  className="chat-input"
                  placeholder={`Texto da opção ${idx + 1} (ex.: Iniciar Antimicrobiano de Largo Espectro)`}
                  value={branch.optionText}
                  onChange={(e) => handleUpdateBranch(idx, { optionText: e.target.value })}
                  style={{ flex: 1, fontSize: '0.8rem' }}
                />
                <select
                  className="chat-input"
                  value={branch.targetSlideId}
                  onChange={(e) => handleUpdateBranch(idx, { targetSlideId: e.target.value })}
                  style={{ fontSize: '0.8rem', width: 'auto', maxWidth: '220px' }}
                >
                  <option value="">Ir para...</option>
                  {presentation.slides.map((s, sIdx) => (
                    s.id === currentSlide.id ? null : (
                      <option key={s.id} value={s.id}>#{sIdx + 1} — {s.title || `Slide ${sIdx + 1}`}</option>
                    )
                  ))}
                </select>
                <button className="btn-icon" onClick={() => handleRemoveBranch(idx)} title="Remover trilha" style={{ width: '28px', height: '28px' }}>
                  <X size={14} />
                </button>
              </div>
            ))}

            {(currentSlide.branches || []).length < 4 && (
              <button className="btn-primary" onClick={handleAddBranch} style={{ alignSelf: 'flex-start', background: 'rgba(255,255,255,0.08)', fontSize: '0.78rem', padding: '0.45rem 0.8rem' }}>
                <Plus size={14} /> Adicionar trilha
              </button>
            )}
          </div>
        )}

        {/* Palco do Slide com Overlay de Metodologias Ativas */}
        <div ref={stageRef} className={`presentation-stage ${isFullscreen ? 'fullscreen-stage' : ''}`}>
          {/* Viewport de rolagem nativa pro zoom manual — só este elemento
              rola (mouse/trackpad/toque/barra de rolagem, tudo de graça do
              navegador); a barra de ação/overlay/barra flutuante abaixo ficam
              FORA daqui, então continuam fixas na tela mesmo com a visão
              rolada. overflow só vira "auto" quando o zoom não é 100% (com
              tolerância de arredondamento), pra nunca aparecer uma barra de
              rolagem de 1px por erro de ponto flutuante em zoom normal. */}
          <div
            ref={zoomScrollportRef}
            className="zoom-scrollport"
            onScroll={(e) => setScrollOffset({ top: e.currentTarget.scrollTop, left: e.currentTarget.scrollLeft })}
            style={{
              position: 'absolute',
              inset: 0,
              overflow: Math.abs(zoom - 1) < 0.01 ? 'hidden' : 'auto',
              scrollbarGutter: 'stable both-edges'
            }}
          >
            <div
              className="zoom-sizer"
              style={{
                position: 'relative',
                width: `${SLIDE_NATIVE_WIDTH * effectiveScale}px`,
                height: `${SLIDE_NATIVE_HEIGHT * effectiveScale}px`
              }}
            >
              <div
                className="canvas-native-layer"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: `${SLIDE_NATIVE_WIDTH}px`,
                  height: `${SLIDE_NATIVE_HEIGHT}px`,
                  transform: `scale(${effectiveScale})`,
                  transformOrigin: 'top left'
                }}
              >
                <div
                  key={`${atClosingSlide ? 'closing' : activeIndex}-${!!closingQuote}`}
                  className={`slide-transition-wrapper pos-transition-${atClosingSlide ? TRANSITION_DEFAULTS.type : resolveTransition(currentSlide.transition).type}`}
                  style={{ '--pos-transition-duration': `${atClosingSlide ? TRANSITION_DEFAULTS.duration : resolveTransition(currentSlide.transition).duration}s` }}
                >
                  <PresentationViewer
                    ref={stageIframeRef}
                    htmlContent={currentSlide.html}
                    editable={!isFullscreen && !atClosingSlide}
                    spotlightEnabled={isFullscreen && spotlightOn}
                    zoomGestureEnabled={isFullscreen}
                    animationTriggersEnabled={isFullscreen && !atClosingSlide}
                    selectedElement={selectedEl}
                    cropMode={cropMode}
                  />
                </div>

                {/* Cursor virtual do trackpad do controle remoto (celular) —
                    posicionado em % do canvas nativo, então fica dentro da
                    MESMA camada com o transform:scale acima e acompanha o
                    zoom/apresentação automaticamente, sem conta própria.
                    pointerEvents:none pra nunca atrapalhar cliques reais do
                    mouse/caneta/laser na tela. Só existe durante apresentação
                    de verdade (isFullscreen) — em edição não faz sentido. */}
                {isFullscreen && remoteCursor && (
                  <div
                    style={{
                      position: 'absolute',
                      left: `${remoteCursor.xPct}%`,
                      top: `${remoteCursor.yPct}%`,
                      transform: 'translate(-4px, -4px)',
                      pointerEvents: 'none',
                      zIndex: 2147483647
                    }}
                  >
                    <MousePointer2 size={38} color="#22d3ee" fill="#0e7490" strokeWidth={1.5} style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.7))' }} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Barra de ação do elemento selecionado (clique num elemento de topo do slide) */}
          {!isFullscreen && selectedEl && (() => {
            const elementMeta = getElementMeta(currentSlide.html, selectedEl.index);
            const grouped = isGroupedAt(currentSlide.html, selectedEl.index);
            const animEntries = getAnimationsAt(currentSlide.html, selectedEl.index);
            const currentAnim = animEntries.find((e) => e.category === animCategory);
            const positioned = isPositionedAt(currentSlide.html, selectedEl.index);
            const cropped = isCroppedAt(currentSlide.html, selectedEl.index);
            const hasTable = hasTableAt(currentSlide.html, selectedEl.index);
            const textStyle = getTextStyleAt(currentSlide.html, selectedEl.index);
            const btnStyle = { width: '30px', height: '30px' };
            const divider = <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.15)', margin: '0 0.15rem' }} />;
            // Fixa no topo/centro do CANVAS (não mais junto do elemento) —
            // antes a barra acompanhava `selectedEl.rect`, e um elemento perto
            // de qualquer borda (principalmente a direita, já que a barra é
            // larga) empurrava boa parte dos botões pra fora da área visível,
            // sem como clicar neles. `toolbarCenterX` + `translateX(-50%)` no
            // estilo (abaixo) centraliza sem precisar medir a largura real da
            // barra (varia conforme quais botões aparecem pra cada elemento).
            // Esta barra fica fora da camada escalada (canvas-native-layer) E
            // fora do .zoom-scrollport (que pode estar rolado, se o usuário
            // deu zoom) — por isso a conversão por `effectiveScale` (canvasScale
            // * zoom) E a subtração da rolagem atual, pra continuar alinhada
            // com o TOPO DO SLIDE (não mais com o elemento) mesmo rolado.
            const toolbarTop = Math.max(4, 12 - scrollOffset.top);
            const toolbarCenterX = (SLIDE_NATIVE_WIDTH * effectiveScale) / 2 - scrollOffset.left;

            return (
              <>
                <div
                  className="glass-panel"
                  style={{
                    position: 'absolute',
                    top: `${toolbarTop}px`,
                    left: `${toolbarCenterX}px`,
                    transform: 'translateX(-50%)',
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
                  <button
                    className={`btn-icon ${textStylePanelOpen ? 'active' : ''}`}
                    style={btnStyle}
                    title="Cor e fonte do texto"
                    onClick={() => { setAnimPanelOpen(false); setElementHtmlDraft(null); setTextStylePanelOpen((v) => !v); }}
                  >
                    <Baseline size={15} />
                  </button>
                  {divider}
                  <button className="btn-icon" style={btnStyle} title="Mover para cima" onClick={() => handleMoveElement('up')}><ArrowUp size={15} /></button>
                  <button className="btn-icon" style={btnStyle} title="Mover para baixo" onClick={() => handleMoveElement('down')}><ArrowDown size={15} /></button>
                  {divider}
                  <button className="btn-icon" style={btnStyle} title="Trazer para frente (camadas)" onClick={() => handleLayerElement('front')}><BringToFront size={15} /></button>
                  <button className="btn-icon" style={btnStyle} title="Enviar para trás (camadas)" onClick={() => handleLayerElement('back')}><SendToBack size={15} /></button>
                  {divider}
                  <button className="btn-icon" style={btnStyle} title="Copiar elemento (colar em outro slide com o botão da barra principal)" onClick={handleCopyElement}><Copy size={15} /></button>
                  {divider}
                  <button
                    className="btn-icon"
                    style={btnStyle}
                    title={animEntries.length ? 'Copiar animação deste elemento (colar em outro com o botão ao lado)' : 'Este elemento não tem animação pra copiar'}
                    onClick={handleCopyAnimation}
                    disabled={!animEntries.length}
                  >
                    <ClipboardCopy size={15} />
                  </button>
                  <button
                    className="btn-icon"
                    style={btnStyle}
                    title={animationClipboard ? 'Colar animação copiada neste elemento' : 'Copie a animação de um elemento primeiro (botão ao lado)'}
                    onClick={handlePasteAnimation}
                    disabled={!animationClipboard}
                  >
                    <ClipboardPaste size={15} />
                  </button>
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
                    className={`btn-icon ${cropMode ? 'active' : ''}`}
                    style={btnStyle}
                    title="Recortar (aparar bordas)"
                    onClick={() => setCropMode((v) => !v)}
                  >
                    <Crop size={15} />
                  </button>
                  {cropped && (
                    <button className="btn-icon" style={btnStyle} title="Remover recorte" onClick={handleClearCrop}><X size={15} /></button>
                  )}
                  {divider}
                  <button
                    className={`btn-icon ${animPanelOpen ? 'active' : ''}`}
                    style={btnStyle}
                    title="Animar elemento"
                    onClick={() => { setTextStylePanelOpen(false); setElementHtmlDraft(null); setAnimPanelOpen((v) => !v); }}
                  >
                    <Wand2 size={15} />
                  </button>
                  {divider}
                  <button
                    className="btn-icon"
                    style={btnStyle}
                    title="Trocar layout (IA reorganiza a estrutura, mantendo texto/cores/animação)"
                    onClick={handleOpenLayoutVariations}
                  >
                    <Shuffle size={15} />
                  </button>
                  {hasTable && (
                    <>
                      {divider}
                      <button
                        className="btn-icon"
                        style={btnStyle}
                        title="Editar tabela (grade em vez de HTML)"
                        onClick={() => setTableEditOpen(true)}
                      >
                        <Table2 size={15} />
                      </button>
                    </>
                  )}
                  {elementMeta ? (
                    <>
                      {divider}
                      <button className="btn-icon" style={btnStyle} title="Editar campos" onClick={handleEditElementFields}><Pencil size={15} /></button>
                    </>
                  ) : (
                    // Título, texto solto ou diagrama/gráfico escrito direto pela IA na
                    // geração do slide — não veio da gaveta "Inserir Conteúdo", então não
                    // tem um formulário de campos pra reabrir. Fallback: editar o HTML
                    // bruto do elemento diretamente.
                    <>
                      {divider}
                      <button className={`btn-icon ${elementHtmlDraft != null ? 'active' : ''}`} style={btnStyle} title="Editar HTML" onClick={handleOpenElementHtmlEdit}><Code size={15} /></button>
                    </>
                  )}
                  {positioned && (
                    <>
                      {divider}
                      <button className="btn-icon" style={btnStyle} title="Devolver ao fluxo normal (desfazer posição livre)" onClick={handleClearPosition}><PinOff size={15} /></button>
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
                      left: `${toolbarCenterX}px`,
                      transform: 'translateX(-50%)',
                      zIndex: 41,
                      width: '230px',
                      padding: '0.7rem',
                      background: 'rgba(15, 23, 42, 0.97)'
                    }}
                  >
                    <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.5rem' }}>
                      {ANIMATION_CATEGORIES.map((cat) => {
                        const hasEntry = animEntries.some((e) => e.category === cat.id);
                        return (
                          <button
                            key={cat.id}
                            onClick={() => handleSelectAnimCategory(cat.id)}
                            style={{
                              flex: 1,
                              position: 'relative',
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              padding: '0.3rem 0.2rem',
                              borderRadius: '0.35rem',
                              cursor: 'pointer',
                              border: animCategory === cat.id ? '1px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.1)',
                              background: animCategory === cat.id ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.04)',
                              color: animCategory === cat.id ? '#67e8f9' : '#9ca3af'
                            }}
                          >
                            {cat.label}
                            {/* Bolinha indicando que essa categoria já tem um efeito aplicado
                                (elemento pode ter entrada + ênfase + saída ao mesmo tempo) —
                                sem isto, trocar de aba escondia efeitos já configurados sem
                                nenhum sinal de que ainda estavam lá. */}
                            {hasEntry && (
                              <span style={{ position: 'absolute', top: '2px', right: '2px', width: '5px', height: '5px', borderRadius: '50%', background: '#34d399' }} />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem', marginBottom: '0.65rem' }}>
                      {ANIMATION_PRESETS.filter((preset) => preset.category === animCategory).map((preset) => {
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
                      <span>{animCategory === 'exit' ? 'Some depois de' : 'Atraso'}</span><span>{animDelay.toFixed(1)}s</span>
                    </label>
                    <input
                      type="range" min="0" max={animCategory === 'exit' ? 5 : 1.5} step="0.1" value={animDelay}
                      onChange={(e) => handleAnimSliderChange('delay', Number(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--accent-primary)' }}
                    />

                    {currentAnim && (
                      <>
                        <label style={{ display: 'block', fontSize: '0.68rem', color: '#9ca3af', margin: '0.6rem 0 0.25rem' }}>Disparo</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem' }}>
                          {ANIMATION_TRIGGERS.map((trig) => (
                            <button
                              key={trig.id}
                              onClick={() => handleSetAnimTrigger(trig.id)}
                              style={{
                                fontSize: '0.66rem',
                                fontWeight: 700,
                                padding: '0.3rem 0.2rem',
                                borderRadius: '0.35rem',
                                cursor: 'pointer',
                                border: animTrigger === trig.id ? '1px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.1)',
                                background: animTrigger === trig.id ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.04)',
                                color: animTrigger === trig.id ? '#67e8f9' : '#9ca3af'
                              }}
                            >
                              {trig.label}
                            </button>
                          ))}
                        </div>
                        {animTrigger !== 'auto' && (
                          <p style={{ fontSize: '0.65rem', color: '#6b7280', margin: '0.4rem 0 0' }}>
                            Só dispara na apresentação em tela cheia — aqui no editor o elemento fica no estado final, sem tocar o efeito.
                          </p>
                        )}
                      </>
                    )}

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

                {textStylePanelOpen && (
                  <div
                    className="glass-panel"
                    style={{
                      position: 'absolute',
                      top: `${toolbarTop + 40}px`,
                      left: `${toolbarCenterX}px`,
                      transform: 'translateX(-50%)',
                      zIndex: 41,
                      width: '230px',
                      padding: '0.7rem',
                      background: 'rgba(15, 23, 42, 0.97)'
                    }}
                  >
                    <label style={{ display: 'block', fontSize: '0.68rem', color: '#9ca3af', marginBottom: '0.35rem' }}>Cor do texto</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem', marginBottom: '0.65rem' }}>
                      {TEXT_COLOR_SWATCHES.map((swatch) => (
                        <button
                          key={swatch}
                          title={swatch}
                          onClick={() => handleSetTextColor(swatch)}
                          style={{
                            width: '22px',
                            height: '22px',
                            borderRadius: '50%',
                            background: swatch,
                            cursor: 'pointer',
                            padding: 0,
                            border: colorToHex(textStyle.color) === swatch ? '2px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.25)'
                          }}
                        />
                      ))}
                      <label
                        title="Cor personalizada"
                        style={{
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          cursor: 'pointer',
                          border: '1px solid rgba(255,255,255,0.25)',
                          background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)',
                          position: 'relative',
                          overflow: 'hidden',
                          display: 'block'
                        }}
                      >
                        <input
                          type="color"
                          value={colorToHex(textStyle.color) || '#ffffff'}
                          onChange={(e) => handleSetTextColor(e.target.value)}
                          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 0, padding: 0 }}
                        />
                      </label>
                      {textStyle.color && (
                        <button className="btn-icon" style={{ width: '22px', height: '22px' }} title="Remover cor (herdar do slide)" onClick={() => handleSetTextColor('')}>
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    <label style={{ display: 'block', fontSize: '0.68rem', color: '#9ca3af', marginBottom: '0.35rem' }}>Fonte</label>
                    <select
                      className="chat-input"
                      style={{ width: '100%', fontSize: '0.78rem' }}
                      value={FONT_OPTIONS.find((f) => normalizeFontValue(f.value) === normalizeFontValue(textStyle.fontFamily))?.id || 'default'}
                      onChange={(e) => {
                        const opt = FONT_OPTIONS.find((f) => f.id === e.target.value);
                        handleSetFontFamily(opt ? opt.value : '');
                      }}
                    >
                      {FONT_OPTIONS.map((f) => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </select>

                    {(textStyle.color || textStyle.fontFamily) && (
                      <button
                        className="btn-icon"
                        style={{ width: '100%', marginTop: '0.6rem', color: '#f87171', fontSize: '0.75rem', gap: '0.35rem' }}
                        onClick={handleClearTextStyle}
                      >
                        <Trash2 size={13} /> Restaurar padrão
                      </button>
                    )}
                  </div>
                )}

                {elementHtmlDraft != null && (
                  <div
                    className="glass-panel"
                    style={{
                      position: 'absolute',
                      top: `${toolbarTop + 40}px`,
                      left: `${toolbarCenterX}px`,
                      transform: 'translateX(-50%)',
                      zIndex: 41,
                      width: '380px',
                      maxWidth: 'calc(100vw - 2rem)',
                      padding: '0.7rem',
                      background: 'rgba(15, 23, 42, 0.97)'
                    }}
                  >
                    <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginBottom: '0.5rem' }}>
                      Editar HTML do elemento selecionado — título, texto ou diagrama/gráfico gerado direto pela IA (sem formulário de campos próprio):
                    </div>
                    <textarea
                      className="chat-input"
                      rows={10}
                      style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: '0.72rem', resize: 'vertical' }}
                      value={elementHtmlDraft}
                      onChange={(e) => setElementHtmlDraft(e.target.value)}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                      <button className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setElementHtmlDraft(null)}>Cancelar</button>
                      <button className="btn-primary" style={{ flex: 1, justifyContent: 'center', fontSize: '0.82rem' }} onClick={handleSaveElementHtml}>
                        <Save size={15} /> Salvar
                      </button>
                    </div>
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
            expanded={overlayExpanded}
            onToggleExpand={() => setOverlayExpanded((v) => !v)}
          />

          <DrawingCanvas
            tool={activeTool}
            color={activeColor}
            clearTrigger={clearTrigger}
          />

          <PresentationControls
            currentIndex={activeIndex}
            totalSlides={presentation.slides.length}
            atClosingSlide={atClosingSlide}
            onPrev={handlePrev}
            onNext={handleNext}
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            activeColor={activeColor}
            setActiveColor={setActiveColor}
            onClearDrawing={() => setClearTrigger(prev => prev + 1)}
            isFullscreen={isFullscreen}
            toggleFullscreen={toggleFullscreen}
            spotlightOn={spotlightOn}
            onToggleSpotlight={() => setSpotlightOn((v) => !v)}
            zoom={zoom}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onZoomReset={handleZoomReset}
          />
        </div>

        {/* Anotações do Apresentador (como o painel de notas do PowerPoint) —
            fora de .presentation-stage de propósito: aquele elemento é
            escalado/recortado pro tamanho do canvas (aspect-ratio 16:9), não
            é um lugar pra encaixar um bloco de altura variável. */}
        {!isFullscreen && !atClosingSlide && notesPanelOpen && (
          <div className="glass-panel" style={{ width: '100%', maxWidth: '1100px', marginTop: '0.75rem', padding: '0.75rem 1rem', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem', fontSize: '0.78rem', fontWeight: 700, color: '#9ca3af' }}>
              <StickyNote size={14} /> Anotações do Apresentador (visíveis só pra você, não aparecem pros alunos)
            </div>
            <textarea
              className="chat-input"
              value={currentSlide.notes || ''}
              onChange={(e) => handleChangeSlideNotes(e.target.value)}
              placeholder="Ex.: reforçar o ponto X, lembrar de citar o estudo Y..."
              rows={3}
              style={{ width: '100%', resize: 'vertical', fontSize: '0.85rem', boxSizing: 'border-box' }}
            />
          </div>
        )}
      </div>

      {/* Sidebar Direita (Chat de IA) */}
      {!isFullscreen && (
        <div className={`chat-panel ${chatOpen ? 'open' : ''}`}>
          <div className="chat-header">
            <Bot size={18} color="var(--accent-primary)" />
            <span style={{ flex: 1 }}>Editar Slide #{activeIndex + 1} com IA</span>
            <button className="btn-icon" onClick={() => setChatOpen(false)} style={{ width: '28px', height: '28px' }}>
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
              <label className="btn-secondary" style={{ padding: '0.4rem 0.7rem', justifyContent: 'flex-start', gap: '0.4rem', cursor: 'pointer' }}>
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
            <textarea
              ref={chatInputRef}
              rows={1}
              className="chat-input"
              placeholder={chatLoading ? 'Aguarde a IA terminar...' : 'Instrua a IA sobre este slide... (cole um print com Ctrl+V, Shift+Enter pra quebrar linha)'}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleChatInputKeyDown}
              onPaste={handleChatInputPaste}
              disabled={chatLoading}
              style={{ resize: 'none', overflowY: 'auto', maxHeight: `${CHAT_INPUT_MAX_HEIGHT}px`, fontFamily: 'inherit', lineHeight: '1.4' }}
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

      {/* Galeria de Templates de Slide */}
      <SlideTemplateGallery
        isOpen={templateGalleryOpen}
        onClose={() => setTemplateGalleryOpen(false)}
        onSelectTemplate={handleSelectTemplate}
      />

      {/* Novo Slide com IA (prompt + arquivo de referência) */}
      <AISingleSlideModal
        isOpen={aiSingleSlideOpen}
        onClose={() => setAiSingleSlideOpen(false)}
        onInsert={handleInsertAISlide}
      />

      {/* Novo Slide por Código (HTML, JSON, Markdown) */}
      <CodeSlideModal
        isOpen={codeSlideOpen}
        onClose={() => setCodeSlideOpen(false)}
        onInsert={handleInsertCodeSlide}
      />

      {/* Alterar Cor de Fundo do Slide */}
      <SlideBackgroundModal
        isOpen={slideBgModalOpen}
        onClose={() => setSlideBgModalOpen(false)}
        currentSlideHtml={currentSlide?.html}
        onApplyCurrent={handleApplySlideBackgroundCurrent}
        onApplyAll={handleApplySlideBackgroundAll}
      />

      {/* Cadastrar e Aplicar Informações Identificadoras (Rodapé) */}
      <SlideBrandingModal
        isOpen={slideBrandingModalOpen}
        onClose={() => setSlideBrandingModalOpen(false)}
        onApplyAll={handleApplyBrandingAll}
        onApplyCurrent={handleApplyBrandingCurrent}
        onRemoveAll={handleRemoveBrandingAll}
      />

      {/* Trocar Layout (galeria de variações via IA) */}
      <LayoutVariationsModal
        isOpen={layoutVariationsOpen}
        elementHtml={selectedEl ? getElementAt(currentSlide.html, selectedEl.index) : null}
        onClose={() => setLayoutVariationsOpen(false)}
        onSelect={handleSelectLayoutVariation}
      />

      {/* Editar Tabela em grade (qualquer <table> dentro do elemento selecionado,
          com ou sem metadado de catálogo — ver hasTableAt/getTableRowsAt) */}
      {tableEditOpen && selectedEl && (
        <div className="modal-overlay" onClick={() => setTableEditOpen(false)}>
          <div className="modal-card" style={{ maxWidth: '620px', width: '95%' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Table2 size={18} /> Editar Tabela
              </h3>
              <button className="btn-icon" onClick={() => setTableEditOpen(false)}><X size={18} /></button>
            </div>
            <TableFieldEditor value={tableDraft} onChange={setTableDraft} />
            <button
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', marginTop: '1rem' }}
              onClick={() => {
                updateCurrentSlideHtml((html) => setTableRowsAt(html, selectedEl.index, tableDraft));
                setTableEditOpen(false);
              }}
            >
              <Save size={15} /> Salvar Alterações
            </button>
          </div>
        </div>
      )}

      {/* Seletor de Aula Relacionada */}
      <RelatedPresentationPicker
        isOpen={relatedPickerOpen}
        onClose={() => setRelatedPickerOpen(false)}
        currentPresentationId={presentation.id}
        currentRelated={presentation.relatedPresentationId ? { id: presentation.relatedPresentationId, title: presentation.relatedPresentationTitle } : null}
        onSelect={handleSelectRelatedPresentation}
        onClear={handleClearRelatedPresentation}
      />

      {/* Modal de Link Público (Compartilhar) */}
      <ShareLinkModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        presentationId={presentation.id}
        presentationTitle={presentation.title}
      />

      {/* Modal de Controle Remoto (QR/PIN pro celular) */}
      <RemoteControlModal
        isOpen={remoteControlOpen}
        onClose={() => setRemoteControlOpen(false)}
        pin={pin}
      />

      {/* Modal de Exportar (PDF/PPTX) */}
      <ExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        presentation={presentation}
      />

      {/* Modal do Gerador de Prompt (Gemini Canvas) */}
      <PromptGeneratorModal
        isOpen={promptGeneratorOpen}
        onClose={() => setPromptGeneratorOpen(false)}
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
