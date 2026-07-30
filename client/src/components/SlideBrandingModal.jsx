import React, { useState, useEffect } from 'react';
import { UserCheck, X, Check, Save, Layers, Trash2, User, Mail, AtSign, GraduationCap, Layout } from 'lucide-react';

const LOCAL_STORAGE_KEY = 'posologia_branding_data';

export default function SlideBrandingModal({ isOpen, onClose, onApplyAll, onApplyCurrent, onRemoveAll }) {
  const [authorName, setAuthorName] = useState('');
  const [email, setEmail] = useState('');
  const [socialMedia, setSocialMedia] = useState('');
  const [courseName, setCourseName] = useState('');
  const [stylePreset, setStylePreset] = useState('pill');
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      try {
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          setAuthorName(parsed.authorName || '');
          setEmail(parsed.email || '');
          setSocialMedia(parsed.socialMedia || '');
          setCourseName(parsed.courseName || '');
          setStylePreset(parsed.stylePreset || 'pill');
        }
      } catch (err) {
        // Ignora erro de parse
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const getBrandingObject = () => ({
    authorName: authorName.trim(),
    email: email.trim(),
    socialMedia: socialMedia.trim(),
    courseName: courseName.trim(),
    stylePreset
  });

  const handleSaveToLocalStorage = () => {
    const data = getBrandingObject();
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
    return data;
  };

  const handleApplyAll = () => {
    const data = handleSaveToLocalStorage();
    onApplyAll(data);
    onClose();
  };

  const handleApplyCurrent = () => {
    const data = handleSaveToLocalStorage();
    onApplyCurrent(data);
    onClose();
  };

  const handleRemoveAll = () => {
    onRemoveAll();
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        style={{ maxWidth: '640px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'linear-gradient(135deg, #a78bfa, #22d3ee)', padding: '0.55rem', borderRadius: '0.6rem' }}>
              <UserCheck size={22} color="#071019" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>Informações Identificadoras</h2>
              <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>
                Cadastre seus dados e aplique o rodapé de identificação em todos os slides da apresentação
              </p>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Formulário de Cadastro */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.2rem' }}>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.35rem' }}>
              <User size={14} color="#67e8f9" /> Nome do Autor / Professor:
            </label>
            <input
              type="text"
              className="chat-input"
              style={{ width: '100%', boxSizing: 'border-box' }}
              placeholder="Ex.: Prof. Sérgio Araújo"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.35rem' }}>
                <Mail size={14} color="#a78bfa" /> E-mail / Contato:
              </label>
              <input
                type="text"
                className="chat-input"
                style={{ width: '100%', boxSizing: 'border-box' }}
                placeholder="Ex.: contato@posologia.com.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.35rem' }}>
                <AtSign size={14} color="#34d399" /> Redes Sociais / Instagram:
              </label>
              <input
                type="text"
                className="chat-input"
                style={{ width: '100%', boxSizing: 'border-box' }}
                placeholder="Ex.: @posologianews"
                value={socialMedia}
                onChange={(e) => setSocialMedia(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.35rem' }}>
              <GraduationCap size={14} color="#fbbf24" /> Nome do Curso / Disciplina / Evento:
            </label>
            <input
              type="text"
              className="chat-input"
              style={{ width: '100%', boxSizing: 'border-box' }}
              placeholder="Ex.: Farmacologia Clínica 2026"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
            />
          </div>

          {/* Seleção do Estilo Visual */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>
              <Layout size={14} color="#67e8f9" /> Estilo do Rodapé:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem' }}>
              <button
                type="button"
                onClick={() => setStylePreset('pill')}
                style={{
                  padding: '0.6rem 0.5rem',
                  borderRadius: '0.5rem',
                  border: stylePreset === 'pill' ? '2px solid #22d3ee' : '1px solid rgba(255,255,255,0.1)',
                  background: stylePreset === 'pill' ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.03)',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textAlign: 'center'
                }}
              >
                Pílula Glass
              </button>
              <button
                type="button"
                onClick={() => setStylePreset('minimal')}
                style={{
                  padding: '0.6rem 0.5rem',
                  borderRadius: '0.5rem',
                  border: stylePreset === 'minimal' ? '2px solid #22d3ee' : '1px solid rgba(255,255,255,0.1)',
                  background: stylePreset === 'minimal' ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.03)',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textAlign: 'center'
                }}
              >
                Texto Minimalista
              </button>
              <button
                type="button"
                onClick={() => setStylePreset('bar')}
                style={{
                  padding: '0.6rem 0.5rem',
                  borderRadius: '0.5rem',
                  border: stylePreset === 'bar' ? '2px solid #22d3ee' : '1px solid rgba(255,255,255,0.1)',
                  background: stylePreset === 'bar' ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.03)',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textAlign: 'center'
                }}
              >
                Barra no Topo
              </button>
            </div>
          </div>
        </div>

        {/* Pré-visualização da Identificação */}
        <div style={{ background: '#0b1220', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '0.6rem', padding: '1rem', marginBottom: '1.2rem', position: 'relative', minHeight: '60px' }}>
          <span style={{ fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', tracking: '0.05em', display: 'block', marginBottom: '0.5rem' }}>
            Prévia da Identificação no Slide:
          </span>
          <div style={{ position: 'relative', height: '40px', background: 'rgba(255,255,255,0.02)', borderRadius: '0.4rem', display: 'flex', alignItems: 'center', padding: '0 0.8rem', justifyContent: 'space-between', fontSize: '0.75rem' }}>
            <span style={{ color: '#e2e8f0' }}>
              {[authorName || 'Seu Nome', email || 'seu.email@exemplo.com', socialMedia || '@suarede'].join(' • ')}
            </span>
            <span style={{ color: '#67e8f9', fontWeight: 700 }}>
              {courseName || 'Nome do Curso'}
            </span>
          </div>
        </div>

        {/* Ações */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.8rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button
            type="button"
            className="btn-icon"
            onClick={handleRemoveAll}
            title="Remover a marca/rodapé de todos os slides"
            style={{ width: 'auto', padding: '0.45rem 0.8rem', fontSize: '0.78rem', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)' }}
          >
            <Trash2 size={14} /> Remover de Todos
          </button>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn-icon"
              onClick={handleSaveToLocalStorage}
              style={{ width: 'auto', padding: '0.45rem 0.8rem', fontSize: '0.78rem', gap: '0.35rem' }}
            >
              {savedSuccess ? <Check size={14} color="#34d399" /> : <Save size={14} />}
              {savedSuccess ? 'Salvo no Perfil!' : 'Salvar Dados'}
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleApplyAll}
              style={{ fontSize: '0.82rem', padding: '0.5rem 1.2rem', gap: '0.4rem' }}
            >
              <Layers size={16} /> Aplicar em TODOS os Slides
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
