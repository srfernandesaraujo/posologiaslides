import React, { useState, useEffect, useMemo } from 'react';
import SlideThumbnail from './SlideThumbnail';
import { apiFetch } from '../lib/api';
import {
  Presentation, Search, Sparkles, Settings, Star, MoreHorizontal,
  Layers, Clock, FolderOpen, Folder, Trash2, Loader2, LogOut, Menu, X
} from 'lucide-react';

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

export default function HomeLibrary({ onOpenPresentation, onCreateNew, onOpenSettings, refreshKey, user, onLogout }) {
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('todos');
  const [activeFolderId, setActiveFolderId] = useState(null);
  // Em telas compactas (≤1024px) o rail lateral vira uma gaveta off-canvas
  const [isRailOpen, setIsRailOpen] = useState(false);

  const loadTree = () => {
    setLoading(true);
    apiFetch('/api/presentations/tree')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setFolders(data.folders);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTree();
  }, [refreshKey]);

  const allPresentations = useMemo(() => flattenTree(folders), [folders]);

  const visiblePresentations = useMemo(() => {
    let list = allPresentations;

    if (activeFolderId) {
      list = list.filter((p) => p.folderId === activeFolderId);
    }

    if (activeTab === 'favoritos') {
      list = list.filter((p) => p.favorite);
    } else if (activeTab === 'recentes') {
      list = list.filter((p) => p.lastOpenedAt).sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
    } else {
      list = [...list].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.title.toLowerCase().includes(q));
    }

    return list;
  }, [allPresentations, activeTab, activeFolderId, search]);

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
          <div className="library-folders-title">Disciplinas</div>
          <div
            className={`library-folder-item ${activeFolderId === null ? 'active' : ''}`}
            onClick={() => { setActiveFolderId(null); setIsRailOpen(false); }}
          >
            <FolderOpen size={15} /> Todas as pastas
          </div>
          {folders.map((folder) => (
            <div
              key={folder.id}
              className={`library-folder-item ${activeFolderId === folder.id ? 'active' : ''}`}
              onClick={() => { setActiveFolderId(folder.id); setIsRailOpen(false); }}
            >
              <Folder size={15} color={folder.color} /> {folder.name}
            </div>
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

        <div className="library-tabs">
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
                <div className="library-card-title">{p.title}</div>
                <div className="library-card-meta">
                  {p.folderName} · {p.subfolderName}
                </div>
                <div className="library-card-footer">
                  <span>{formatRelativeTime(p.updatedAt) ? `Editado ${formatRelativeTime(p.updatedAt)}` : ''}</span>
                  <button className="library-card-delete" onClick={(e) => handleDelete(e, p)} title="Excluir">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
