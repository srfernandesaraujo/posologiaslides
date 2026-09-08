import React, { useEffect, useRef, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import PresentationViewer, { measureIframeEdgeBackground } from '../components/PresentationViewer';
import PublicViewerControls from '../components/PublicViewerControls';
import useCanvasFit from '../lib/useCanvasFit';
import { SLIDE_NATIVE_WIDTH, SLIDE_NATIVE_HEIGHT, STAGE_BOTTOM_RESERVE } from '../lib/canvasConstants';
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
              transform: `scale3d(${canvasScale}, ${canvasScale}, 1)`,
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
                onReady={isFullscreen ? handleStageReady : undefined}
              />
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
          />
        </div>
      </div>
    </div>
  );
}
