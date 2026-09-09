import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import PresentationViewer, { SLIDE_EDITOR_MESSAGE_SOURCE, measureIframeEdgeBackground } from '../components/PresentationViewer';
import PublicViewerControls from '../components/PublicViewerControls';
import useCanvasFit from '../lib/useCanvasFit';
import { SLIDE_NATIVE_WIDTH, SLIDE_NATIVE_HEIGHT, STAGE_BOTTOM_RESERVE, ZOOM_PRESENT_RANGE, ZOOM_STEP } from '../lib/canvasConstants';
import { resolveTransition } from '../lib/transitionCatalog';
import { isSlideColorInverted, invertColorForFilter } from '../lib/slideHtmlUtils';
import { apiFetch } from '../lib/api';
import useScreenWakeLock from '../lib/useScreenWakeLock';
import { primeOfflineImageCache } from '../lib/offlineImageCache';

// Visualizador público só-visualização: alvo de rota de /view/:shareId (ver
// App.jsx), fora da parede de login do Firebase — busca a apresentação via
// server/routes/publicRoutes.js (sem autenticação) e renderiza os slides com
// a mesma infraestrutura de canvas fixo do editor (useCanvasFit), só que sem
// nada de edição (arrastar/redimensionar/seleção nunca é injetado, ver
// editable={false} abaixo).
export default function PublicPresentationView({ shareId }) {
  const [presentation, setPresentation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [spotlightOn, setSpotlightOn] = useState(false);

  const { outerRef: stageRef, scale: canvasScale } = useCanvasFit(SLIDE_NATIVE_WIDTH, SLIDE_NATIVE_HEIGHT, { bottomReserve: STAGE_BOTTOM_RESERVE });
  const stageIframeRef = useRef(null);

  // Zoom manual pro aluno ampliar slides densos enquanto estuda sozinho
  // (pedido do usuário — a página pública nunca teve nenhum mecanismo de
  // zoom, diferente do editor). Mesmo padrão de PresentationEditor.jsx
  // (zoom/effectiveScale/.zoom-scrollport/.zoom-sizer + gesto de
  // pinça/roda via buildZoomGestureScript), simplificado: sem "Ajustar
  // tamanho" nem controle remoto aqui (decisão explícita — só controle
  // manual, o aluno decide quando/quanto ampliar, nenhum slide abre
  // pré-ampliado pra ele mesmo que o professor tenha marcado "Ajustar
  // tamanho" pra si mesmo apresentar).
  const [zoom, setZoom] = useState(1);
  const zoomScrollportRef = useRef(null);
  const effectiveScale = canvasScale * zoom;
  const clampZoom = (z) => Math.min(ZOOM_PRESENT_RANGE[1], Math.max(ZOOM_PRESENT_RANGE[0], z));
  const handleZoomIn = () => setZoom((z) => clampZoom(z + ZOOM_STEP));
  const handleZoomOut = () => setZoom((z) => clampZoom(z - ZOOM_STEP));
  const handleZoomReset = () => setZoom(1);

  // Recentraliza a rolagem quando o zoom muda — ver comentário completo do
  // mesmo mecanismo em PresentationEditor.jsx (sem isto o conteúdo "foge"
  // pro canto superior esquerdo em vez de crescer a partir do centro).
  const prevEffectiveScaleRef = useRef(effectiveScale);
  useLayoutEffect(() => {
    const port = zoomScrollportRef.current;
    const prevScale = prevEffectiveScaleRef.current;
    if (port && prevScale && Math.abs(prevScale - effectiveScale) > 0.0001) {
      const ratio = effectiveScale / prevScale;
      const centerX = port.scrollLeft + port.clientWidth / 2;
      const centerY = port.scrollTop + port.clientHeight / 2;
      port.scrollLeft = Math.max(0, centerX * ratio - port.clientWidth / 2);
      port.scrollTop = Math.max(0, centerY * ratio - port.clientHeight / 2);
    }
    prevEffectiveScaleRef.current = effectiveScale;
  }, [effectiveScale]);

  // Rolagem volta pro canto ao trocar de slide (conteúdo diferente, a
  // posição rolada do slide anterior não faz sentido aqui) — zoom em si
  // continua entre slides de propósito, mesmo comportamento do editor.
  useEffect(() => {
    zoomScrollportRef.current?.scrollTo(0, 0);
  }, [activeIndex]);

  // Gesto de pinça/roda (ver buildZoomGestureScript em PresentationViewer,
  // zoomGestureEnabled abaixo) e arrasto-pra-navegar com zoom aplicado —
  // mesmo mecanismo do editor, ver comentário lá.
  useEffect(() => {
    const handleMessage = (event) => {
      const data = event.data;
      if (!data || data.source !== SLIDE_EDITOR_MESSAGE_SOURCE) return;
      if (data.type === 'zoom-gesture') {
        setZoom((z) => clampZoom(z * data.factor));
      } else if (data.type === 'pan-gesture') {
        const port = zoomScrollportRef.current;
        if (port) {
          port.scrollLeft = Math.max(0, port.scrollLeft - data.dx);
          port.scrollTop = Math.max(0, port.scrollTop - data.dy);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // `currentSlide` (mais abaixo) só existe depois dos "return" antecipados
  // de loading/erro — precisa ficar num ref (atualizado logo depois de
  // `currentSlide` ser calculado) pra handleStageReady, chamada de forma
  // assíncrona (via onReady), sempre ler o slide mais recente sem precisar
  // mover os hooks pra depois desses returns (quebraria as Rules of Hooks).
  const currentSlideRef = useRef(null);

  // Cor de fundo REAL do slide atual, medida ao vivo no DOM do iframe (ver
  // measureIframeEdgeBackground em PresentationViewer.jsx) — usada só em
  // tela cheia, pra colorir a faixa reservada (STAGE_BOTTOM_RESERVE) igual
  // o fundo de verdade do slide em vez do preto fixo da caixa. Mesmo
  // mecanismo de PresentationEditor.jsx (ver comentário lá).
  const [stageBg, setStageBg] = useState(null);
  const handleStageReady = () => {
    const raw = measureIframeEdgeBackground(stageIframeRef.current);
    if (!raw) { setStageBg(null); return; }
    setStageBg(isSlideColorInverted(currentSlideRef.current?.html) ? invertColorForFilter(raw) : raw);
  };

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/public/presentations/${shareId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success) {
          setPresentation(data.presentation);
          primeOfflineImageCache(data.presentation.slides);
        } else {
          setError(data.error || 'Não foi possível carregar esta apresentação.');
        }
      })
      .catch(() => {
        if (!cancelled) setError('Não foi possível carregar esta apresentação.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [shareId]);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useScreenWakeLock(isFullscreen);

  const toggleFullscreen = () => {
    if (!stageRef.current) return;
    if (!document.fullscreenElement) {
      stageRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)' }}>
        <Loader2 className="animate-spin" size={28} />
      </div>
    );
  }

  if (error || !presentation) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', color: '#9ca3af', textAlign: 'center', padding: '2rem' }}>
        <AlertTriangle size={40} color="#f87171" />
        <p style={{ maxWidth: '360px', margin: 0 }}>{error || 'Este link não existe mais ou foi revogado pelo professor.'}</p>
      </div>
    );
  }

  const slides = (presentation.slides || []).filter((s) => !s.hidden);
  const currentSlide = slides[activeIndex] || { html: '<div style="color:#9ca3af;padding:2rem;">Sem slides.</div>' };
  currentSlideRef.current = currentSlide;
  const currentTransition = resolveTransition(currentSlide.transition);

  const handlePrev = () => setActiveIndex((i) => Math.max(0, i - 1));
  const handleNext = () => setActiveIndex((i) => Math.min(slides.length - 1, i + 1));

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {!isFullscreen && (
        <header className="app-header">
          <div className="app-title">
            <span>{presentation.title}</span>
          </div>
        </header>
      )}

      <div className="stage-container" style={{ flex: 1 }}>
        <div
          ref={stageRef}
          className={`presentation-stage ${isFullscreen ? 'fullscreen-stage' : ''}`}
          style={isFullscreen && stageBg ? { background: stageBg } : undefined}
        >
          {/* Viewport de rolagem nativa pro zoom manual — ver comentário
              completo do mesmo mecanismo em PresentationEditor.jsx. overflow
              só vira "auto" quando o zoom não é 100%, pra nunca aparecer uma
              barra de rolagem de 1px por erro de ponto flutuante em zoom
              normal. */}
          <div
            ref={zoomScrollportRef}
            className="zoom-scrollport"
            style={{
              position: 'absolute',
              inset: 0,
              overflow: Math.abs(zoom - 1) < 0.01 ? 'hidden' : 'auto',
              scrollbarGutter: 'stable both-edges',
              touchAction: zoom > 1.01 ? 'none' : 'auto',
              cursor: zoom > 1.01 ? 'grab' : 'default'
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
                  // scale3d + backface-visibility:hidden (sem will-change:transform — ver
                  // comentário equivalente em PresentationEditor.jsx) força o Safari a
                  // promover esta camada pra compositing de GPU e redesenhar o <iframe>
                  // filho na resolução final em vez de esticar um bitmap borrado.
                  transform: `scale3d(${effectiveScale}, ${effectiveScale}, 1)`,
                  transformOrigin: 'top left',
                  WebkitBackfaceVisibility: 'hidden',
                  backfaceVisibility: 'hidden'
                }}
              >
                <div
                  key={activeIndex}
                  className={`slide-transition-wrapper pos-transition-${currentTransition.type}`}
                  style={{ '--pos-transition-duration': `${currentTransition.duration}s` }}
                >
                  <PresentationViewer
                    ref={stageIframeRef}
                    htmlContent={currentSlide.html}
                    editable={false}
                    spotlightEnabled={isFullscreen && spotlightOn}
                    zoomGestureEnabled
                    panEnabled={zoom > 1.01}
                    onReady={isFullscreen ? handleStageReady : undefined}
                  />
                </div>
              </div>
            </div>
          </div>

          <PublicViewerControls
            currentIndex={activeIndex}
            totalSlides={slides.length}
            onPrev={handlePrev}
            onNext={handleNext}
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
      </div>
    </div>
  );
}
