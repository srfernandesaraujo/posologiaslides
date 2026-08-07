import React, { useState, useEffect, useMemo } from 'react';
import { X, Milestone, Search, Link2Off } from 'lucide-react';
import { apiFetch } from '../lib/api';

// Achata a árvore de pastas/disciplinas (ver GET /api/presentations/tree,
// mesmo formato consumido por HomeLibrary.jsx) numa lista simples de
// { id, title } — o seletor não precisa da hierarquia, só de escolher UMA
// outra apresentação do usuário pra linkar como "próxima aula".
function flattenTree(folders) {
  const flat = [];
  (folders || []).forEach((folder) => {
    (folder.subfolders || []).forEach((sub) => {
      (sub.presentations || []).forEach((p) => flat.push({ id: p.id, title: p.title }));
    });
  });
  return flat;
}

export default function RelatedPresentationPicker({ isOpen, onClose, currentPresentationId, currentRelated, onSelect, onClear }) {
  const [items, setItems] = useState([]);
  const [folderName, setFolderName] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    apiFetch('/api/presentations/tree')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          const folders = data.folders || [];
          let currentFolder = null;

          if (currentPresentationId) {
            for (const folder of folders) {
              const hasCurrent = (folder.subfolders || []).some((sub) =>
                (sub.presentations || []).some((p) => p.id === currentPresentationId)
              );
              if (hasCurrent) {
                currentFolder = folder;
                break;
              }
            }
          }

          if (currentFolder) {
            setFolderName(currentFolder.name);
            const flat = [];
            (currentFolder.subfolders || []).forEach((sub) => {
              (sub.presentations || []).forEach((p) => flat.push({ id: p.id, title: p.title }));
            });
            setItems(flat);
          } else {
            setFolderName('');
            setItems(flattenTree(folders));
          }
        }
      })
      .finally(() => setLoading(false));
  }, [isOpen, currentPresentationId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((p) => p.id !== currentPresentationId)
      .filter((p) => !q || p.title.toLowerCase().includes(q));
  }, [items, search, currentPresentationId]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'linear-gradient(135deg, #34d399, #22d3ee)', padding: '0.5rem', borderRadius: '0.5rem' }}>
              <Milestone size={22} color="#071019" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>Aula Relacionada</h2>
              <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: 0 }}>
                {folderName ? `Aulas da pasta: ${folderName}` : 'Aparece como link no slide de encerramento'}
              </p>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        {currentRelated && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 0.9rem', marginBottom: '1rem', borderRadius: '0.5rem', background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.25)' }}>
            <div style={{ fontSize: '0.82rem', color: '#e5e7eb' }}>
              Vinculada agora: <strong>{currentRelated.title}</strong>
            </div>
            <button className="btn-secondary" style={{ padding: '0.3rem 0.5rem', fontSize: '0.72rem', fontWeight: 600, gap: '0.3rem', color: '#f87171' }} onClick={onClear} title="Remover vínculo">
              <Link2Off size={14} /> Remover
            </button>
          </div>
        )}

        <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
          <Search size={14} color="#6b7280" style={{ position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            className="chat-input"
            placeholder="Buscar apresentação..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', paddingLeft: '2rem', fontSize: '0.85rem' }}
          />
        </div>

        <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {loading && <div style={{ fontSize: '0.8rem', color: '#6b7280', textAlign: 'center', padding: '1rem' }}>Carregando...</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ fontSize: '0.8rem', color: '#6b7280', textAlign: 'center', padding: '1rem' }}>
              {folderName ? `Nenhuma outra apresentação encontrada na pasta "${folderName}".` : 'Nenhuma outra apresentação encontrada.'}
            </div>
          )}
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id, p.title)}
              style={{
                textAlign: 'left', padding: '0.65rem 0.85rem', borderRadius: '0.5rem', cursor: 'pointer',
                background: currentRelated?.id === p.id ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${currentRelated?.id === p.id ? 'var(--accent-primary)' : 'rgba(255,255,255,0.08)'}`,
                color: '#e5e7eb', fontSize: '0.85rem', fontWeight: 600
              }}
            >
              {p.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
