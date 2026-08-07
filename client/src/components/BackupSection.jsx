import React, { useState, useRef } from 'react';
import { UploadCloud, FileUp, Loader2, AlertCircle } from 'lucide-react';
import { createBackup, restoreBackup } from '../lib/backupApi';

const STAGE_LABELS = {
  reading_data: 'Lendo suas apresentações...',
  listing_media: 'Listando imagens/vídeos...',
  packaging: 'Empacotando arquivo...',
  reading_manifest: 'Lendo o arquivo de backup...',
  restoring_media: 'Restaurando imagens/vídeos...',
  restoring_data: 'Recriando pastas e apresentações...'
};

function describeProgress(evt) {
  if (!evt) return '';
  const label = STAGE_LABELS[evt.stage] || evt.stage || '';
  if (typeof evt.done === 'number' && typeof evt.total === 'number' && evt.total > 0) {
    return `${label} (${evt.done}/${evt.total})`;
  }
  return label;
}

function formatBytes(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BackupSection({ onRestored }) {
  const [creating, setCreating] = useState(false);
  const [createProgress, setCreateProgress] = useState(null);
  const [createResult, setCreateResult] = useState(null);
  const [createError, setCreateError] = useState('');

  const [restoring, setRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(null);
  const [restoreError, setRestoreError] = useState('');
  const [restoreResult, setRestoreResult] = useState(null);
  const restoreInputRef = useRef(null);

  const handleCreateBackup = async () => {
    setCreating(true);
    setCreateError('');
    setCreateResult(null);
    setCreateProgress(null);
    try {
      const result = await createBackup((evt) => {
        if (evt.type === 'progress') setCreateProgress(evt);
      });
      setCreateResult(result);
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
      setCreateProgress(null);
    }
  };

  const handleRestoreFileChosen = async (e) => {
    const file = e.target.files[0];
    e.target.value = ''; // permite escolher o mesmo arquivo de novo depois, se precisar
    if (!file) return;

    const confirmed = window.confirm(
      `Restaurar "${file.name}"?\n\nIsso vai criar uma cópia nova (pastas e apresentações) a partir deste backup, sem apagar nada do que você já tem.`
    );
    if (!confirmed) return;

    setRestoring(true);
    setRestoreError('');
    setRestoreResult(null);
    setRestoreProgress(null);
    try {
      const result = await restoreBackup(file, (evt) => {
        if (evt.type === 'progress') setRestoreProgress(evt);
      });
      setRestoreResult(result);
      onRestored?.();
    } catch (err) {
      setRestoreError(err.message);
    } finally {
      setRestoring(false);
      setRestoreProgress(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-glass)' }}>
        <UploadCloud size={16} color="#9ca3af" />
        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e5e7eb' }}>Backup</span>
      </div>
      <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: 0 }}>
        Gera um arquivo .zip com todas as suas pastas, apresentações e mídia, pra você baixar e guardar onde quiser
        (Google Drive, um pendrive, outro computador...). Pra restaurar, é só escolher esse arquivo de volta aqui.
      </p>

      <div>
        <button
          type="button"
          className="btn-primary"
          onClick={handleCreateBackup}
          disabled={creating}
          style={{ fontSize: '0.82rem' }}
        >
          {creating ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
          {creating ? (describeProgress(createProgress) || 'Preparando...') : 'Fazer backup agora'}
        </button>

        {createResult && (
          <div style={{ fontSize: '0.8rem', color: '#6ee7b7', marginTop: '0.5rem' }}>
            Backup baixado: {createResult.fileName} ({formatBytes(createResult.size)})
          </div>
        )}
        {createError && (
          <div style={{ fontSize: '0.8rem', color: '#f87171', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <AlertCircle size={14} /> {createError}
          </div>
        )}
      </div>

      <div>
        <input
          ref={restoreInputRef}
          type="file"
          accept=".zip"
          onChange={handleRestoreFileChosen}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          className="btn-secondary"
          onClick={() => restoreInputRef.current?.click()}
          disabled={restoring}
          style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', fontWeight: 600, gap: '0.4rem' }}
        >
          {restoring ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
          {restoring ? (describeProgress(restoreProgress) || 'Restaurando...') : 'Restaurar de um arquivo .zip'}
        </button>

        {restoreResult && (
          <div style={{ fontSize: '0.8rem', color: '#6ee7b7', marginTop: '0.5rem' }}>
            Restaurado: {restoreResult.foldersCreated} pasta(s), {restoreResult.presentationsCreated} apresentação(ões) e {restoreResult.mediaRestored} mídia(s) — confira a biblioteca.
          </div>
        )}
        {restoreError && (
          <div style={{ fontSize: '0.8rem', color: '#f87171', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <AlertCircle size={14} /> {restoreError}
          </div>
        )}
      </div>
    </div>
  );
}
