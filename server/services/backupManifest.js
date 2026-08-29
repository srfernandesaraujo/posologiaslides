// Lógica PURA do formato de backup (sem I/O — sem Firestore, sem Storage, sem
// Drive) pra dar pra testar sem credenciais reais. A orquestração real (ler
// dados, listar/baixar mídia, subir pro Drive) fica em backupService.js.

const FORMAT_VERSION = 1;

export function buildManifest({ user, folders, presentations, mediaFiles }) {
  return {
    formatVersion: FORMAT_VERSION,
    generatedAt: new Date().toISOString(),
    app: 'posologia-slides',
    user: { id: user.id, email: user.email || null, name: user.name || null },
    folders: folders.map((f) => ({
      id: f.id,
      name: f.name,
      color: f.color,
      // Opcional: manifest de formato antigo (pré-subpastas) não tem isso —
      // restoreBackup trata a ausência criando só a "Geral" da disciplina.
      subfolders: Array.isArray(f.subfolders) ? f.subfolders.map((sub) => ({ id: sub.id, name: sub.name })) : undefined
    })),
    presentations: presentations.map((p) => ({
      id: p.id,
      folderId: p.folderId,
      // Idem: aditivo, manifest antigo não tem — restoreBackup cai no bucket
      // "Geral" da disciplina quando subfolderId está ausente.
      subfolderId: p.subfolderId || undefined,
      title: p.title,
      description: p.description || null,
      slides: p.slides,
      favorite: !!p.favorite,
      updatedAt: p.updatedAt,
      lastOpenedAt: p.lastOpenedAt || null,
      relatedPresentationId: p.relatedPresentationId || null,
      relatedPresentationTitle: p.relatedPresentationTitle || null
    })),
    media: mediaFiles.map((m) => ({
      zipPath: m.zipPath,
      originalUrl: m.originalUrl,
      contentType: m.contentType || null
    }))
  };
}

export function isSupportedFormatVersion(version) {
  return version === FORMAT_VERSION;
}

// Reescreve as URLs de mídia dentro do HTML de cada slide conforme o mapa
// {urlAntiga -> urlNova} montado durante o restore (mídia sempre sobe pra um
// objectPath NOVO no Storage, nunca reaproveita o path original — ver
// computeRestoreObjectPath). split/join em vez de regex: URLs são strings
// exatas conhecidas de antemão, então não há motivo pra pagar o custo/risco
// de caracteres especiais de regex (o "." do domínio, "?" em querystrings
// hipotéticas etc.). URL que não está no mapa fica intocada de propósito —
// cobre tanto mídia órfã (upada e depois removida de todo slide, então nem
// chega a ser referenciada aqui) quanto uma URL cujo arquivo original já foi
// apagado do Storage antes do backup (o backup completa normal, e o restore
// não deve quebrar a apresentação só porque uma imagem específica sumiu).
export function rewriteSlidesMedia(slides, urlMap) {
  const entries = Object.entries(urlMap || {});
  if (!entries.length || !Array.isArray(slides)) return slides;
  return slides.map((slide) => {
    if (!slide || typeof slide.html !== 'string' || !slide.html) return slide;
    let html = slide.html;
    for (const [oldUrl, newUrl] of entries) {
      if (html.includes(oldUrl)) html = html.split(oldUrl).join(newUrl);
    }
    return html === slide.html ? slide : { ...slide, html };
  });
}

function sanitizeFileName(name) {
  return (name || 'arquivo').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
}

// Novo path de objeto no Storage pra um item de mídia sendo restaurado —
// SEMPRE um path novo (nunca reaproveita o original), mesmo restaurando na
// mesma conta: é o que torna a reescrita de URL (rewriteSlidesMedia)
// necessária de fato, não só uma cautela. Preserva a distinção entre mídia
// "normal" (media/{userId}/...) e imagem gerada por IA
// (generated-images/{userId}/...) pra continuar batendo com o prefixo que
// createBackup usa pra listar mídia da conta (ver backupService.js).
export function computeRestoreObjectPath(userId, zipPath, index) {
  const isGenerated = zipPath.startsWith('media/generated/');
  const baseName = zipPath.split('/').pop();
  const safeName = sanitizeFileName(baseName);
  const prefix = isGenerated ? `generated-images/${userId}` : `media/${userId}`;
  return `${prefix}/${Date.now()}-${index}-${safeName}`;
}

// Extração DEFENSIVA de URLs do próprio bucket dentro do HTML de um slide —
// não é o caminho principal (o backup lista mídia direto do bucket por
// prefixo, mais confiável), só serve pra logar um aviso se alguma URL
// referenciada num slide não corresponder a nenhum arquivo listado. Tolerante
// tanto a `src="..."` quanto a `url(...)` dentro de `style="..."` (o fluxo
// padrão da UI só gera `src`, mas HTML colado manualmente via "Criar Slide
// por Código" poderia conter `background-image:url(...)`).
export function extractMediaUrlsFromHtml(html, bucketName) {
  if (!html || !bucketName) return [];
  const pattern = new RegExp(`https:\\/\\/storage\\.googleapis\\.com\\/${bucketName}\\/[^"'()\\s]+`, 'g');
  return Array.from(new Set(html.match(pattern) || []));
}
