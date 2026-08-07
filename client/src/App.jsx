import React, { useState, useEffect, useRef } from 'react';
import PresentationEditor from './components/PresentationEditor';
import AIModalGenerator from './components/AIModalGenerator';
import HomeLibrary from './components/HomeLibrary';
import SettingsModal from './components/SettingsModal';
import ConflictModal from './components/ConflictModal';
import Login from './components/Login';
import StudentJoin from './mobile/StudentJoin';
import PublicPresentationView from './pages/PublicPresentationView';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './lib/api';
import { Sparkles, Presentation, Settings, ArrowLeft, LogOut } from 'lucide-react';

const AUTOSAVE_DEBOUNCE_MS = 1200;

export default function App() {
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
  const [presentation, setPresentation] = useState(null);
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0);

  const autosaveTimerRef = useRef(null);
  const autosaveAbortRef = useRef(null);
  const lastSavedJsonRef = useRef(null);
  // Trava o autosave enquanto um conflito de edição concorrente (409, ver
  // store.js#savePresentation) está sem resolução na tela — evita empilhar
  // mais um save em cima de um conflito que o usuário ainda nem viu.
  const conflictPendingRef = useRef(false);
  const [conflict, setConflict] = useState(null); // { serverPresentation } | null

  // Autosave: persiste a apresentação no servidor sempre que ela muda, com debounce
  useEffect(() => {
    if (!presentation || conflictPendingRef.current) return;

    const json = JSON.stringify(presentation);
    if (json === lastSavedJsonRef.current) return;

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      // Cancela um autosave anterior ainda em voo antes de disparar este —
      // sem isso, dois POSTs concorrentes podem chegar ao servidor fora de
      // ordem (rede lenta, renovação de token do Firebase no meio do
      // caminho) e o mais antigo, chegando por ÚLTIMO, sobrescreve o
      // Firestore com uma lista de slides desatualizada. O `expectedUpdatedAt`
      // abaixo cobre o caso mais grave (outra ABA/DISPOSITIVO salvando por
      // cima, não só requisições deste mesmo cliente fora de ordem).
      if (autosaveAbortRef.current) autosaveAbortRef.current.abort();
      const controller = new AbortController();
      autosaveAbortRef.current = controller;
      try {
        const res = await apiFetch('/api/presentations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...presentation, expectedUpdatedAt: presentation.updatedAt ?? null }),
          signal: controller.signal
        });
        const data = await res.json();

        if (res.status === 409 && data.conflict) {
          // Servidor recusou o save: outra aba/dispositivo salvou depois que
          // este cliente carregou a apresentação (ver savePresentation em
          // store.js). Não decide sozinho — mostra o conflito pro usuário
          // escolher, com opção de baixar as próprias edições antes de
          // qualquer coisa.
          conflictPendingRef.current = true;
          setConflict({ serverPresentation: data.presentation });
          return;
        }

        if (data.success) {
          lastSavedJsonRef.current = JSON.stringify(data.presentation);
          // Adota o id (apresentação nova, sem id ainda) e o updatedAt novos
          // devolvidos pelo servidor com um updater FUNCIONAL sobre o estado
          // ATUAL (não `setPresentation(data.presentation)` direto) — esse
          // save pode ter levado um tempo; se o usuário editou algo enquanto
          // ele estava em voo, `data.presentation` é só o eco do que foi
          // ENVIADO, e substituir o estado inteiro por ele descartaria essas
          // edições concorrentes (bug real já visto antes). O updatedAt
          // PRECISA ser sincronizado de volta — sem isso, o próximo autosave
          // enviaria um expectedUpdatedAt já desatualizado e geraria um
          // conflito falso consigo mesmo.
          setPresentation((prev) => {
            if (!prev) return prev;
            const patch = { updatedAt: data.presentation.updatedAt };
            if (!prev.id) patch.id = data.presentation.id;
            return { ...prev, ...patch };
          });
          setLibraryRefreshKey((k) => k + 1);
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          // Falha de rede no autosave: mantém as alterações apenas localmente por ora
        }
      }
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => clearTimeout(autosaveTimerRef.current);
  }, [presentation]);

  // Resolve o conflito mostrado em ConflictModal: descarta as edições feitas
  // aqui e adota a versão que está salva no servidor.
  const handleLoadServerVersion = () => {
    if (!conflict) return;
    lastSavedJsonRef.current = JSON.stringify(conflict.serverPresentation);
    setPresentation(conflict.serverPresentation);
    conflictPendingRef.current = false;
    setConflict(null);
  };

  // Resolve o conflito escolhendo sobrescrever a versão do servidor com o que
  // está aqui — reenvia com `force: true` pra pular a checagem de versão
  // desta vez (o usuário já viu o conflito e decidiu de propósito).
  const handleKeepLocalVersion = async () => {
    if (!conflict || !presentation) return;
    try {
      const res = await apiFetch('/api/presentations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...presentation, force: true })
      });
      const data = await res.json();
      if (data.success) {
        lastSavedJsonRef.current = JSON.stringify(data.presentation);
        setPresentation((prev) => (prev ? { ...prev, updatedAt: data.presentation.updatedAt, id: prev.id || data.presentation.id } : prev));
        setLibraryRefreshKey((k) => k + 1);
      }
    } catch {
      // Falha de rede: mantém local: o autosave normal tenta de novo assim que `presentation` mudar
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
        lastSavedJsonRef.current = JSON.stringify(data.presentation);
        setPresentation(data.presentation);
        setView('editor');
        apiFetch(`/api/presentations/${id}/touch`, { method: 'POST' }).catch(() => {});
      }
    } catch {
      alert('Não foi possível carregar esta apresentação.');
    }
  };

  const backToLibrary = () => {
    setView('library');
    setLibraryRefreshKey((k) => k + 1);
  };

  if (loading) {
    return <div style={{ minHeight: '100vh' }} />;
  }

  if (!user) {
    return <Login />;
  }

  if (view === 'library') {
    return (
      <>
        <HomeLibrary
          onOpenPresentation={openPresentation}
          onCreateNew={() => setIsModalOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          refreshKey={libraryRefreshKey}
          user={user}
          onLogout={logout}
        />

        <AIModalGenerator
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onGenerate={(newPresentation) => {
            lastSavedJsonRef.current = null; // força o autosave a persistir a nova apresentação
            setPresentation(newPresentation);
            setView('editor');
          }}
        />

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onBackupRestored={() => setLibraryRefreshKey((k) => k + 1)}
        />
      </>
    );
  }

  return (
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
        </div>

        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button className="btn-icon" onClick={() => setIsSettingsOpen(true)} title="Configurar Chaves de API (IA)">
            <Settings size={18} />
          </button>
          <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
            <Sparkles size={18} /> <span className="btn-label">Nova Apresentação com IA</span>
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

      {/* Modais */}
      <AIModalGenerator
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onGenerate={(newPresentation) => {
          lastSavedJsonRef.current = null;
          setPresentation(newPresentation);
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
    </div>
  );
}
