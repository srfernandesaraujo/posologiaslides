import React, { useState } from 'react';
import { UploadCloud, DownloadCloud, Loader2, ExternalLink, RotateCcw, AlertCircle } from 'lucide-react';
import { listBackups, createBackup, restoreBackup } from '../lib/backupApi';

const STAGE_LABELS = {
  reading_data: 'Lendo suas apresentações...',
  listing_media: 'Listando imagens/vídeos...',
  packaging: 'Empacotando arquivo...',
  uploading: 'Enviando pro Google Drive...',
  downloading: 'Baixando backup do Drive...',
  reading_manifest: 'Lendo o backup...',
  restoring_media: 'Restaurando imagens/vídeos...',
  restoring_data: 'Recriando pastas e apresentações...'
};

function describeProgress(evt) {
  if (!evt) return '';
  const label = STAGE_LABELS[evt.stage] || evt.stage || '';
  if (typeof evt.done === 'number' && typeof evt.total === 'number' && evt.total > 0) {
    return `${label} (${evt.done}/${evt.total})`;
  }
  if (typeof evt.bytesUploaded === 'number' && typeof evt.totalBytes === 'number' && evt.totalBytes > 0) {
    const pct = Math.min(100, Math.round((evt.bytesUploaded / evt.totalBytes) * 100));
    return `${label} ${pct}%`;
  }
  return label;
}

function formatBytes(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function BackupSection({ onRestored }) {
  const [creating, setCreating] = useState(false);
  const [createProgress, setCreateProgress] = useState(null);
  const [createResult, setCreateResult] = useState(null);
  const [createError, setCreateError] = useState('');

  const [backups, setBackups] = useState(null); // null = ainda não carregado
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [listError, setListError] = useState('');

  const [restoringId, setRestoringId] = useState(null);
  const [restoreProgress, setRestoreProgress] = useState(null);
  const [restoreError, setRestoreError] = useState('');
  const [restoreResult, setRestoreResult] = useState(null);

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
      setBackups(null); // força recarregar a lista na próxima vez que abrir
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
      setCreateProgress(null);
    }
  };

  const handleLoadBackups = async () => {
    setLoadingBackups(true);
    setListError('');
    try {
      const { backups: list } = await listBackups();
      setBackups(list);
    } catch (err) {
      setListError(err.message);
    } finally {
      setLoadingBackups(false);
    }
  };

  const handleRestore = async (backup) => {
    const confirmed = window.confirm(
      `Restaurar "${backup.name}"?\n\nIsso vai criar uma cópia nova (pastas e apresentações) a partir deste backup, sem apagar nada do que você já tem.`
    );
    if (!confirmed) return;

    setRestoringId(backup.id);
    setRestoreError('');
    setRestoreResult(null);
    setRestoreProgress(null);
    try {
      const result = await restoreBackup(backup.id, (evt) => {
        if (evt.type === 'progress') setRestoreProgress(evt);
      });
      setRestoreResult(result);
      onRestored?.();
    } catch (err) {
      setRestoreError(err.message);
    } finally {
      setRestoringId(null);
      setRestoreProgress(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-glass)' }}>
        <UploadCloud size={16} color="#9ca3af" />
        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e5e7eb' }}>Backup no Google Drive</span>
      </div>
      <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: 0 }}>
        Gera um arquivo com todas as suas pastas, apresentações e mídia, salvo direto no seu próprio Google Drive
        (pasta "Posologia Slides - Backups"). Na primeira vez, o Google vai pedir sua autorização.
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
          <div style={{ fontSize: '0.8rem', color: '#6ee7b7', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            Backup salvo: {createResult.fileName}
            <a href={`https://drive.google.com/file/d/${createResult.fileId}/view`} target="_blank" rel="noreferrer" style={{ color: '#38bdf8', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
              Abrir no Drive <ExternalLink size={12} />
            </a>
          </div>
        )}
        {createError && (
          <div style={{ fontSize: '0.8rem', color: '#f87171', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <AlertCircle size={14} /> {createError}
          </div>
        )}
      </div>

      <div>
        <button
          type="button"
          className="btn-icon"
          onClick={handleLoadBackups}
          disabled={loadingBackups}
          style={{ width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.8rem', gap: '0.4rem' }}
        >
          {loadingBackups ? <Loader2 size={14} className="animate-spin" /> : <DownloadCloud size={14} />}
          {loadingBackups ? 'Carregando...' : 'Ver backups salvos'}
        </button>

        {listError && (
          <div style={{ fontSize: '0.8rem', color: '#f87171', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <AlertCircle size={14} /> {listError}
          </div>
        )}

        {backups && (
          backups.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.5rem' }}>Nenhum backup salvo ainda.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.6rem' }}>
              {backups.map((b) => (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', background: 'rgba(255,255,255,0.03)', padding: '0.5rem 0.7rem', borderRadius: '0.4rem', fontSize: '0.78rem' }}>
                  <div>
                    <div style={{ color: '#e5e7eb' }}>{formatDate(b.createdTime)}</div>
                    <div style={{ color: '#6b7280' }}>{formatBytes(b.size)}</div>
                  </div>
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => handleRestore(b)}
                    disabled={restoringId === b.id}
                    style={{ width: 'auto', padding: '0.3rem 0.6rem', fontSize: '0.76rem', gap: '0.3rem' }}
                    title="Restaurar este backup (cria uma cópia nova, não apaga nada atual)"
                  >
                    {restoringId === b.id ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                    {restoringId === b.id ? (describeProgress(restoreProgress) || 'Restaurando...') : 'Restaurar'}
                  </button>
                </div>
              ))}
            </div>
          )
        )}

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
