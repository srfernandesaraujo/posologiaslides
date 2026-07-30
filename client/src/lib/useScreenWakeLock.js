import { useEffect, useRef } from 'react';

// Vídeo mudo minimalista codificado em base64 H.264
// Utilizado para inibir a hibernação no Safari / macOS / iOS (que ignoram a Wake Lock API pura sem sessão de mídia ativa)
const SILENT_VIDEO_BASE64 = 'data:video/mp4;base64,AAAAHGZ0eXBpc29tAAAAAGlzb21pc28yYXZjMQAAAAptZGF0AAAAABhnYWlA4AYGkAAACAAgAAACAAAAAABmcmVlAAAALm1vb3YAAABsbXZoZAAAAADawQjA2sEIwAAAA+gAAAAAAAEAAAEAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAABFtZGlhAAAAIG1kaGQAAAAA2sEIwNrBEMAAAAAAAQAAAAAAABVoZGxyAAAAAAB2aWRlAAAAAAAAAAAAAAAAAAAAAAAAY2FwbAAAAABtaW5mAAAAFHZtaGQAAAAAAAABAAAAAAAAAAAAAAAkZGluZgAAABRkcmVmAAAAAAABAAAADHVyb CAAAAABAAAAAHRibGsgAAABc3RzZAAAAAAAABFhdmMxAAAAAAABAAAAAQAAAABhdmNDMWBCwB//AAAAKGF2Y2MAAQBCwB//AAAAHWhhbXBhAAAAAGF2YzEAAAABAAAAAQAAAAAAAABic3R0cwAAAAABAAAAAQAAACAAAAAcdHNjemEAAAAAAAEAAAAAGAAAAAAAEHN0c2MAAAAAAAEAAAABAAAAAQAAAAEAAAAcc3RzdocAAAAAAAEAAAAQAAAAAQAAABAAAAA0c3RjbwAAAAABAAAAAEAAAAA=';

/**
 * Hook de Proteção Quádrupla Anti-Hibernação (Universal para macOS / Safari / iOS / Windows / Chrome)
 * Combina Wake Lock API + Sessão de Vídeo Mudo + Sessão de Áudio WebKit + Heartbeat de Reativação
 */
export default function useScreenWakeLock(enabled = true) {
  const wakeLockRef = useRef(null);
  const videoRef = useRef(null);
  const audioCtxRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);

  useEffect(() => {
    // 1. Elemento de vídeo silencioso
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

    const stopAllLocks = () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
      if (videoEl && !videoEl.paused) {
        videoEl.pause();
        if (videoEl.parentNode) videoEl.parentNode.removeChild(videoEl);
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };

    if (!enabled) {
      stopAllLocks();
      return;
    }

    let isSubscribed = true;

    // 2. Trava Nativa: Screen Wake Lock API (Chrome, Edge, Firefox, Brave)
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
        } catch (err) {}
      }
    };

    // 3. Trava de Vídeo para Safari / macOS
    const startVideoLock = () => {
      if (videoEl) {
        if (!videoEl.parentNode) {
          document.body.appendChild(videoEl);
        }
        videoEl.play().catch(() => {});
      }
    };

    // 4. Trava de Áudio WebKit para macOS / Safari (Cria sessão de áudio inaudível para forçar prevenção de hibernação pelo SO)
    const startAudioLock = () => {
      try {
        const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
        if (AudioCtxClass && !audioCtxRef.current) {
          const ctx = new AudioCtxClass();
          if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
          }
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          gain.gain.value = 0.00001; // Inaudível mas mantém a sessão de mídia ativa no macOS
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          audioCtxRef.current = ctx;
        } else if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
          audioCtxRef.current.resume().catch(() => {});
        }
      } catch (err) {}
    };

    const activateAllLocks = () => {
      requestWakeLock();
      startVideoLock();
      startAudioLock();
    };

    activateAllLocks();

    // 5. Heartbeat periódico a cada 20 segundos para re-confirmar as travas contra timeout do macOS
    heartbeatIntervalRef.current = setInterval(() => {
      if (enabled && isSubscribed) {
        if (!wakeLockRef.current) requestWakeLock();
        if (videoEl && videoEl.paused) startVideoLock();
        if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
          audioCtxRef.current.resume().catch(() => {});
        }
      }
    }, 20000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && enabled) {
        activateAllLocks();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isSubscribed = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopAllLocks();
    };
  }, [enabled]);
}
