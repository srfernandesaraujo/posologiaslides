import { useEffect, useRef } from 'react';

// Vídeo mudo minimalista codificado em base64 H.264
// Utilizado para inibir a hibernação no Safari / macOS / iOS (que ignoram a Wake Lock API pura sem sessão de mídia ativa)
const SILENT_VIDEO_BASE64 = 'data:video/mp4;base64,AAAAHGZ0eXBpc29tAAAAAGlzb21pc28yYXZjMQAAAAptZGF0AAAAABhnYWlA4AYGkAAACAAgAAACAAAAAABmcmVlAAAALm1vb3YAAABsbXZoZAAAAADawQjA2sEIwAAAA+gAAAAAAAEAAAEAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAABFtZGlhAAAAIG1kaGQAAAAA2sEIwNrBEMAAAAAAAQAAAAAAABVoZGxyAAAAAAB2aWRlAAAAAAAAAAAAAAAAAAAAAAAAY2FwbAAAAABtaW5mAAAAFHZtaGQAAAAAAAABAAAAAAAAAAAAAAAkZGluZgAAABRkcmVmAAAAAAABAAAADHVybCAAAAABAAAAAHRibGsgAAABc3RzZAAAAAAAABFhdmMxAAAAAAABAAAAAQAAAABhdmNDMWBCwB//AAAAKGF2Y2MAAQBCwB//AAAAHWhhbXBhAAAAAGF2YzEAAAABAAAAAQAAAAAAAABic3R0cwAAAAABAAAAAQAAACAAAAAcdHNjemEAAAAAAAEAAAAAGAAAAAAAEHN0c2MAAAAAAAEAAAABAAAAAQAAAAEAAAAcc3RzdocAAAAAAAEAAAAQAAAAAQAAABAAAAA0c3RjbwAAAAABAAAAAEAAAAA=';

/**
 * Hook universal para inibir a hibernação/desligamento da tela.
 * Combina a Screen Wake Lock API nativa com um fallback de sessão de mídia para Safari / macOS / iOS.
 */
export default function useScreenWakeLock(enabled = true) {
  const wakeLockRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    // Cria o elemento de vídeo invisível se ainda não existir
    if (!videoRef.current && typeof document !== 'undefined') {
      const video = document.createElement('video');
      video.setAttribute('aria-hidden', 'true');
      video.setAttribute('tabindex', '-1');
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.muted = true;
      video.loop = true;
      video.style.cssText = 'position:fixed; top:0; left:0; width:1px; height:1px; opacity:0.01; pointer-events:none; z-index:-9999;';
      video.src = SILENT_VIDEO_BASE64;
      videoRef.current = video;
    }

    const videoEl = videoRef.current;

    if (!enabled) {
      // Libera WakeLock nativo
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
      // Pausa e remove o vídeo no Safari
      if (videoEl && !videoEl.paused) {
        videoEl.pause();
        if (videoEl.parentNode) {
          videoEl.parentNode.removeChild(videoEl);
        }
      }
      return;
    }

    let isSubscribed = true;

    // 1. Método Nativo: Screen Wake Lock API (Chrome, Edge, Firefox, Brave)
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator) {
        try {
          const lock = await navigator.wakeLock.request('screen');
          if (isSubscribed) {
            wakeLockRef.current = lock;
            lock.addEventListener('release', () => {
              if (isSubscribed && wakeLockRef.current === lock) {
                wakeLockRef.current = null;
              }
            });
          } else {
            lock.release().catch(() => {});
          }
        } catch (err) {
          // Trata exceções em navegadores restritivos
        }
      }
    };

    // 2. Método Fallback Mídia para Safari / macOS / iOS (reproduz vídeo em loop mudo de 1px)
    const startSafariWakeLock = () => {
      if (videoEl) {
        if (!videoEl.parentNode) {
          document.body.appendChild(videoEl);
        }
        videoEl.play().catch(() => {});
      }
    };

    requestWakeLock();
    startSafariWakeLock();

    // Reativa as travas quando a aba/janela volta a ficar visível
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && enabled) {
        if (!wakeLockRef.current) {
          requestWakeLock();
        }
        if (videoEl && videoEl.paused) {
          startSafariWakeLock();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isSubscribed = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
      if (videoEl && !videoEl.paused) {
        videoEl.pause();
        if (videoEl.parentNode) {
          videoEl.parentNode.removeChild(videoEl);
        }
      }
    };
  }, [enabled]);
}
