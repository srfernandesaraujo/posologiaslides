import React, { useState, useEffect, useMemo, useRef } from 'react';
import SlideThumbnail from './SlideThumbnail';
import { apiFetch } from '../lib/api';
import {
  Presentation, Search, Sparkles, Settings, Star, MoreHorizontal,
  Layers, Clock, FolderOpen, Folder, Trash2, Loader2, LogOut,
  Wand2, Users, Tv, PenTool, BarChart3, Image as ImageIcon
} from 'lucide-react';

// Features reais do sistema, exibidas na vitrine da Home
const FEATURES = [
  { icon: Wand2, title: 'Geração com IA', desc: 'Crie um deck completo a partir de um tema, PDF, link ou imagens em poucos segundos.' },
  { icon: Users, title: 'Interatividade ao vivo', desc: 'Alunos entram pelo celular com um PIN e respondem quiz ou nuvem de palavras em tempo real.' },
  { icon: Tv, title: 'Modo Apresentador', desc: 'Notas do orador e um copiloto de IA sugerindo perguntas para engajar a plateia.' },
  { icon: PenTool, title: 'Anotação ao vivo', desc: 'Desenhe, destaque e use o apontador laser direto sobre o slide durante a aula.' },
  { icon: BarChart3, title: 'Relatórios de engajamento', desc: 'Métricas reais da sessão: duração, participantes e respostas da turma.' },
  { icon: ImageIcon, title: 'Mídia embutida', desc: 'Imagens, vídeos e páginas incorporadas direto nos slides gerados.' }
];

// Conta de 0 até `value` com easing, reanimando sempre que o valor mudar (ex.: nova apresentação criada)
function AnimatedNumber({ value }) {
  const [display, setDisplay] = useState(0);
  const startValueRef = useRef(0);

  useEffect(() => {
    const start = startValueRef.current;
    const end = value || 0;
    const startTime = performance.now();
    const duration = 900;
    let frameId;

    const tick = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + (end - start) * eased));
      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      } else {
        startValueRef.current = end;
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [value]);

  return display.toLocaleString('pt-BR');
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

  const totalSlides = useMemo(
    () => allPresentations.reduce((sum, p) => sum + (p.slideCount || 0), 0),
    [allPresentations]
  );
  const totalFavorites = useMemo(
    () => allPresentations.filter((p) => p.favorite).length,
    [allPresentations]
  );
  const recentPresentations = useMemo(
    () => [...allPresentations].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 5),
    [allPresentations]
  );

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
      {/* Rail lateral */}
      <aside className="library-rail">
        <div className="library-brand">
          <div className="library-brand-icon">
            <Presentation size={20} color="#fff" />
          </div>
          <div>
            <div className="library-brand-title">Posologia Slides</div>
            <div className="library-brand-sub">Workspace local</div>
          </div>
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
            onClick={() => setActiveFolderId(null)}
          >
            <FolderOpen size={15} /> Todas as pastas
          </div>
          {folders.map((folder) => (
            <div
              key={folder.id}
              className={`library-folder-item ${activeFolderId === folder.id ? 'active' : ''}`}
              onClick={() => setActiveFolderId(folder.id)}
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
        <section className="library-hero animate-in">
          <div className="ambient-glow" />
          <div className="library-hero-content">
            <h2 className="library-hero-title">
              {user?.name ? `Olá, ${user.name.split(' ')[0]}!` : 'Bem-vindo(a)!'}
            </h2>
            <p className="library-hero-sub">
              Crie apresentações interativas com IA e engaje sua turma em tempo real — do primeiro slide ao relatório da aula.
            </p>

            <div className="stat-grid">
              <div className="glass-panel-interactive stat-tile highlight">
                <div className="stat-tile-icon"><Layers size={17} /></div>
                <div className="stat-value"><AnimatedNumber value={allPresentations.length} /></div>
                <div className="stat-label">Apresentações</div>
              </div>
              <div className="glass-panel-interactive stat-tile">
                <div className="stat-tile-icon"><Presentation size={17} /></div>
                <div className="stat-value"><AnimatedNumber value={totalSlides} /></div>
                <div className="stat-label">Slides criados</div>
              </div>
              <div className="glass-panel-interactive stat-tile">
                <div className="stat-tile-icon"><FolderOpen size={17} /></div>
                <div className="stat-value"><AnimatedNumber value={folders.length} /></div>
                <div className="stat-label">Disciplinas</div>
              </div>
              <div className="glass-panel-interactive stat-tile">
                <div className="stat-tile-icon"><Star size={17} /></div>
                <div className="stat-value"><AnimatedNumber value={totalFavorites} /></div>
                <div className="stat-label">Favoritas</div>
              </div>
            </div>
          </div>
        </section>

        {recentPresentations.length > 0 && (
          <section className="showcase-section animate-in" style={{ animationDelay: '0.1s' }}>
            <div className="showcase-title"><Clock size={15} /> Continue de onde parou</div>
            <div className="showcase-strip">
              {recentPresentations.map((p) => (
                <div key={p.id} className="glass-panel-interactive showcase-card" onClick={() => onOpenPresentation(p.id)}>
                  <div className="showcase-card-thumb">
                    <SlideThumbnail html={p.firstSlideHtml} />
                  </div>
                  <div className="showcase-card-title">{p.title}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="showcase-section animate-in" style={{ animationDelay: '0.15s' }}>
          <div className="showcase-title"><Sparkles size={15} /> O que você pode fazer</div>
          <div className="feature-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="glass-panel-interactive feature-card">
                <div className="feature-card-icon"><f.icon size={18} /></div>
                <div className="feature-card-title">{f.title}</div>
                <div className="feature-card-desc">{f.desc}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="library-topbar">
          <h1 className="library-page-title">Apresentações</h1>
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
