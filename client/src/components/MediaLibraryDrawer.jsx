import React, { useState } from 'react';
import { Image, Video, Music, Upload, Plus, X, Link as LinkIcon, Globe } from 'lucide-react';

const MAX_EMBED_BYTES = 4 * 1024 * 1024; // ~4MB: a apresentação inteira é um único documento no Firestore

// Converte links de compartilhamento comuns (YouTube/Vimeo) para sua forma
// embutível; qualquer outra URL é usada como está (nem todo site permite ser
// enquadrado em iframe — isso depende de cabeçalhos do próprio site, fora do
// nosso controle).
function toEmbedUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.hostname.includes('youtube.com') && url.searchParams.get('v')) {
      return `https://www.youtube.com/embed/${url.searchParams.get('v')}`;
    }
    if (url.hostname === 'youtu.be') {
      return `https://www.youtube.com/embed/${url.pathname.slice(1)}`;
    }
    if (url.hostname.includes('vimeo.com')) {
      const id = url.pathname.split('/').filter(Boolean).pop();
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function MediaLibraryDrawer({ isOpen, onClose, onInsertMedia }) {
  const [tab, setTab] = useState('upload'); // 'upload' | 'link' | 'webpage'
  const [mediaList, setMediaList] = useState([
    { id: '1', name: 'Coracao_Anatomia.png', type: 'image', url: 'https://images.unsplash.com/photo-1530026405186-ed1f139313f8?w=800' },
    { id: '2', name: 'Farmaco_Video.mp4', type: 'video', url: 'https://www.w3schools.com/html/mov_bbb.mp4' },
    { id: '3', name: 'Efeito_Sonoro.mp3', type: 'audio', url: 'https://www.w3schools.com/html/horse.mp3' }
  ]);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkType, setLinkType] = useState('image');
  const [webpageUrl, setWebpageUrl] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setError('');

    if (file.size > MAX_EMBED_BYTES) {
      setError(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB) para embutir diretamente no slide — o limite é ~4MB pois tudo fica salvo em um único documento. Use a aba "Link Externo" com uma URL já hospedada para arquivos maiores.`);
      return;
    }

    let type = 'image';
    if (file.type.startsWith('video/')) type = 'video';
    if (file.type.startsWith('audio/')) type = 'audio';

    // data: URI em vez de blob: — o slide roda num iframe sandboxed com
    // origem opaca, e blob: URLs não atravessam essa fronteira de origem.
    // data: é autocontido e também é literalmente "a mídia embutida no HTML".
    const dataUrl = await readFileAsDataUrl(file);

    const newMedia = { id: Date.now().toString(), name: file.name, type, url: dataUrl };
    setMediaList([newMedia, ...mediaList]);
  };

  const handleAddLink = () => {
    if (!linkUrl.trim()) return;
    setError('');
    const newMedia = { id: Date.now().toString(), name: linkUrl, type: linkType, url: linkUrl };
    setMediaList([newMedia, ...mediaList]);
    setLinkUrl('');
  };

  const handleAddWebpage = () => {
    if (!webpageUrl.trim()) return;
    setError('');
    const newMedia = { id: Date.now().toString(), name: webpageUrl, type: 'webpage', url: toEmbedUrl(webpageUrl) };
    setMediaList([newMedia, ...mediaList]);
    setWebpageUrl('');
  };

  return (
    <div className="glass-panel" style={{ position: 'absolute', top: '64px', right: 0, width: '340px', height: 'calc(100vh - 64px)', zIndex: 100, borderRadius: 0, padding: '1.2rem', display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border-glass-bright)', background: 'rgba(15, 23, 42, 0.95)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Image size={18} /> Biblioteca de Mídias
        </h3>
        <button className="btn-icon" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '1rem', background: 'rgba(255,255,255,0.03)', padding: '0.25rem', borderRadius: '0.5rem' }}>
        {[
          { id: 'upload', label: 'Upload' },
          { id: 'link', label: 'Link Externo' },
          { id: 'webpage', label: 'Embed Página' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setError(''); }}
            style={{
              flex: 1, padding: '0.4rem', fontSize: '0.75rem', fontWeight: 700, borderRadius: '0.4rem', border: 'none', cursor: 'pointer',
              background: tab === t.id ? 'var(--accent-purple)' : 'transparent',
              color: tab === t.id ? '#fff' : '#9ca3af'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'upload' && (
        <>
          <label className="btn-primary" style={{ marginBottom: '0.5rem', justifyContent: 'center', padding: '0.6rem', fontSize: '0.85rem' }}>
            <Upload size={16} /> Fazer Upload de Imagem/Vídeo/Áudio
            <input type="file" accept="image/*,video/*,audio/*" style={{ display: 'none' }} onChange={handleFileUpload} />
          </label>
          <p style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: '0.75rem' }}>
            O arquivo é embutido diretamente no HTML do slide (limite ~4MB).
          </p>
        </>
      )}

      {tab === 'link' && (
        <div style={{ marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <select className="chat-input" value={linkType} onChange={(e) => setLinkType(e.target.value)} style={{ fontSize: '0.82rem' }}>
            <option value="image">Imagem</option>
            <option value="video">Vídeo</option>
            <option value="audio">Áudio</option>
          </select>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <input
              type="url"
              className="chat-input"
              placeholder="https://exemplo.com/arquivo.mp4"
              style={{ fontSize: '0.82rem' }}
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
            />
            <button type="button" className="btn-icon" onClick={handleAddLink} style={{ background: 'rgba(255,255,255,0.1)' }}>
              <LinkIcon size={16} />
            </button>
          </div>
          <p style={{ fontSize: '0.72rem', color: '#6b7280' }}>
            Para arquivos grandes: cole a URL de um arquivo já hospedado (sem limite de tamanho).
          </p>
        </div>
      )}

      {tab === 'webpage' && (
        <div style={{ marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <input
              type="url"
              className="chat-input"
              placeholder="https://youtube.com/watch?v=... ou qualquer URL"
              style={{ fontSize: '0.82rem' }}
              value={webpageUrl}
              onChange={(e) => setWebpageUrl(e.target.value)}
            />
            <button type="button" className="btn-icon" onClick={handleAddWebpage} style={{ background: 'rgba(255,255,255,0.1)' }}>
              <Globe size={16} />
            </button>
          </div>
          <p style={{ fontSize: '0.72rem', color: '#6b7280' }}>
            Links do YouTube/Vimeo são convertidos automaticamente para o formato embutível. Alguns sites bloqueiam ser exibidos dentro de outra página (restrição do próprio site) e não vão aparecer mesmo assim.
          </p>
        </div>
      )}

      {error && (
        <div style={{ fontSize: '0.75rem', color: '#f87171', background: 'rgba(248,113,113,0.1)', padding: '0.6rem', borderRadius: '0.4rem', marginBottom: '0.75rem' }}>
          {error}
        </div>
      )}

      <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.75rem' }}>
        Clique na mídia desejada para inseri-la diretamente no slide atual:
      </p>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {mediaList.map((media) => (
          <div
            key={media.id}
            style={{
              background: 'rgba(255,255,255,0.03)',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer'
            }}
            onClick={() => onInsertMedia(media)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', overflow: 'hidden' }}>
              {media.type === 'image' && <Image size={18} color="#38bdf8" />}
              {media.type === 'video' && <Video size={18} color="#a855f7" />}
              {media.type === 'audio' && <Music size={18} color="#10b981" />}
              {media.type === 'webpage' && <Globe size={18} color="#f59e0b" />}
              <span style={{ fontSize: '0.82rem', color: '#e5e7eb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {media.name}
              </span>
            </div>

            <button className="btn-icon" style={{ width: '26px', height: '26px' }}>
              <Plus size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
