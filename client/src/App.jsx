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
  const lastSavedJsonRef = useRef(null);

  // Autosave: persiste a apresentação no servidor sempre que ela muda, com debounce
  useEffect(() => {
    if (!presentation) return;

    const json = JSON.stringify(presentation);
    if (json === lastSavedJsonRef.current) return;

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      try {
        const res = await apiFetch('/api/presentations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(presentation)
        });
        const data = await res.json();
        if (data.success) {
          lastSavedJsonRef.current = JSON.stringify(data.presentation);
          // Apresentação nova (sem id ainda): adota o id definitivo gerado pelo servidor
          if (data.presentation.id !== presentation.id) {
            setPresentation(data.presentation);
          }
          setLibraryRefreshKey((k) => k + 1);
        }
      } catch {
        // Falha de rede no autosave: mantém as alterações apenas localmente por ora
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

        <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
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
      />
    </div>
  );
}
