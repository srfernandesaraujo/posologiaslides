import { useCallback, useEffect, useRef, useState } from 'react';

// Desfazer/Refazer pra `presentation` — empilha snapshots do valor ANTERIOR
// a cada mudança, sem precisar que cada handler em PresentationEditor.jsx
// saiba nada de histórico: eles só trocam `setPresentation(next)` direto por
// `commit(next)` (ação discreta: um passo por clique) ou `commitDebounced(next)`
// (campo de digitação/slider contínuo: um único passo por pausa de uso, não
// um passo por tecla/pixel arrastado).
//
// Detecção de "substituição externa": se `presentation` mudar por qualquer
// caminho que NÃO seja commit/commitDebounced/undo/redo (os pontos em
// App.jsx que carregam ou trocam a apresentação inteira — abrir do zero,
// gerar via IA, adotar o id do servidor), o histórico é limpo — não faz
// sentido desfazer de volta pra um documento diferente.
export default function useUndoHistory(presentation, setPresentation, { maxHistory = 50, debounceMs = 500 } = {}) {
  const pastRef = useRef([]);
  const futureRef = useRef([]);
  const skipNextRef = useRef(false);
  const debounceTimerRef = useRef(null);
  const pendingBeforeRef = useRef(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const syncFlags = () => {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  };

  const pushPast = (snapshot) => {
    pastRef.current.push(snapshot);
    if (pastRef.current.length > maxHistory) pastRef.current.shift();
    futureRef.current = [];
  };

  const commit = useCallback((next) => {
    pushPast(presentation);
    skipNextRef.current = true;
    syncFlags();
    setPresentation(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentation, setPresentation, maxHistory]);

  const commitDebounced = useCallback((next) => {
    if (pendingBeforeRef.current === null) pendingBeforeRef.current = presentation;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      pushPast(pendingBeforeRef.current);
      pendingBeforeRef.current = null;
      debounceTimerRef.current = null;
      syncFlags();
    }, debounceMs);
    skipNextRef.current = true;
    setPresentation(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentation, setPresentation, maxHistory, debounceMs]);

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return null;
    const restored = pastRef.current.pop();
    futureRef.current.push(presentation);
    skipNextRef.current = true;
    syncFlags();
    setPresentation(restored);
    return restored;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentation, setPresentation]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return null;
    const restored = futureRef.current.pop();
    pastRef.current.push(presentation);
    skipNextRef.current = true;
    syncFlags();
    setPresentation(restored);
    return restored;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentation, setPresentation]);

  useEffect(() => {
    if (skipNextRef.current) {
      skipNextRef.current = false;
      return;
    }
    pastRef.current = [];
    futureRef.current = [];
    pendingBeforeRef.current = null;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    syncFlags();
  }, [presentation]);

  useEffect(() => () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
  }, []);

  return { commit, commitDebounced, undo, redo, canUndo, canRedo };
}
