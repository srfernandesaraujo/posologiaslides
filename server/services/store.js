import crypto from 'crypto';
import { db } from './firebaseAdmin.js';
import { seedPresentation } from '../data/seedPresentation.js';

const DEFAULT_FOLDER_NAME = 'Minhas Apresentações';
const DEFAULT_SUBFOLDER_NAME = 'Geradas por IA';
const EXAMPLE_FOLDER_NAME = 'Farmacologia Clínica';
const EXAMPLE_SUBFOLDER_NAME = 'Posologia & Janela Terapêutica';

function userRef(userId) {
  return db.collection('users').doc(userId);
}

function foldersRef(userId) {
  return userRef(userId).collection('folders');
}

function subfoldersRef(userId) {
  return userRef(userId).collection('subfolders');
}

function presentationsRef(userId) {
  return userRef(userId).collection('presentations');
}

// Coleção de nível raiz (não por usuário, ao contrário de presentationsRef) —
// mapeia um token de link público (shareId, doc id) pra qual apresentação de
// qual usuário ele expõe. Fica separada da apresentação em si pra revogar
// ser só apagar este doc, sem tocar na apresentação.
function sharesRef() {
  return db.collection('shares');
}

// Cria o perfil do usuário (se ainda não existir) e popula a estrutura de pastas
// padrão + a apresentação-exemplo. Idempotente: seguro de chamar em todo login.
export async function ensureUserProfile(userId, { email, name, avatarUrl }) {
  const ref = userRef(userId);
  const snap = await ref.get();
  if (snap.exists) {
    return snap.data();
  }

  const now = Date.now();

  const exampleFolder = foldersRef(userId).doc();
  const exampleSubfolder = subfoldersRef(userId).doc();
  const presentation = presentationsRef(userId).doc();
  const defaultFolder = foldersRef(userId).doc();
  const defaultSubfolder = subfoldersRef(userId).doc();

  const profile = { email, name, avatarUrl: avatarUrl || null, createdAt: now, defaultSubfolderId: defaultSubfolder.id };

  const batch = db.batch();
  batch.set(ref, profile);
  batch.set(exampleFolder, { name: EXAMPLE_FOLDER_NAME, color: '#a855f7', createdAt: now });
  batch.set(exampleSubfolder, { folderId: exampleFolder.id, name: EXAMPLE_SUBFOLDER_NAME });
  batch.set(presentation, {
    subfolderId: exampleSubfolder.id,
    title: seedPresentation.title,
    description: seedPresentation.description,
    slides: seedPresentation.slides,
    favorite: false,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: null
  });
  batch.set(defaultFolder, { name: DEFAULT_FOLDER_NAME, color: '#38bdf8', createdAt: now });
  batch.set(defaultSubfolder, { folderId: defaultFolder.id, name: DEFAULT_SUBFOLDER_NAME });
  await batch.commit();

  return profile;
}

// Cria uma pasta "simples": 1 doc em folders + 1 subpasta interna (nunca
// exposta na UI) — mesmo modelo de dados de duas camadas que já existe pra
// pasta padrão/exemplo (ver ensureUserProfile), só que sem o usuário nunca
// precisar pensar em subpastas.
export async function createFolder(userId, name, color) {
  const now = Date.now();
  const folder = foldersRef(userId).doc();
  const subfolder = subfoldersRef(userId).doc();

  const batch = db.batch();
  batch.set(folder, { name, color: color || '#38bdf8', createdAt: now });
  batch.set(subfolder, { folderId: folder.id, name: 'Geral' });
  await batch.commit();

  // subfolderId: aditivo (chamadores existentes só destroem os campos que já
  // usavam) — quem precisa saber onde encaixar algo dentro da pasta recém-
  // criada sem dar outra volta no Firestore (ex.: restoreBackup em
  // backupService.js, recriando pastas a partir de um manifest) usa direto.
  return { id: folder.id, name, color: color || '#38bdf8', subfolders: [], subfolderId: subfolder.id };
}

export async function renameFolder(userId, folderId, name) {
  const ref = foldersRef(userId).doc(folderId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  await ref.update({ name });
  return { id: folderId, ...snap.data(), name };
}

// Exclui a pasta inteira (e sua(s) subpasta(s) internas), reatribuindo antes
// qualquer apresentação nelas pra subpasta padrão do usuário — nunca deixa
// apresentação órfã. Bloqueia a exclusão da própria pasta padrão (não há pra
// onde reatribuir o conteúdo dela).
export async function deleteFolder(userId, folderId) {
  const profileSnap = await userRef(userId).get();
  const defaultSubfolderId = profileSnap.data()?.defaultSubfolderId || null;

  const subfoldersSnap = await subfoldersRef(userId).where('folderId', '==', folderId).get();
  const subfolderIds = subfoldersSnap.docs.map((doc) => doc.id);

  if (defaultSubfolderId && subfolderIds.includes(defaultSubfolderId)) {
    return { error: 'default' };
  }

  const batch = db.batch();

  if (subfolderIds.length > 0 && defaultSubfolderId) {
    const presentationsSnap = await presentationsRef(userId).where('subfolderId', 'in', subfolderIds).get();
    presentationsSnap.forEach((doc) => batch.update(doc.ref, { subfolderId: defaultSubfolderId }));
  }

  subfoldersSnap.forEach((doc) => batch.delete(doc.ref));
  batch.delete(foldersRef(userId).doc(folderId));
  await batch.commit();

  return { success: true };
}

// Move uma apresentação pra outra pasta, resolvendo a subpasta interna única
// daquela pasta (modelo "pasta simples" — ver createFolder).
export async function movePresentationToFolder(userId, presentationId, folderId) {
  const subfoldersSnap = await subfoldersRef(userId).where('folderId', '==', folderId).limit(1).get();
  if (subfoldersSnap.empty) return null;
  const subfolderId = subfoldersSnap.docs[0].id;

  const ref = presentationsRef(userId).doc(presentationId);
  const snap = await ref.get();
  if (!snap.exists) return null;

  await ref.update({ subfolderId });
  return { subfolderId };
}

export async function getFolderTree(userId) {
  const [foldersSnap, subfoldersSnap, presentationsSnap, profileSnap] = await Promise.all([
    foldersRef(userId).orderBy('createdAt', 'asc').get(),
    subfoldersRef(userId).get(),
    presentationsRef(userId).get(),
    userRef(userId).get()
  ]);
  const defaultSubfolderId = profileSnap.data()?.defaultSubfolderId || null;

  const presentationsBySubfolder = new Map();
  presentationsSnap.forEach((doc) => {
    const p = doc.data();
    const list = presentationsBySubfolder.get(p.subfolderId) || [];
    list.push({
      id: doc.id,
      title: p.title,
      favorite: !!p.favorite,
      updatedAt: p.updatedAt,
      lastOpenedAt: p.lastOpenedAt || null,
      firstSlideHtml: Array.isArray(p.slides) ? p.slides[0]?.html || null : null
    });
    presentationsBySubfolder.set(p.subfolderId, list);
  });

  const subfoldersByFolder = new Map();
  subfoldersSnap.forEach((doc) => {
    const sub = doc.data();
    const list = subfoldersByFolder.get(sub.folderId) || [];
    list.push({
      id: doc.id,
      name: sub.name,
      presentations: (presentationsBySubfolder.get(doc.id) || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    });
    subfoldersByFolder.set(sub.folderId, list);
  });

  return foldersSnap.docs.map((doc) => {
    const folder = doc.data();
    const subfolders = subfoldersByFolder.get(doc.id) || [];
    return {
      id: doc.id,
      name: folder.name,
      color: folder.color,
      subfolders,
      isDefault: subfolders.some((sub) => sub.id === defaultSubfolderId)
    };
  });
}

function serializePresentation(id, p) {
  return {
    id,
    title: p.title,
    description: p.description,
    slides: p.slides,
    favorite: !!p.favorite,
    updatedAt: p.updatedAt,
    lastOpenedAt: p.lastOpenedAt || null,
    // Link "Aula Relacionada" mostrado no slide de encerramento (ver
    // client/src/lib/closingSlideTemplate.js) — título denormalizado junto do
    // id pra não precisar de outra consulta só pra rotular o link; fica
    // desatualizado se a aula relacionada for renomeada depois (aceitável,
    // corrige sozinho ao vincular de novo).
    relatedPresentationId: p.relatedPresentationId || null,
    relatedPresentationTitle: p.relatedPresentationTitle || null
  };
}

// Firestore recusa gravar um array que contenha outro array diretamente
// dentro dele (ex.: `{ pontos: [[1,2],[3,4]] }`) — falha com um erro genérico
// (`INVALID_ARGUMENT: Property array contains an invalid nested entity`) que
// não diz ONDE está o problema. Isso já travou um save de verdade sem
// resposta nenhuma pro cliente (2026-08-07 — ver presentationsRoutes.js,
// devolvido como 400 com o caminho exato antes de sequer tentar escrever, em
// vez de deixar o Firestore rejeitar e a mensagem ficar só nos logs do
// servidor). Objetos (mapas) DENTRO de arrays podem ter arrays à vontade —
// só array-dentro-de-array direto é proibido.
export function findInvalidNestedArrayPath(value, path = 'slides') {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (Array.isArray(value[i])) return `${path}[${i}]`;
      const nested = findInvalidNestedArrayPath(value[i], `${path}[${i}]`);
      if (nested) return nested;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      const nested = findInvalidNestedArrayPath(value[key], `${path}.${key}`);
      if (nested) return nested;
    }
  }
  return null;
}

export async function getPresentation(id, userId) {
  const snap = await presentationsRef(userId).doc(id).get();
  return snap.exists ? serializePresentation(snap.id, snap.data()) : null;
}

// Concorrência otimista: se `expectedUpdatedAt` vier preenchido e divergir do
// `updatedAt` gravado agora no Firestore, alguém mais salvou por cima entre o
// cliente ter carregado a apresentação e este save chegar — em vez de
// sobrescrever (era o que `ref.update()` direto fazia, causa raiz do bug de
// slides sumindo em edição concorrente multi-aba/dispositivo), devolve
// `conflict: true` com o estado atual do servidor pro chamador decidir. Roda
// dentro de `runTransaction` (não só `get` + `update` em sequência) pra essa
// checagem ser atômica de verdade — sem isso, duas requisições podiam passar
// pelo `get()` antes de qualquer `update()` acontecer e a checagem vira letra
// morta. `force: true` pula a checagem — usado só quando o usuário resolve um
// conflito já mostrado a ele escolhendo manter a própria versão.
//
// `sessionId` (um id aleatório gerado uma vez por aba, ver App.jsx) evita um
// falso-positivo: o autosave cancela (AbortController) um POST anterior ainda
// em voo antes de mandar um novo, mas o cancelamento só existe do lado do
// navegador — o servidor não sabe e pode terminar de gravar aquele save
// mesmo assim. O cliente nunca processa essa resposta abortada, então o
// `updatedAt` que ele guarda localmente fica atrasado, e o PRÓXIMO autosave
// da MESMA aba erraria a checagem contra o próprio save anterior (conflito
// "toda hora" com um único navegador aberto, sem ninguém mais editando).
// Se quem gravou por último foi essa mesma sessão, deixa passar mesmo com
// expectedUpdatedAt desatualizado — só é conflito de verdade quando o último
// gravador foi uma sessão DIFERENTE.
export async function savePresentation(presentation, userId) {
  const { id, title, description, slides, relatedPresentationId, relatedPresentationTitle, expectedUpdatedAt, force, sessionId } = presentation;
  const now = Date.now();

  if (id) {
    const ref = presentationsRef(userId).doc(id);
    const result = await db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (!existing.exists) return null;

      const currentData = existing.data();
      const sameSessionAsLastWriter = !!sessionId && currentData.lastWriterSessionId === sessionId;

      if (!force && !sameSessionAsLastWriter && typeof expectedUpdatedAt === 'number' && currentData.updatedAt !== expectedUpdatedAt) {
        return { conflict: true, presentation: serializePresentation(id, currentData) };
      }

      const data = {
        title, description: description || null, slides, updatedAt: now,
        lastWriterSessionId: sessionId || null,
        relatedPresentationId: relatedPresentationId || null,
        relatedPresentationTitle: relatedPresentationTitle || null
      };
      tx.update(ref, data);
      return { conflict: false, presentation: serializePresentation(id, { ...currentData, ...data }) };
    });
    if (result) return result;
  }

  const profileSnap = await userRef(userId).get();
  const subfolderId = profileSnap.data()?.defaultSubfolderId || null;

  const data = {
    subfolderId,
    title,
    description: description || null,
    slides,
    favorite: false,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: null,
    lastWriterSessionId: sessionId || null,
    relatedPresentationId: relatedPresentationId || null,
    relatedPresentationTitle: relatedPresentationTitle || null
  };
  const ref = await presentationsRef(userId).add(data);
  return { conflict: false, presentation: serializePresentation(ref.id, data) };
}

// Só pro restore de backup (backupService.js) — savePresentation() sempre
// joga apresentações NOVAS na subpasta padrão do usuário (linha acima), o
// que não serve aqui: o restore recria cada apresentação dentro da pasta
// (nova) que veio do próprio backup, não na padrão. Função separada em vez
// de estender savePresentation pra aceitar um subfolderId explícito —
// menor superfície de risco pro autosave normal, que continua 100% intocado.
export async function createPresentationInSubfolder(userId, subfolderId, presentation) {
  const { title, description, slides, favorite, relatedPresentationId, relatedPresentationTitle, updatedAt, lastOpenedAt } = presentation;
  const now = Date.now();
  const data = {
    subfolderId,
    title,
    description: description || null,
    slides,
    favorite: !!favorite,
    createdAt: now,
    updatedAt: updatedAt || now,
    lastOpenedAt: lastOpenedAt || null,
    relatedPresentationId: relatedPresentationId || null,
    relatedPresentationTitle: relatedPresentationTitle || null
  };
  const ref = await presentationsRef(userId).add(data);
  return serializePresentation(ref.id, data);
}

export async function setFavorite(id, userId, favorite) {
  const ref = presentationsRef(userId).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  await ref.update({ favorite: !!favorite });
  return serializePresentation(id, { ...snap.data(), favorite: !!favorite });
}

export async function renamePresentation(id, userId, title) {
  const ref = presentationsRef(userId).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const now = Date.now();
  await ref.update({ title: title.trim(), updatedAt: now });
  return serializePresentation(id, { ...snap.data(), title: title.trim(), updatedAt: now });
}


export async function touchPresentation(id, userId) {
  const ref = presentationsRef(userId).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const lastOpenedAt = Date.now();
  await ref.update({ lastOpenedAt });
  return serializePresentation(id, { ...snap.data(), lastOpenedAt });
}

export async function deletePresentation(id, userId) {
  const ref = presentationsRef(userId).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return false;
  await ref.delete();
  return true;
}

// --- Link público só-visualização --------------------------------------

export async function getShareForPresentation(presentationId, userId) {
  const snap = await sharesRef().where('userId', '==', userId).where('presentationId', '==', presentationId).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { shareId: doc.id, createdAt: doc.data().createdAt };
}

// Idempotente: cliques repetidos em "Gerar link" devolvem sempre o mesmo
// token, em vez de espalhar docs de compartilhamento órfãos.
export async function createOrGetShareLink(presentationId, userId) {
  const presentation = await getPresentation(presentationId, userId);
  if (!presentation) return null;

  const existing = await getShareForPresentation(presentationId, userId);
  if (existing) return existing;

  const shareId = crypto.randomBytes(18).toString('base64url');
  const createdAt = Date.now();
  await sharesRef().doc(shareId).set({ userId, presentationId, createdAt });
  return { shareId, createdAt };
}

// Sempre re-deriva o shareId a partir de presentationId+userId (nunca aceita
// um shareId vindo direto do cliente) — assim um usuário nunca revoga o link
// de outro só adivinhando/reaproveitando um token.
export async function revokeShare(presentationId, userId) {
  const existing = await getShareForPresentation(presentationId, userId);
  if (!existing) return false;
  await sharesRef().doc(existing.shareId).delete();
  return true;
}

export async function getPresentationByShareId(shareId) {
  const snap = await sharesRef().doc(shareId).get();
  if (!snap.exists) return null;
  const { userId, presentationId } = snap.data();
  // Reaproveita getPresentation tal como está — o userId usado é sempre o
  // gravado no doc de compartilhamento, nunca algo vindo do cliente. Se a
  // apresentação foi apagada depois, getPresentation já devolve null aqui.
  return getPresentation(presentationId, userId);
}

// Versão exposta ao link público — lista de permissão explícita (não uma
// exclusão), pra nunca vazar um campo sensível novo por esquecimento.
// correctAnswer/hotspotConfig ficam de fora pelo mesmo motivo que a sessão ao
// vivo já esconde a resposta certa do aluno; type é conceito de sessão ao
// vivo sem uso no visualizador estático; favorite/updatedAt/lastOpenedAt são
// metadados de gestão da biblioteca do professor.
export function toPublicPresentation(presentation) {
  return {
    id: presentation.id,
    title: presentation.title,
    description: presentation.description,
    slides: (presentation.slides || []).map((s) => ({
      id: s.id,
      title: s.title,
      html: s.html,
      transition: s.transition
    }))
  };
}

// Chaves de API do usuário: salvas no perfil do Firestore (não no localStorage)
// para que fiquem disponíveis em qualquer dispositivo em que ele fizer login.
export async function getUserSettings(userId) {
  const snap = await userRef(userId).get();
  const data = snap.data() || {};
  return {
    geminiApiKey: data.geminiApiKey || '',
    openaiApiKey: data.openaiApiKey || '',
    anthropicApiKey: data.anthropicApiKey || '',
    unsplashApiKey: data.unsplashApiKey || '',
    pexelsApiKey: data.pexelsApiKey || '',
    giphyApiKey: data.giphyApiKey || ''
  };
}

export async function saveUserSettings(userId, { geminiApiKey, openaiApiKey, anthropicApiKey, unsplashApiKey, pexelsApiKey, giphyApiKey }) {
  const ref = userRef(userId);
  await ref.set({
    geminiApiKey: (geminiApiKey || '').trim(),
    openaiApiKey: (openaiApiKey || '').trim(),
    anthropicApiKey: (anthropicApiKey || '').trim(),
    unsplashApiKey: (unsplashApiKey || '').trim(),
    pexelsApiKey: (pexelsApiKey || '').trim(),
    giphyApiKey: (giphyApiKey || '').trim()
  }, { merge: true });
  return getUserSettings(userId);
}
