import React, { useState } from 'react';
import { Image, Video, Music, Upload, Plus, X, Link as LinkIcon, Globe, Loader2, Search } from 'lucide-react';
import { apiFetch } from '../lib/api';

// Converte links de compartilhamento comuns para sua forma embutível; qualquer
// outra URL é usada como está (nem todo site permite ser enquadrado em iframe
// — isso depende de cabeçalhos do próprio site, fora do nosso controle).
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
    if (url.hostname.includes('loom.com')) {
      const id = url.pathname.split('/').filter(Boolean).pop();
      if (id) return `https://www.loom.com/embed/${id}`;
    }
    if (url.hostname.includes('wistia.com') && url.pathname.includes('/medias/')) {
      const id = url.pathname.split('/').filter(Boolean).pop();
      if (id) return `https://fast.wistia.net/embed/iframe/${id}`;
    }
    if (url.hostname.includes('tiktok.com')) {
      const match = url.pathname.match(/\/video\/(\d+)/);
      if (match) return `https://www.tiktok.com/embed/v2/${match[1]}`;
    }
    if (url.hostname.includes('open.spotify.com') && !url.pathname.startsWith('/embed/')) {
      return `https://open.spotify.com${url.pathname.replace(/^/, '/embed')}`;
    }
    // Google Forms só renderiza corretamente dentro de iframe com esse parâmetro.
    if (url.hostname === 'docs.google.com' && url.pathname.includes('/forms/') && !url.searchParams.get('embedded')) {
      url.searchParams.set('embedded', 'true');
      return url.toString();
    }

    return rawUrl;
  } catch {
    return rawUrl;
  }
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
  const [uploading, setUploading] = useState(false);

  // Busca de fotos de estoque (Unsplash/Pexels) e GIFs (GIPHY) — Fase 4,
  // depende de chaves de API configuradas em Configurações.
  const [photoQuery, setPhotoQuery] = useState('');
  const [photoSource, setPhotoSource] = useState('unsplash');
  const [photoResults, setPhotoResults] = useState([]);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState('');

  const [gifQuery, setGifQuery] = useState('');
  const [gifResults, setGifResults] = useState([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifError, setGifError] = useState('');

  if (!isOpen) return null;

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setUploading(true);

    try {
      // Envia pro Cloud Storage e guarda só a URL — o slide referencia essa
      // URL em vez de embutir o arquivo como data: URI dentro do documento
      // da apresentação, que é salvo inteiro como um único documento no
      // Firestore (limite rígido de 1 MiB).
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiFetch('/api/materials/upload-media', { method: 'POST', body: formData });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Falha ao enviar arquivo.');

      const newMedia = { id: Date.now().toString(), name: data.name, type: data.type, url: data.url };
      setMediaList([newMedia, ...mediaList]);
    } catch (err) {
      setError(err.message || 'Falha ao enviar arquivo.');
    } finally {
      setUploading(false);
    }
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

  const handleSearchPhotos = async (e) => {
    e.preventDefault();
    if (!photoQuery.trim() || photoLoading) return;
    setPhotoLoading(true);
    setPhotoError('');
    setPhotoResults([]);

    try {
      const res = await apiFetch(`/api/media-search/photos?query=${encodeURIComponent(photoQuery)}&source=${photoSource}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Falha ao buscar fotos.');
      setPhotoResults(data.results);
    } catch (err) {
      setPhotoError(err.message || 'Falha ao buscar fotos.');
    } finally {
      setPhotoLoading(false);
    }
  };

  const handleInsertPhoto = (photo) => {
    // Exigência do Unsplash: registrar o "download" só quando a foto é
    // efetivamente usada — dispara em segundo plano, sem bloquear a inserção.
    if (photoSource === 'unsplash' && photo.downloadLocation) {
      apiFetch('/api/media-search/photos/unsplash-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ downloadLocation: photo.downloadLocation })
      }).catch(() => {});
    }
    onInsertMedia({
      type: 'image-credited',
      url: photo.fullUrl,
      name: photo.alt,
      credit: photo.credit,
      source: photoSource === 'unsplash' ? 'Unsplash' : 'Pexels'
    });
  };

  const handleSearchGifs = async (e) => {
    e.preventDefault();
    if (!gifQuery.trim() || gifLoading) return;
    setGifLoading(true);
    setGifError('');
    setGifResults([]);

    try {
      const res = await apiFetch(`/api/media-search/gifs?query=${encodeURIComponent(gifQuery)}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Falha ao buscar GIFs.');
      setGifResults(data.results);
    } catch (err) {
      setGifError(err.message || 'Falha ao buscar GIFs.');
    } finally {
      setGifLoading(false);
    }
  };

  const handleInsertGif = (gif) => {
    onInsertMedia({ type: 'image-credited', url: gif.fullUrl, name: gif.alt, credit: gif.credit, source: 'GIPHY' });
  };

  return (
    <div className="glass-panel" style={{ position: 'absolute', top: '64px', right: 0, width: '360px', height: 'calc(100vh - 64px)', zIndex: 100, borderRadius: 0, padding: '1.2rem', display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border-glass-bright)', background: 'rgba(15, 23, 42, 0.95)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Image size={18} /> Biblioteca de Mídias
        </h3>
        <button className="btn-icon" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '1rem', background: 'rgba(255,255,255,0.03)', padding: '0.25rem', borderRadius: '0.5rem', flexWrap: 'wrap' }}>
        {[
          { id: 'upload', label: 'Upload' },
          { id: 'link', label: 'Link' },
          { id: 'webpage', label: 'Embed' },
          { id: 'search-photos', label: 'Fotos' },
          { id: 'gifs', label: 'GIFs' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setError(''); }}
            style={{
              flex: '1 1 30%', padding: '0.4rem', fontSize: '0.72rem', fontWeight: 700, borderRadius: '0.4rem', border: 'none', cursor: 'pointer',
              background: tab === t.id ? 'var(--accent-primary)' : 'transparent',
              color: tab === t.id ? '#071019' : '#9ca3af'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'upload' && (
        <>
          <label className="btn-primary" style={{ marginBottom: '0.5rem', justifyContent: 'center', padding: '0.6rem', fontSize: '0.85rem', opacity: uploading ? 0.7 : 1, pointerEvents: uploading ? 'none' : 'auto' }}>
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {uploading ? 'Enviando...' : 'Fazer Upload de Imagem/Vídeo/Áudio'}
            <input type="file" accept="image/*,video/*,audio/*" style={{ display: 'none' }} onChange={handleFileUpload} disabled={uploading} />
          </label>
          <p style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: '0.75rem' }}>
            O arquivo é enviado para o armazenamento na nuvem e referenciado por URL no slide (limite ~50MB).
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
            Use aqui a URL <strong>direta do arquivo</strong> (termina em .jpg, .png, .mp4, .mp3 etc. — como a de um arquivo já hospedado). Para o link de uma página comum (ex. YouTube, ou qualquer site), use a aba "Embed Página" ao lado.
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
            Links do YouTube, Vimeo, Loom, Wistia, TikTok, Spotify e Google Forms são convertidos automaticamente para o formato embutível. Typeform, Jotform, Tally Form e Calendly já funcionam colando o link direto. Se depois de inserir a área ficar em branco, é porque aquele site específico bloqueia ser exibido dentro de outra página (restrição do próprio site, ex. X-Frame-Options) — não tem como contornar isso, é preciso usar outro link/fonte.
          </p>
        </div>
      )}

      {tab === 'search-photos' && (
        <div style={{ marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.3rem', background: 'rgba(255,255,255,0.03)', padding: '0.2rem', borderRadius: '0.4rem' }}>
            {[{ id: 'unsplash', label: 'Unsplash' }, { id: 'pexels', label: 'Pexels' }].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setPhotoSource(s.id)}
                style={{
                  flex: 1, padding: '0.3rem', fontSize: '0.72rem', fontWeight: 700, borderRadius: '0.3rem', border: 'none', cursor: 'pointer',
                  background: photoSource === s.id ? 'rgba(56,189,248,0.2)' : 'transparent',
                  color: photoSource === s.id ? '#38bdf8' : '#9ca3af'
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <form onSubmit={handleSearchPhotos} style={{ display: 'flex', gap: '0.4rem' }}>
            <input
              type="text"
              className="chat-input"
              placeholder="Buscar fotos... (ex: coração, laboratório)"
              style={{ fontSize: '0.82rem' }}
              value={photoQuery}
              onChange={(e) => setPhotoQuery(e.target.value)}
            />
            <button type="submit" className="btn-icon" disabled={photoLoading} style={{ background: 'rgba(255,255,255,0.1)' }}>
              {photoLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            </button>
          </form>
          {photoError && (
            <p style={{ fontSize: '0.72rem', color: '#f87171', background: 'rgba(248,113,113,0.1)', padding: '0.5rem 0.6rem', borderRadius: '0.4rem' }}>{photoError}</p>
          )}
          {!photoError && (
            <p style={{ fontSize: '0.72rem', color: '#6b7280' }}>
              Requer chave de API do {photoSource === 'unsplash' ? 'Unsplash' : 'Pexels'} salva em Configurações (gratuita).
            </p>
          )}
        </div>
      )}

      {tab === 'gifs' && (
        <div style={{ marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <form onSubmit={handleSearchGifs} style={{ display: 'flex', gap: '0.4rem' }}>
            <input
              type="text"
              className="chat-input"
              placeholder="Buscar GIFs... (ex: parabéns, aplausos)"
              style={{ fontSize: '0.82rem' }}
              value={gifQuery}
              onChange={(e) => setGifQuery(e.target.value)}
            />
            <button type="submit" className="btn-icon" disabled={gifLoading} style={{ background: 'rgba(255,255,255,0.1)' }}>
              {gifLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            </button>
          </form>
          {gifError && (
            <p style={{ fontSize: '0.72rem', color: '#f87171', background: 'rgba(248,113,113,0.1)', padding: '0.5rem 0.6rem', borderRadius: '0.4rem' }}>{gifError}</p>
          )}
          {!gifError && (
            <p style={{ fontSize: '0.72rem', color: '#6b7280' }}>Requer chave de API do GIPHY salva em Configurações (gratuita).</p>
          )}
        </div>
      )}

      {error && (
        <div style={{ fontSize: '0.75rem', color: '#f87171', background: 'rgba(248,113,113,0.1)', padding: '0.6rem', borderRadius: '0.4rem', marginBottom: '0.75rem' }}>
          {error}
        </div>
      )}

      {(tab === 'search-photos' || tab === 'gifs') ? (
        <>
          <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.75rem' }}>
            Clique numa imagem pra inseri-la no slide atual:
          </p>
          <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', alignContent: 'start' }}>
            {(tab === 'search-photos' ? photoResults : gifResults).map((item) => (
              <button
                key={item.id}
                onClick={() => (tab === 'search-photos' ? handleInsertPhoto(item) : handleInsertGif(item))}
                title={item.credit?.name ? `Foto de ${item.credit.name}` : item.alt}
                style={{
                  padding: 0, border: '1px solid rgba(255,255,255,0.08)', borderRadius: '0.5rem', overflow: 'hidden',
                  cursor: 'pointer', background: 'rgba(255,255,255,0.03)', aspectRatio: '1', flexShrink: 0
                }}
              >
                <img src={item.thumbUrl} alt={item.alt} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
              </button>
            ))}
          </div>
        </>
      ) : (
      <>
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
              cursor: 'pointer',
              flexShrink: 0
            }}
            onClick={() => onInsertMedia(media)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', overflow: 'hidden' }}>
              {media.type === 'image' && <Image size={18} color="#38bdf8" />}
              {media.type === 'video' && <Video size={18} color="var(--accent-primary)" />}
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
      </>
      )}
    </div>
  );
}
