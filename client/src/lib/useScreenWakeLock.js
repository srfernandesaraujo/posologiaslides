import { useEffect, useRef } from 'react';

/**
 * Hook para inibir a hibernação/desligamento da tela (Screen Wake Lock API).
 * Impede que a tela apague ou o computador entre em modo de suspensão/hibernação
 * durante a apresentação em Tela Cheia ou na Visão do Apresentador.
 */
export default function useScreenWakeLock(enabled = true) {
  const wakeLockRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
      return;
    }

    let isSubscribed = true;

    const requestWakeLock = async () => {
      if (!('wakeLock' in navigator)) return;
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
        // Trava de tela pode ser ignorada silenciosamente se negada pelo SO ou bateria crítica
      }
    };

    requestWakeLock();

    // Reativa a trava quando a aba/janela volta a ficar visível
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && enabled && !wakeLockRef.current) {
        requestWakeLock();
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
    };
  }, [enabled]);
}
