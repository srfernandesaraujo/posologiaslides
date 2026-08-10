import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import SlideThumbnail from './SlideThumbnail';
import { apiFetch } from '../lib/api';
import {
  Presentation, Search, Sparkles, Settings, Star, MoreHorizontal,
  Layers, Clock, FolderOpen, Folder, Trash2, Loader2, LogOut, Menu, X,
  Plus, Check, FolderInput, LayoutGrid, List, FileText, Pencil,
  ArrowUpDown, ChevronUp, ChevronDown
} from 'lucide-react';

// Mesmas cores já usadas em outros pontos do app (quiz, trilha de decisão) —
// nada de paleta nova, só reaproveitar a linguagem visual existente.
const FOLDER_COLORS = ['#38bdf8', '#a855f7', '#10b981', '#f59e0b', '#f472b6', '#ef4444'];

// Limite real do Firestore (1 MiB por documento, ver FIRESTORE_MAX_DOCUMENT_BYTES
// em store.js) — este valor é só o fallback antes da árvore carregar; o
// servidor manda o número de verdade em `sizeLimitBytes` (fonte única).
const DEFAULT_SIZE_LIMIT_BYTES = 1048576;

function formatBytes(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// Verde bem abaixo do limite, amarelo perto (>70%), vermelho muito perto/acima
// (>90%) — mesmo limiar de alerta usado no backend (SIZE_WARNING_THRESHOLD_BYTES).
function sizeColor(bytes, limitBytes) {
  const ratio = bytes / limitBytes;
  if (ratio >= 0.9) return '#f87171';
  if (ratio >= 0.7) return '#fbbf24';
  return '#9ca3af';
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return null;
  const diffSeconds = Math.round((Date.now() - timestamp) / 1000);
  if (diffSeconds < 60) return 'agora mesmo';
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `há ${diffMinutes} min`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `há ${diffHours}h`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `há ${diffDays} dia${diffDays > 1 ? 's' : ''}`;
  const diffMonths = Math.round(diffDays / 30);
  if (diffMonths < 12) return `há ${diffMonths} mês${diffMonths > 1 ? 'es' : ''}`;
  const diffYears = Math.round(diffMonths / 12);
  return `há ${diffYears} ano${diffYears > 1 ? 's' : ''}`;
}

// Linha inline compartilhada por "Nova pasta" e "Renomear pasta" — nome +
// (só na criação) bolinhas de cor + confirmar/cancelar.
function FolderFormRow({ form, setForm, onSubmit, onCancel }) {
  return (
    <form className="library-folder-form" onSubmit={onSubmit}>
      <input
        type="text"
        autoFocus
        placeholder="Nome da disciplina"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
      />
      {form.mode === 'create' && (
        <div className="library-folder-form-colors">
          {FOLDER_COLORS.map((color) => (
            <button
              type="button"
              key={color}
              className={`library-folder-color-dot ${form.color === color ? 'active' : ''}`}
              style={{ background: color }}
              onClick={() => setForm({ ...form, color })}
            />
          ))}
        </div>
      )}
      <div className="library-folder-form-actions">
        <button type="submit" className="btn-icon" title="Salvar" style={{ width: '24px', height: '24px' }}>
          <Check size={14} />
        </button>
        <button type="button" className="btn-icon" onClick={onCancel} title="Cancelar" style={{ width: '24px', height: '24px' }}>
          <X size={14} />
        </button>
      </div>
    </form>
  );
}

// Achata a árvore de pastas em uma lista única de apresentações, mantendo a trilha (breadcrumb)
function flattenTree(folders) {
  const items = [];
  folders.forEach((folder) => {
    folder.subfolders.forEach((sub) => {
      sub.presentations.forEach((p) => {
        items.push({ ...p, folderId: folder.id, folderName: folder.name, folderColor: folder.color, subfolderName: sub.name });
      });
    });
  });
  return items;
}

export default function HomeLibrary({ onOpenPresentation, onCreateNew, onOpenSettings, refreshKey, user, onLogout, active = true }) {
  const [folders, setFolders] = useState([]);
  const [sizeLimitBytes, setSizeLimitBytes] = useState(DEFAULT_SIZE_LIMIT_BYTES);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('todos');
  const [activeFolderId, setActiveFolderId] = useState(null);
  // Em telas compactas (≤1024px) o rail lateral vira uma gaveta off-canvas
  const [isRailOpen, setIsRailOpen] = useState(false);

  const [viewMode, setViewMode] = useState(() => localStorage.getItem('posologia_library_viewmode') || 'grid');
  const [sortBy, setSortBy] = useState(() => localStorage.getItem('posologia_library_sortby') || 'date_desc');
  const [renamingPresentation, setRenamingPresentation] = useState(null);

  const handleToggleViewMode = (mode) => {
    setViewMode(mode);
    localStorage.setItem('posologia_library_viewmode', mode);
  };

  const handleSortChange = (newSort) => {
    setSortBy(newSort);
    localStorage.setItem('posologia_library_sortby', newSort);
  };

  const handleHeaderSortClick = (field) => {
    if (field === 'name') {
      handleSortChange(sortBy === 'name_asc' ? 'name_desc' : 'name_asc');
    } else if (field === 'date') {
      handleSortChange(sortBy === 'date_desc' ? 'date_asc' : 'date_desc');
    }
  };

  const handleRenamePresentationSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!renamingPresentation || !renamingPresentation.title.trim()) return;
    const { id, title } = renamingPresentation;
    setRenamingPresentation(null);
    try {
      await apiFetch(`/api/presentations/${id}/title`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() })
      });
      loadTree();
    } catch {
      alert('Não foi possível renomear a apresentação.');
    }
  };

  // Linha inline de criar/renomear pasta: { mode: 'create'|'rename', id, name, color } ou null
  const [folderForm, setFolderForm] = useState(null);
  // Id da pasta cujo menu "..." (renomear/excluir) está aberto, ou null
  const [folderMenuFor, setFolderMenuFor] = useState(null);
  // Id da apresentação cujo popover "Mover para..." está aberto, ou null
  const [moveMenuFor, setMoveMenuFor] = useState(null);
  // Posição (calculada do botão) + pasta atual da apresentação, pro popover
  // portalado em document.body abaixo (ver comentário no handler)
  const [moveMenuAnchor, setMoveMenuAnchor] = useState(null);

  // A tabela em modo "detalhes" tem overflow-y:hidden no container (evita uma
  // segunda barra de rolagem, ver .library-finder-table) — um popover
  // position:absolute dentro dela fica cortado sempre que a linha está perto
  // da borda inferior (era o caso da última/única linha, sumia sem erro
  // nenhum). Calculando a posição em tela e desenhando via portal em
  // document.body com position:fixed, o popover escapa desse corte.
  const handleToggleMoveMenu = (e, presentationId, currentFolderId) => {
    e.stopPropagation();
    if (moveMenuFor === presentationId) {
      setMoveMenuFor(null);
      setMoveMenuAnchor(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const openUp = window.innerHeight - rect.bottom < 230;
    setMoveMenuAnchor({
      top: rect.bottom + 4,
      bottom: window.innerHeight - rect.top + 4,
      right: window.innerWidth - rect.right,
      openUp,
      folderId: currentFolderId
    });
    setMoveMenuFor(presentationId);
  };

  const loadTree = () => {
    setLoading(true);
    apiFetch('/api/presentations/tree')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setFolders(data.folders);
          if (data.sizeLimitBytes) setSizeLimitBytes(data.sizeLimitBytes);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  // `active` (App.jsx agora mantém HomeLibrary sempre montada, só escondida
  // via CSS quando o editor está aberto — ver comentário lá) evita buscar a
  // árvore do zero enquanto a biblioteca está invisível: sem esta guarda,
  // cada autosave bem-sucedido durante a edição (que incrementa `refreshKey`
  // pra deixar os dados frescos pra PRÓXIMA visita) dispararia uma consulta
  // completa ao Firestore a cada ~1,2s de edição, mesmo sem ninguém olhando
  // pra tela. Volta a buscar assim que `active` fica true de novo.
  useEffect(() => {
    if (!active) return;
    loadTree();
  }, [refreshKey, active]);

  const allPresentations = useMemo(() => flattenTree(folders), [folders]);

  const visiblePresentations = useMemo(() => {
    let list = allPresentations;

    if (activeFolderId) {
      list = list.filter((p) => p.folderId === activeFolderId);
    }

    if (activeTab === 'favoritos') {
      list = list.filter((p) => p.favorite);
    } else if (activeTab === 'recentes') {
      list = list.filter((p) => p.lastOpenedAt);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.title.toLowerCase().includes(q));
    }

    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'name_asc':
          return a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' });
        case 'name_desc':
          return b.title.localeCompare(a.title, 'pt-BR', { sensitivity: 'base' });
        case 'date_asc':
          return (a.updatedAt || 0) - (b.updatedAt || 0);
        case 'date_desc':
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        case 'created_asc':
          return (a.createdAt || 0) - (b.createdAt || 0);
        case 'created_desc':
          return (b.createdAt || 0) - (a.createdAt || 0);
        case 'recentes':
          return (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0);
        default:
          return (b.updatedAt || 0) - (a.updatedAt || 0);
      }
    });
  }, [allPresentations, activeTab, activeFolderId, search, sortBy]);

  const toggleFavorite = async (e, p) => {
    e.stopPropagation();
    const next = !p.favorite;
    setFolders((prev) => prev.map((folder) => ({
      ...folder,
      subfolders: folder.subfolders.map((sub) => ({
        ...sub,
        presentations: sub.presentations.map((pr) => (pr.id === p.id ? { ...pr, favorite: next } : pr))
      }))
    })));
    try {
      await apiFetch(`/api/presentations/${p.id}/favorite`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite: next })
      });
    } catch {
      // Falha silenciosa: próxima sincronização da árvore corrige o estado
    }
  };

  const handleDelete = async (e, p) => {
    e.stopPropagation();
    if (!window.confirm(`Excluir permanentemente "${p.title}"?`)) return;
    try {
      await apiFetch(`/api/presentations/${p.id}`, { method: 'DELETE' });
      loadTree();
    } catch {
      alert('Não foi possível excluir a apresentação.');
    }
  };

  const openCreateFolder = () => {
    setFolderForm({ mode: 'create', id: null, name: '', color: FOLDER_COLORS[0] });
    setFolderMenuFor(null);
  };

  const openRenameFolder = (folder) => {
    setFolderForm({ mode: 'rename', id: folder.id, name: folder.name, color: folder.color });
    setFolderMenuFor(null);
  };

  const handleSubmitFolderForm = async (e) => {
    e.preventDefault();
    if (!folderForm || !folderForm.name.trim()) return;
    try {
      if (folderForm.mode === 'create') {
        await apiFetch('/api/folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: folderForm.name.trim(), color: folderForm.color })
        });
      } else {
        await apiFetch(`/api/folders/${folderForm.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: folderForm.name.trim() })
        });
      }
      setFolderForm(null);
      loadTree();
    } catch {
      alert('Não foi possível salvar a pasta.');
    }
  };

  const handleDeleteFolder = async (folder) => {
    setFolderMenuFor(null);
    if (!window.confirm(`Excluir a pasta "${folder.name}"? As apresentações dentro dela vão para "Minhas Apresentações".`)) return;
    try {
      const res = await apiFetch(`/api/folders/${folder.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || 'Não foi possível excluir a pasta.');
        return;
      }
      if (activeFolderId === folder.id) setActiveFolderId(null);
      loadTree();
    } catch {
      alert('Não foi possível excluir a pasta.');
    }
  };

  const handleMoveToFolder = async (e, presentationId, folderId) => {
    e.stopPropagation();
    setMoveMenuFor(null);
    try {
      await apiFetch(`/api/presentations/${presentationId}/folder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId })
      });
      loadTree();
    } catch {
      alert('Não foi possível mover a apresentação.');
    }
  };

  const tabs = [
    { id: 'todos', label: 'Todos', icon: Layers },
    { id: 'recentes', label: 'Recentes', icon: Clock },
    { id: 'favoritos', label: 'Favoritos', icon: Star }
  ];

  return (
    <div className="library-page">
      {/* Sobreposição que fecha o rail ao tocar fora dele (só existe em telas compactas) */}
      {isRailOpen && (
        <div className="mobile-drawer-backdrop" onClick={() => setIsRailOpen(false)} />
      )}

      {/* Rail lateral */}
      <aside className={`library-rail ${isRailOpen ? 'mobile-open' : ''}`}>
        <div className="library-brand">
          <div className="library-brand-icon">
            <Presentation size={20} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div className="library-brand-title">Posologia Slides</div>
            <div className="library-brand-sub">Workspace local</div>
          </div>
          <button className="btn-icon mobile-toggle-btn" onClick={() => setIsRailOpen(false)} style={{ width: '28px', height: '28px' }}>
            <X size={16} />
          </button>
        </div>

        <button className="library-btn-primary" onClick={onCreateNew}>
          <Sparkles size={16} /> Nova Apresentação
        </button>

        <nav className="library-nav">
          <div className="library-nav-item active">
            <Layers size={16} /> Apresentações
          </div>
        </nav>

        <div className="library-folders">
          <div className="library-folders-title-row">
            <span className="library-folders-title">Disciplinas</span>
            <button className="btn-icon" onClick={openCreateFolder} title="Nova pasta" style={{ width: '22px', height: '22px' }}>
              <Plus size={14} />
            </button>
          </div>

          {folderForm?.mode === 'create' && (
            <FolderFormRow form={folderForm} setForm={setFolderForm} onSubmit={handleSubmitFolderForm} onCancel={() => setFolderForm(null)} />
          )}

          <div
            className={`library-folder-item ${activeFolderId === null ? 'active' : ''}`}
            onClick={() => { setActiveFolderId(null); setIsRailOpen(false); }}
          >
            <FolderOpen size={15} /> Todas as pastas
          </div>
          {folders.map((folder) => (
            folderForm?.mode === 'rename' && folderForm.id === folder.id ? (
              <FolderFormRow key={folder.id} form={folderForm} setForm={setFolderForm} onSubmit={handleSubmitFolderForm} onCancel={() => setFolderForm(null)} />
            ) : (
              <div
                key={folder.id}
                className={`library-folder-item ${activeFolderId === folder.id ? 'active' : ''}`}
                onClick={() => { setActiveFolderId(folder.id); setIsRailOpen(false); }}
              >
                <Folder size={15} color={folder.color} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
                <button
                  className="library-folder-menu-btn"
                  onClick={(e) => { e.stopPropagation(); setFolderMenuFor(folderMenuFor === folder.id ? null : folder.id); }}
                  title="Mais opções"
                >
                  <MoreHorizontal size={14} />
                </button>
                {folderMenuFor === folder.id && (
                  <>
                    <div className="dropdown-backdrop" onClick={(e) => { e.stopPropagation(); setFolderMenuFor(null); }} />
                    <div className="library-folder-menu" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => openRenameFolder(folder)}>Renomear</button>
                      {!folder.isDefault && (
                        <button onClick={() => handleDeleteFolder(folder)} className="danger">Excluir</button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          ))}
        </div>

        <button className="library-nav-item" style={{ marginTop: 'auto' }} onClick={onOpenSettings}>
          <Settings size={16} /> Configurações
        </button>

        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem', borderTop: '1px solid var(--border-glass)' }}>
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name} referrerPolicy="no-referrer" style={{ width: 28, height: 28, borderRadius: '50%' }} />
            ) : (
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700 }}>
                {user.name?.[0]?.toUpperCase() || '?'}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
            </div>
            <button className="btn-icon" onClick={onLogout} title="Sair">
              <LogOut size={15} />
            </button>
          </div>
        )}
      </aside>

      {/* Conteúdo principal */}
      <main className="library-main">
        <div className="library-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button className="btn-icon mobile-toggle-btn" onClick={() => setIsRailOpen(true)} title="Abrir menu" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <Menu size={18} />
            </button>
            <h1 className="library-page-title">Apresentações</h1>
          </div>
          <div className="library-search">
            <Search size={16} />
            <input
              type="text"
              placeholder="Buscar apresentação..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="library-tabs-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
          <div className="library-tabs" style={{ marginBottom: 0 }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`library-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <tab.icon size={14} /> {tab.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(255,255,255,0.04)', padding: '0.25rem 0.6rem', borderRadius: '0.5rem', border: '1px solid var(--border-glass)' }}>
              <ArrowUpDown size={14} color="var(--accent-primary)" />
              <span style={{ fontSize: '0.78rem', color: '#9ca3af', fontWeight: 600 }}>Classificar:</span>
              <select
                value={sortBy}
                onChange={(e) => handleSortChange(e.target.value)}
                style={{
                  background: 'transparent',
                  color: '#e2e8f0',
                  border: 'none',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                <option value="name_asc" style={{ background: '#0f172a' }}>Nome (A - Z)</option>
                <option value="name_desc" style={{ background: '#0f172a' }}>Nome (Z - A)</option>
                <option value="date_desc" style={{ background: '#0f172a' }}>Mais recentes (Modificação)</option>
                <option value="date_asc" style={{ background: '#0f172a' }}>Mais antigos (Modificação)</option>
                <option value="created_desc" style={{ background: '#0f172a' }}>Mais recentes (Inserção)</option>
                <option value="created_asc" style={{ background: '#0f172a' }}>Mais antigos (Inserção)</option>
              </select>
            </div>

            <div className="library-view-switcher" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(255,255,255,0.04)', padding: '0.25rem', borderRadius: '0.5rem', border: '1px solid var(--border-glass)' }}>
              <button
                className={`btn-icon ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => handleToggleViewMode('grid')}
                title="Visualização em Grade / Ícones"
                style={{
                  width: '30px', height: '30px', borderRadius: '0.35rem',
                  background: viewMode === 'grid' ? 'var(--accent-primary)' : 'transparent',
                  color: viewMode === 'grid' ? '#000' : 'var(--text-dim)'
                }}
              >
                <LayoutGrid size={15} />
              </button>
              <button
                className={`btn-icon ${viewMode === 'finder' ? 'active' : ''}`}
                onClick={() => handleToggleViewMode('finder')}
                title="Visualização em Arquivos (Estilo Finder da Apple)"
                style={{
                  width: '30px', height: '30px', borderRadius: '0.35rem',
                  background: viewMode === 'finder' ? 'var(--accent-primary)' : 'transparent',
                  color: viewMode === 'finder' ? '#000' : 'var(--text-dim)'
                }}
              >
                <List size={15} />
              </button>
            </div>
          </div>
        </div>

        {loading && (
          <div className="library-loading">
            <Loader2 className="animate-spin" size={18} /> Carregando...
          </div>
        )}

        {!loading && visiblePresentations.length === 0 && (
          <div className="library-empty">
            {activeTab === 'favoritos'
              ? 'Nenhuma apresentação favoritada ainda.'
              : activeTab === 'recentes'
                ? 'Nenhuma apresentação aberta recentemente.'
                : 'Nenhuma apresentação encontrada.'}
          </div>
        )}

        {!loading && visiblePresentations.length > 0 && (
          viewMode === 'finder' ? (
            <div className="library-finder-table">
              <div className="finder-table-header">
                <div
                  className="finder-col col-name"
                  onClick={() => handleHeaderSortClick('name')}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', userSelect: 'none' }}
                  title="Ordenar por Nome"
                >
                  <span>Nome do Arquivo</span>
                  {sortBy === 'name_asc' && <ChevronUp size={14} color="var(--accent-primary)" />}
                  {sortBy === 'name_desc' && <ChevronDown size={14} color="var(--accent-primary)" />}
                  {sortBy !== 'name_asc' && sortBy !== 'name_desc' && <ArrowUpDown size={12} style={{ opacity: 0.35 }} />}
                </div>
                <div className="finder-col col-folder">Disciplina / Pasta</div>
                <div
                  className="finder-col col-date"
                  onClick={() => handleHeaderSortClick('date')}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', userSelect: 'none' }}
                  title="Ordenar por Data de Modificação"
                >
                  <span>Última Modificação</span>
                  {sortBy === 'date_asc' && <ChevronUp size={14} color="var(--accent-primary)" />}
                  {sortBy === 'date_desc' && <ChevronDown size={14} color="var(--accent-primary)" />}
                  {sortBy !== 'date_asc' && sortBy !== 'date_desc' && <ArrowUpDown size={12} style={{ opacity: 0.35 }} />}
                </div>
                <div className="finder-col col-size">Tamanho</div>
                <div className="finder-col col-actions" style={{ textAlign: 'right' }}>Ações</div>
              </div>
              <div className="finder-table-body">
                {visiblePresentations.map((p) => (
                  <div key={p.id} className="finder-file-row" onClick={() => onOpenPresentation(p.id)}>
                    <div className="finder-col col-name" style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <div className="finder-file-icon">
                        <FileText size={18} color={p.folderColor || '#38bdf8'} />
                      </div>
                      {renamingPresentation?.id === p.id ? (
                        <form onSubmit={handleRenamePresentationSubmit} onClick={(e) => e.stopPropagation()} style={{ flex: 1 }}>
                          <input
                            type="text"
                            autoFocus
                            className="chat-input"
                            value={renamingPresentation.title}
                            onChange={(e) => setRenamingPresentation({ ...renamingPresentation, title: e.target.value })}
                            onBlur={handleRenamePresentationSubmit}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') setRenamingPresentation(null);
                            }}
                            style={{ fontSize: '0.85rem', padding: '0.2rem 0.4rem', width: '100%' }}
                          />
                        </form>
                      ) : (
                        <span className="finder-file-title">{p.title}</span>
                      )}
                    </div>
                    <div className="finder-col col-folder">
                      <span className="finder-folder-badge" style={{ borderColor: `${p.folderColor || '#38bdf8'}44`, background: `${p.folderColor || '#38bdf8'}15`, color: p.folderColor || '#38bdf8' }}>
                        <Folder size={12} color={p.folderColor || '#38bdf8'} style={{ marginRight: '0.35rem', verticalAlign: '-1px' }} />
                        {p.folderName}
                      </span>
                    </div>
                    <div className="finder-col col-date">
                      {formatRelativeTime(p.updatedAt) ? `Editado ${formatRelativeTime(p.updatedAt)}` : 'Recente'}
                    </div>
                    <div className="finder-col col-size" style={{ color: sizeColor(p.sizeBytes, sizeLimitBytes), fontWeight: 700 }} title={`${((p.sizeBytes / sizeLimitBytes) * 100).toFixed(0)}% do limite de ${formatBytes(sizeLimitBytes)} do Firestore`}>
                      {formatBytes(p.sizeBytes)}
                    </div>
                    <div className="finder-col col-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        className={`btn-icon ${p.favorite ? 'active' : ''}`}
                        onClick={(e) => toggleFavorite(e, p)}
                        title={p.favorite ? 'Remover dos favoritos' : 'Favoritar'}
                        style={{ width: '28px', height: '28px' }}
                      >
                        <Star size={13} fill={p.favorite ? '#fbbf24' : 'none'} color={p.favorite ? '#fbbf24' : 'currentColor'} />
                      </button>
                      <button
                        className="btn-icon"
                        onClick={(e) => { e.stopPropagation(); setRenamingPresentation({ id: p.id, title: p.title }); }}
                        title="Renomear"
                        style={{ width: '28px', height: '28px' }}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        className="btn-icon"
                        onClick={(e) => handleToggleMoveMenu(e, p.id, p.folderId)}
                        title="Mover para pasta"
                        style={{ width: '28px', height: '28px' }}
                      >
                        <FolderInput size={13} />
                      </button>
                      <button
                        className="btn-icon danger"
                        onClick={(e) => handleDelete(e, p)}
                        title="Excluir"
                        style={{ width: '28px', height: '28px' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="library-grid">
              {visiblePresentations.map((p) => (
                <div key={p.id} className="library-card" onClick={() => onOpenPresentation(p.id)}>
                  <SlideThumbnail html={p.firstSlideHtml} />

                  <button
                    className={`library-card-star ${p.favorite ? 'active' : ''}`}
                    onClick={(e) => toggleFavorite(e, p)}
                    title={p.favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                  >
                    <Star size={14} fill={p.favorite ? 'currentColor' : 'none'} />
                  </button>

                  <div className="library-card-body">
                    {renamingPresentation?.id === p.id ? (
                      <form onSubmit={handleRenamePresentationSubmit} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          autoFocus
                          className="chat-input"
                          value={renamingPresentation.title}
                          onChange={(e) => setRenamingPresentation({ ...renamingPresentation, title: e.target.value })}
                          onBlur={handleRenamePresentationSubmit}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setRenamingPresentation(null);
                          }}
                          style={{ fontSize: '0.9rem', fontWeight: 600, padding: '0.2rem 0.4rem', width: '100%', marginBottom: '0.3rem' }}
                        />
                      </form>
                    ) : (
                      <div className="library-card-title">{p.title}</div>
                    )}
                    <div className="library-card-meta" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.4rem' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.folderName}</span>
                      <span
                        style={{ color: sizeColor(p.sizeBytes, sizeLimitBytes), fontWeight: 700, flexShrink: 0 }}
                        title={`${((p.sizeBytes / sizeLimitBytes) * 100).toFixed(0)}% do limite de ${formatBytes(sizeLimitBytes)} do Firestore`}
                      >
                        {formatBytes(p.sizeBytes)}
                      </span>
                    </div>
                    <div className="library-card-footer">
                      <span>{formatRelativeTime(p.updatedAt) ? `Editado ${formatRelativeTime(p.updatedAt)}` : ''}</span>
                      <div style={{ display: 'flex', gap: '0.2rem' }}>
                        <button
                          className="library-card-delete"
                          onClick={(e) => { e.stopPropagation(); setRenamingPresentation({ id: p.id, title: p.title }); }}
                          title="Renomear"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          className="library-card-delete"
                          onClick={(e) => handleToggleMoveMenu(e, p.id, p.folderId)}
                          title="Mover para pasta"
                        >
                          <FolderInput size={13} />
                        </button>
                        <button className="library-card-delete" onClick={(e) => handleDelete(e, p)} title="Excluir">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </main>

      {moveMenuFor && moveMenuAnchor && createPortal(
        <>
          <div className="dropdown-backdrop" onClick={() => { setMoveMenuFor(null); setMoveMenuAnchor(null); }} />
          <div
            className="library-folder-menu"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: moveMenuAnchor.openUp ? 'auto' : `${moveMenuAnchor.top}px`,
              bottom: moveMenuAnchor.openUp ? `${moveMenuAnchor.bottom}px` : 'auto',
              right: `${moveMenuAnchor.right}px`
            }}
          >
            {folders.filter((f) => f.id !== moveMenuAnchor.folderId).map((f) => (
              <button key={f.id} onClick={(e) => handleMoveToFolder(e, moveMenuFor, f.id)}>
                <Folder size={12} color={f.color} style={{ marginRight: '0.4rem', verticalAlign: '-2px' }} />
                {f.name}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
