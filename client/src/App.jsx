import React, { useState, useEffect, useRef } from 'react';
import PresentationEditor from './components/PresentationEditor';
import AIModalGenerator from './components/AIModalGenerator';
import HomeLibrary from './components/HomeLibrary';
import SettingsModal from './components/SettingsModal';
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

  // Autosave: persiste a apresentação no servidor sempre que ela muda, com debounce
  useEffect(() => {
    if (!presentation) return;

    const json = JSON.stringify(presentation);
    if (json === lastSavedJsonRef.current) return;

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      // Cancela um autosave anterior ainda em voo antes de disparar este —
      // sem isso, dois POSTs concorrentes podem chegar ao servidor fora de
      // ordem (rede lenta, renovação de token do Firebase no meio do
      // caminho) e o mais antigo, chegando por ÚLTIMO, sobrescreve o
      // Firestore com uma lista de slides desatualizada (savePresentation faz
      // `ref.update()`, substituição total do array `slides`, sem checagem
      // de versão — ver server/services/store.js). Isso já causou slides
      // recém-inseridos (e até slides preexistentes) sumirem depois de
      // salvar.
      if (autosaveAbortRef.current) autosaveAbortRef.current.abort();
      const controller = new AbortController();
      autosaveAbortRef.current = controller;
      try {
        const res = await apiFetch('/api/presentations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(presentation),
          signal: controller.signal
        });
        const data = await res.json();
        if (data.success) {
          lastSavedJsonRef.current = JSON.stringify(data.presentation);
          // Apresentação nova (sem id ainda): adota o id definitivo gerado
          // pelo servidor. Faz isso com um updater FUNCIONAL sobre o estado
          // ATUAL (não com `setPresentation(data.presentation)` direto) —
          // esta é a gravação inicial, sem id, e pode levar um tempo; se o
          // usuário inseriu slides ou editou algo enquanto ela estava em
          // voo, `presentation` (capturado por closure) já está desatualizado
          // e `data.presentation` é só o eco do que foi ENVIADO — substituir
          // o estado inteiro por ele descartaria essas edições concorrentes
          // (bug real, já visto em apresentações recém-geradas por IA/
          // importação editadas nos primeiros segundos). Só o id precisa
          // vir do servidor; o resto do estado atual fica intocado, e o
          // efeito abaixo detecta a diferença e agenda um novo autosave
          // sozinho (agora já com o id certo).
          if (data.presentation.id !== presentation.id) {
            setPresentation((prev) => (prev && !prev.id ? { ...prev, id: data.presentation.id } : prev));
          }
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
    </div>
  );
}
