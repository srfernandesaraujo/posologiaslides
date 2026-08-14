import React, { useState, useEffect, useRef } from 'react';
import PresentationEditor from './components/PresentationEditor';
import AIModalGenerator from './components/AIModalGenerator';
import HomeLibrary from './components/HomeLibrary';
import SettingsModal from './components/SettingsModal';
import ConflictModal from './components/ConflictModal';
import Login from './components/Login';
import StudentJoin from './mobile/StudentJoin';
import RemoteControl from './mobile/RemoteControl';
import PublicPresentationView from './pages/PublicPresentationView';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './lib/api';
import { findInvalidNestedArrayPath, findOversizedSlide } from './lib/dataValidation';
import { primeOfflineImageCache } from './lib/offlineImageCache';
import { Sparkles, Presentation, Settings, ArrowLeft, LogOut, AlertCircle, Loader2, FileText } from 'lucide-react';

const AUTOSAVE_DEBOUNCE_MS = 1200;

export default function App() {
  // Controle remoto (celular) — checado ANTES da rota de aluno abaixo: como
  // /remote também é acessado com "?pin=" na URL (QR Code, ver
  // RemoteControlModal.jsx), o match genérico de isStudentRoute por "pin=" na
  // querystring capturaria essa rota também se viesse depois.
  if (window.location.pathname === '/remote') {
    return <RemoteControl />;
  }

  // Verifica se o usuário está acessando a página de participação mobile do aluno (/join)
  const isStudentRoute = window.location.pathname === '/join' || window.location.search.includes('pin=');

  if (isStudentRoute) {
    return <StudentJoin />;
  }

  // Link público só-visualização (ver server/routes/publicRoutes.js) — fica
  // fora da parede de login do Firebase, mesmo espírito da rota /join acima.
  const shareViewMatch = window.location.pathname.match(/^\/view\/([^/]+)$/);
  if (shareViewMatch) {
    return <PublicPresentationView shareId={shareViewMatch[1]} />;
  }

  const { user, loading, logout } = useAuth();

  const [view, setView] = useState('library'); // 'library' | 'editor'
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [presentation, setPresentationState] = useState(null);
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0);

  // Controla quando o autosave deve de fato disparar — um CONTADOR de
  // versão local, não uma comparação de conteúdo (JSON.stringify), que já
  // causou um autosave em loop infinito antes: qualquer diferença sutil
  // entre a apresentação local e o eco que volta do servidor (ordem de
  // chaves, um campo que o servidor normaliza/adiciona/remove ao salvar)
  // fazia a comparação achar "ainda diferente" pra sempre, reenviando a
  // cada ciclo de debounce sem parar — só um F5 (que recarrega no formato
  // exato do servidor) interrompia. Um contador é imune a isso: só avança
  // quando alguém chama `setPresentation` (edição de verdade — digitar,
  // arrastar elemento, desfazer/refazer, gerar via IA); os PATCHES INTERNOS
  // deste arquivo que só sincronizam metadado de volta (updatedAt/id depois
  // de salvar, carregar do servidor, resolver conflito) usam
  // `setPresentationState` direto, sem mexer na versão, porque não são
  // edições novas — é o estado só convergindo com o que o servidor já tem.
  const editVersionRef = useRef(0);
  const savedVersionRef = useRef(0);

  // Passado pro editor (via useUndoHistory) e pra geração por IA — QUALQUER
  // chamada por este caminho é tratada como edição pendente de salvar.
  const setPresentation = (updater) => {
    editVersionRef.current += 1;
    setPresentationState(updater);
  };

  const autosaveTimerRef = useRef(null);
  const autosaveAbortRef = useRef(null);
  // Id fixo desta aba (uma vez por carregamento) — deixa o servidor
  // reconhecer "sou eu mesmo, só uma resposta anterior que abortei e nunca
  // processei" e não confundir isso com um conflito de verdade vindo de
  // outra aba/dispositivo. Ver comentário em store.js#savePresentation.
  const sessionIdRef = useRef(crypto.randomUUID());
  // Trava o autosave enquanto um conflito de edição concorrente (409, ver
  // store.js#savePresentation) está sem resolução na tela — evita empilhar
  // mais um save em cima de um conflito que o usuário ainda nem viu.
  const conflictPendingRef = useRef(false);
  const [conflict, setConflict] = useState(null); // { serverPresentation } | null
  // Antes disto, uma falha de autosave (rede, CORS, servidor fora do ar) era
  // 100% silenciosa — nenhum aviso na tela, o usuário só descobria ao dar F5
  // e ver o conteúdo faltando (já aconteceu de verdade: CORS bloqueando todo
  // POST /api/presentations sem nenhum indício visível). Este estado alimenta
  // um aviso fixo no header enquanto o último save não tiver sucesso.
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'error'
  const [saveErrorDetail, setSaveErrorDetail] = useState(null);

  // Autosave: persiste a apresentação no servidor sempre que ela muda, com debounce
  useEffect(() => {
    if (!presentation || conflictPendingRef.current) return;

    if (editVersionRef.current === savedVersionRef.current) return;
    // Versão sendo salva NESTE ciclo — capturada agora (não dentro do
    // setTimeout nem lida de volta depois do POST), pra distinguir de uma
    // edição NOVA que aconteça enquanto o save ainda está em voo: se isso
    // acontecer, `editVersionRef.current` já vai ter avançado de novo antes
    // da resposta chegar, e marcar `savedVersionRef` com este valor (mais
    // antigo) mantém a diferença viva — o efeito roda de novo (a resposta
    // troca `presentation`) e agenda mais um save pra pegar o que ficou de
    // fora, em vez de marcar tudo como sincronizado por engano.
    const versionAtSaveStart = editVersionRef.current;

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      // Cancela um autosave anterior ainda em voo antes de disparar este —
      // sem isso, dois POSTs concorrentes podem chegar ao servidor fora de
      // ordem (rede lenta, renovação de token do Firebase no meio do
      // caminho) e o mais antigo, chegando por ÚLTIMO, sobrescreve o
      // Firestore com uma lista de slides desatualizada. O `expectedUpdatedAt`
      // abaixo cobre o caso mais grave (outra ABA/DISPOSITIVO salvando por
      // cima, não só requisições deste mesmo cliente fora de ordem).
      // Checa ANTES de mandar pro servidor: Firestore recusa qualquer array
      // que contenha outro array diretamente dentro dele, com um erro
      // genérico que não diz onde está o problema (ver
      // store.js#findInvalidNestedArrayPath — mesma checagem duplicada aqui
      // pra falhar rápido, sem gastar uma volta de rede à toa, e apontar o
      // campo exato direto no console).
      const invalidPath = findInvalidNestedArrayPath(presentation.slides);
      if (invalidPath) {
        const slideIndexMatch = invalidPath.match(/^slides\[(\d+)\]/);
        const slideIndex = slideIndexMatch ? Number(slideIndexMatch[1]) : null;
        console.error(`[autosave] campo inválido em "${invalidPath}" — array dentro de array, Firestore recusa isto.`);
        if (slideIndex !== null) {
          console.error(`[autosave] conteúdo do slide ${slideIndex} (o que causou o problema):`, presentation.slides[slideIndex]);
        }
        setSaveStatus('error');
        setSaveErrorDetail(`Campo "${invalidPath}" tem um formato que o servidor não aceita (array dentro de array).`);
        return;
      }

      // Idem pro limite de 1 MiB por documento do Firestore — ver
      // store.js#findOversizedSlide. Achado numa Aula 08 real: um slide de
      // 4,5 MB (imagem colada como base64 em vez de enviada como arquivo)
      // travou o save com um erro que não menciona tamanho em lugar nenhum.
      const oversized = findOversizedSlide(presentation.slides);
      if (oversized) {
        const totalMb = (oversized.totalBytes / 1024 / 1024).toFixed(1);
        const biggestKb = (oversized.biggest.bytes / 1024).toFixed(0);
        console.error(`[autosave] apresentação muito grande: ${totalMb} MB. Slide ${oversized.biggest.index} ("${oversized.biggest.title}") sozinho: ${biggestKb} KB.`);
        setSaveStatus('error');
        setSaveErrorDetail(`Apresentação muito grande (${totalMb} MB). O slide "${oversized.biggest.title}" tem ${biggestKb} KB — provavelmente uma imagem colada direto. Apague ou refaça esse slide.`);
        return;
      }

      if (autosaveAbortRef.current) autosaveAbortRef.current.abort();
      const controller = new AbortController();
      autosaveAbortRef.current = controller;
      setSaveStatus('saving');
      setSaveErrorDetail(null);
      try {
        const res = await apiFetch('/api/presentations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...presentation, expectedUpdatedAt: presentation.updatedAt ?? null, sessionId: sessionIdRef.current }),
          signal: controller.signal
        });
        const data = await res.json();

        if (res.status === 409 && data.conflict) {
          // Servidor recusou o save: outra aba/dispositivo salvou depois que
          // este cliente carregou a apresentação (ver savePresentation em
          // store.js). Não decide sozinho — mostra o conflito pro usuário
          // escolher, com opção de baixar as próprias edições antes de
          // qualquer coisa.
          setSaveStatus('idle');
          conflictPendingRef.current = true;
          setConflict({ serverPresentation: data.presentation });
          return;
        }

        if (data.success) {
          setSaveStatus('idle');
          savedVersionRef.current = versionAtSaveStart;
          // Adota o id (apresentação nova, sem id ainda) e o updatedAt novos
          // devolvidos pelo servidor com um updater FUNCIONAL sobre o estado
          // ATUAL, via `setPresentationState` (NÃO o `setPresentation`
          // encapsulado — isto é sincronizar metadado de volta, não uma
          // edição nova, então não deve avançar `editVersionRef` e reagendar
          // outro save só por causa deste patch). Não troca `presentation`
          // pelo `data.presentation` inteiro direto porque esse save pode ter
          // levado um tempo; se o usuário editou algo enquanto ele estava em
          // voo, `data.presentation` é só o eco do que foi ENVIADO, e
          // substituir o estado inteiro por ele descartaria essas edições
          // concorrentes (bug real já visto antes). O updatedAt PRECISA ser
          // sincronizado de volta — sem isso, o próximo autosave enviaria um
          // expectedUpdatedAt já desatualizado e geraria um conflito falso
          // consigo mesmo.
          setPresentationState((prev) => {
            if (!prev) return prev;
            const patch = { updatedAt: data.presentation.updatedAt };
            if (!prev.id) patch.id = data.presentation.id;
            // Uma apresentação recém-gerada por IA (ver AIModalGenerator/
            // aiRoutes.js) só chega aqui com {title, description, slides} —
            // preenche o que ainda está ausente (favorite/lastOpenedAt/
            // relatedPresentation*) com o que o servidor devolveu, só pra
            // manter o estado local completo (ex.: o link "Aula Relacionada"
            // do slide de encerramento lê relatedPresentationId direto daqui).
            // Nunca sobrescreve um valor que o usuário (ou outra aba) já
            // tenha editado nesta sessão.
            if (prev.favorite === undefined) patch.favorite = data.presentation.favorite;
            if (prev.lastOpenedAt === undefined) patch.lastOpenedAt = data.presentation.lastOpenedAt;
            if (prev.relatedPresentationId === undefined) patch.relatedPresentationId = data.presentation.relatedPresentationId;
            if (prev.relatedPresentationTitle === undefined) patch.relatedPresentationTitle = data.presentation.relatedPresentationTitle;
            return { ...prev, ...patch };
          });
          setLibraryRefreshKey((k) => k + 1);
        } else {
          // Resposta chegou mas sem sucesso (400/401/500 etc, não é o 409 de
          // conflito tratado acima) — não fica em silêncio.
          setSaveStatus('error');
          setSaveErrorDetail(data.error || null);
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          // Falha de rede/CORS no autosave — antes ficava só "mantém as
          // alterações apenas localmente por ora" sem avisar ninguém; foi
          // exatamente assim que um bloqueio de CORS em produção apagou
          // silenciosamente uma sessão de edição inteira (2026-08-07).
          setSaveStatus('error');
        }
      }
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => clearTimeout(autosaveTimerRef.current);
  }, [presentation]);

  // Resolve o conflito mostrado em ConflictModal: descarta as edições feitas
  // aqui e adota a versão que está salva no servidor.
  const handleLoadServerVersion = () => {
    if (!conflict) return;
    savedVersionRef.current = editVersionRef.current; // adotou o servidor: nada pendente de salvar
    setPresentationState(conflict.serverPresentation);
    conflictPendingRef.current = false;
    setConflict(null);
  };

  // Resolve o conflito escolhendo sobrescrever a versão do servidor com o que
  // está aqui — reenvia com `force: true` pra pular a checagem de versão
  // desta vez (o usuário já viu o conflito e decidiu de propósito).
  const handleKeepLocalVersion = async () => {
    if (!conflict || !presentation) return;
    const versionAtSaveStart = editVersionRef.current;
    setSaveStatus('saving');
    try {
      const res = await apiFetch('/api/presentations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...presentation, force: true, sessionId: sessionIdRef.current })
      });
      const data = await res.json();
      if (data.success) {
        setSaveStatus('idle');
        savedVersionRef.current = versionAtSaveStart;
        // Mesmo backfill do autosave normal acima — ver comentário lá.
        setPresentationState((prev) => {
          if (!prev) return prev;
          const patch = { updatedAt: data.presentation.updatedAt };
          if (!prev.id) patch.id = data.presentation.id;
          if (prev.favorite === undefined) patch.favorite = data.presentation.favorite;
          if (prev.lastOpenedAt === undefined) patch.lastOpenedAt = data.presentation.lastOpenedAt;
          if (prev.relatedPresentationId === undefined) patch.relatedPresentationId = data.presentation.relatedPresentationId;
          if (prev.relatedPresentationTitle === undefined) patch.relatedPresentationTitle = data.presentation.relatedPresentationTitle;
          return { ...prev, ...patch };
        });
        setLibraryRefreshKey((k) => k + 1);
      } else {
        setSaveStatus('error');
      }
    } catch {
      // Falha de rede: mantém local, mas avisa — o autosave normal tenta de novo assim que `presentation` mudar
      setSaveStatus('error');
    } finally {
      conflictPendingRef.current = false;
      setConflict(null);
    }
  };

  // Baixa as edições feitas aqui como JSON — rede de segurança pro usuário
  // não perder nada mesmo se acabar escolhendo a opção errada no conflito.
  const handleDownloadLocalVersion = () => {
    if (!presentation) return;
    const blob = new Blob([JSON.stringify(presentation, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeTitle = (presentation.title || 'apresentacao').replace(/[^\w-]+/g, '_');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeTitle}-conflito-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const openPresentation = async (id) => {
    try {
      const res = await apiFetch(`/api/presentations/${id}`);
      const data = await res.json();
      if (data.success) {
        // Recém-carregada do servidor: nenhuma edição pendente ainda —
        // zera os dois contadores pra começar uma apresentação "limpa"
        // (setPresentationState, não o `setPresentation` encapsulado, pra
        // não contar isto como uma edição que precisa de autosave).
        editVersionRef.current = 0;
        savedVersionRef.current = 0;
        setPresentationState(data.presentation);
        setView('editor');
        apiFetch(`/api/presentations/${id}/touch`, { method: 'POST' }).catch(() => {});
        primeOfflineImageCache(data.presentation.slides);
      }
    } catch {
      alert('Não foi possível carregar esta apresentação.');
    }
  };

  const backToLibrary = () => {
    setView('library');
    setLibraryRefreshKey((k) => k + 1);
  };

  // Alternativa a "Nova Apresentação com IA": pula o AIModalGenerator
  // inteiro e já entra no editor com um único slide em branco (mesmo
  // placeholder usado por "Adicionar Novo Slide Vazio" dentro do editor, ver
  // handleAddSlideAt em PresentationEditor.jsx) — pro professor que prefere
  // montar do zero usando o chat de IA/blocos/mídia depois, sem passar pelo
  // fluxo de geração de contorno por IA.
  const handleCreateBlank = () => {
    setPresentation({
      title: 'Nova Apresentação',
      slides: [{
        id: `slide-${Date.now()}`,
        title: 'Slide 1',
        html: '<div class="slide-root" data-blank-placeholder="true" style="display:flex; align-items:center; justify-content:center; height:100%; padding:2rem; color:#4b5563; font-size:1.05rem; text-align:center;">Slide em branco — use o chat de IA ou a biblioteca de blocos pra começar.</div>'
      }]
    });
    setView('editor');
  };

  if (loading) {
    return <div style={{ minHeight: '100vh' }} />;
  }

  if (!user) {
    return <Login />;
  }

  return (
    <>
      {/* Biblioteca fica SEMPRE montada (só escondida via display:none
          quando a tela ativa é o editor), em vez do antigo `if (view ===
          'library') return (...)` que desmontava a árvore inteira a cada
          troca de tela. HomeLibrary tem uma miniatura por apresentação (um
          iframe cada, ver SlideThumbnail/PresentationViewer) — desmontar e
          remontar tudo do zero a cada ida-e-volta pro editor recarregava
          TODAS elas de novo, mesmo quando nada tinha mudado (é o mesmo
          problema já corrigido no SlideList da barra lateral do editor,
          só que aqui na biblioteca). `display:contents` no wrapper (só
          quando visível) não introduz caixa nenhuma, então o grid próprio
          de `.library-page` (height:100vh) continua se comportando como se
          estivesse direto na raiz.
          A prop `active` evita o outro lado do problema: cada autosave bem-
          sucedido incrementa `libraryRefreshKey` (ver mais abaixo) pra
          biblioteca vir com dados frescos da PRÓXIMA vez que for aberta —
          sem a guarda de `active` dentro de HomeLibrary, isto buscaria a
          árvore inteira de novo no Firestore a CADA autosave enquanto o
          usuário edita, mesmo com a biblioteca invisível. */}
      <div style={{ display: view === 'library' ? 'contents' : 'none' }}>
        <HomeLibrary
          active={view === 'library'}
          onOpenPresentation={openPresentation}
          onCreateNew={() => setIsModalOpen(true)}
          onCreateBlank={handleCreateBlank}
          onOpenSettings={() => setIsSettingsOpen(true)}
          refreshKey={libraryRefreshKey}
          user={user}
          onLogout={logout}
        />
      </div>

      {view === 'editor' && (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          {/* Top Header */}
          <header className="app-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button className="btn-icon" onClick={backToLibrary} title="Voltar para a Biblioteca">
                <ArrowLeft size={20} />
              </button>
              <div className="app-title">
                <Presentation size={24} color="var(--accent-primary)" />
                <span>Posologia Slides</span>
              </div>

              {saveStatus === 'saving' && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  <Loader2 size={14} className="animate-spin" /> Salvando…
                </span>
              )}
              {saveStatus === 'error' && (
                <span
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 700, color: '#f87171' }}
                  title="As últimas alterações podem não ter sido salvas no servidor. Não feche esta aba."
                >
                  <AlertCircle size={14} />
                  {saveErrorDetail || 'Não foi possível salvar — verifique sua conexão'}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button className="btn-icon" onClick={() => setIsSettingsOpen(true)} title="Configurar Chaves de API (IA)">
                <Settings size={18} />
              </button>
              <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
                <Sparkles size={18} /> <span className="btn-label">Nova Apresentação com IA</span>
              </button>
              <button className="btn-secondary" onClick={handleCreateBlank} title="Começar do zero, sem IA">
                <FileText size={18} /> <span className="btn-label">Criar em branco</span>
              </button>
              <button className="btn-icon" onClick={logout} title="Sair">
                <LogOut size={18} />
              </button>
            </div>
          </header>

          {/* Main Presentation Editor */}
          <PresentationEditor
            presentation={presentation}
            setPresentation={setPresentation}
            onOpenModal={() => setIsModalOpen(true)}
            onOpenPresentation={openPresentation}
          />
        </div>
      )}

      {/* Modais — uma instância só, compartilhada entre biblioteca e editor
          (antes existiam duas cópias de AIModalGenerator/SettingsModal, uma
          em cada branch; agora que os dois ficam montados ao mesmo tempo,
          duas instâncias reagindo ao mesmo `isModalOpen`/`isSettingsOpen`
          abririam os dois modais sobrepostos). `onGenerate` sempre leva pro
          editor — mesmo comportamento que já valia ao gerar a partir da
          biblioteca; gerar a partir do editor já deixava `view` como
          'editor' mesmo, então virou um no-op inofensivo ali. */}
      <AIModalGenerator
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onGenerate={(newPresentation) => {
          setPresentation(newPresentation); // via wrapper: marca como pendente de salvar
          setView('editor');
        }}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onBackupRestored={() => setLibraryRefreshKey((k) => k + 1)}
      />

      <ConflictModal
        isOpen={!!conflict}
        localPresentation={presentation}
        serverPresentation={conflict?.serverPresentation}
        onKeepLocal={handleKeepLocalVersion}
        onLoadServer={handleLoadServerVersion}
        onDownloadLocal={handleDownloadLocalVersion}
      />
    </>
  );
}
