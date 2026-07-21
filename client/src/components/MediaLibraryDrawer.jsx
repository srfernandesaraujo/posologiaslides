import React, { useState } from 'react';
import { Image, Video, Music, Upload, Plus, X } from 'lucide-react';

export default function MediaLibraryDrawer({ isOpen, onClose, onInsertMedia }) {
  const [mediaList, setMediaList] = useState([
    { id: '1', name: 'Coracao_Anatomia.png', type: 'image', url: 'https://images.unsplash.com/photo-1530026405186-ed1f139313f8?w=800' },
    { id: '2', name: 'Farmaco_Video.mp4', type: 'video', url: 'https://www.w3schools.com/html/mov_bbb.mp4' },
    { id: '3', name: 'Efeito_Sonoro.mp3', type: 'audio', url: 'https://www.w3schools.com/html/horse.mp3' }
  ]);

  if (!isOpen) return null;

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    let type = 'image';
    if (file.type.startsWith('video/')) type = 'video';
    if (file.type.startsWith('audio/')) type = 'audio';

    const newMedia = {
      id: Date.now().toString(),
      name: file.name,
      type,
      url
    };

    setMediaList([newMedia, ...mediaList]);
  };

  return (
    <div className="glass-panel" style={{ position: 'absolute', top: '64px', right: 0, width: '320px', height: 'calc(100vh - 64px)', zIndex: 100, borderRadius: 0, padding: '1.2rem', display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border-glass-bright)', background: 'rgba(15, 23, 42, 0.95)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Image size={18} /> Biblioteca de Mídias
        </h3>
        <button className="btn-icon" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <label className="btn-primary" style={{ marginBottom: '1rem', justifyContent: 'center', padding: '0.6rem', fontSize: '0.85rem' }}>
        <Upload size={16} /> Fazer Upload de Imagem/Vídeo/Áudio
        <input type="file" accept="image/*,video/*,audio/*" style={{ display: 'none' }} onChange={handleFileUpload} />
      </label>

      <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '1rem' }}>
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
