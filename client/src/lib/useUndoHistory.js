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

  // Ref "sempre fresca" do `presentation` atual — commit/commitDebounced/
  // undo/redo podem ser chamados a partir de handlers assíncronos que só
  // terminam depois de um `await` (ex.: handleSendChatMessage em
  // PresentationEditor.jsx). Nesses casos a INSTÂNCIA destas funções que o
  // handler capturou por closure é a de quando ele começou, não a mais
  // recente — ler o parâmetro `presentation` direto (em vez desta ref)
  // empilharia um "antes" desatualizado no histórico de undo, mesmo já
  // gravando o `next` certo (esse já é corrigido no lado do chamador, ver
  // presentationRef em PresentationEditor.jsx). Sem isto, um Ctrl+Z logo
  // depois de uma dessas ações podia "voltar" bem mais do que o esperado.
  const presentationRef = useRef(presentation);
  useEffect(() => { presentationRef.current = presentation; }, [presentation]);

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
    pushPast(presentationRef.current);
    skipNextRef.current = true;
    syncFlags();
    setPresentation(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setPresentation, maxHistory]);

  const commitDebounced = useCallback((next) => {
    if (pendingBeforeRef.current === null) pendingBeforeRef.current = presentationRef.current;
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
  }, [setPresentation, maxHistory, debounceMs]);

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return null;
    const restored = pastRef.current.pop();
    futureRef.current.push(presentationRef.current);
    skipNextRef.current = true;
    syncFlags();
    setPresentation(restored);
    return restored;
  }, [setPresentation]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return null;
    const restored = futureRef.current.pop();
    pastRef.current.push(presentationRef.current);
    skipNextRef.current = true;
    syncFlags();
    setPresentation(restored);
    return restored;
  }, [setPresentation]);

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
