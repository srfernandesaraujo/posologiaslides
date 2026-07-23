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

export async function getFolderTree(userId) {
  const [foldersSnap, subfoldersSnap, presentationsSnap] = await Promise.all([
    foldersRef(userId).orderBy('createdAt', 'asc').get(),
    subfoldersRef(userId).get(),
    presentationsRef(userId).get()
  ]);

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
    return {
      id: doc.id,
      name: folder.name,
      color: folder.color,
      subfolders: subfoldersByFolder.get(doc.id) || []
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
    lastOpenedAt: p.lastOpenedAt || null
  };
}

export async function getPresentation(id, userId) {
  const snap = await presentationsRef(userId).doc(id).get();
  return snap.exists ? serializePresentation(snap.id, snap.data()) : null;
}

export async function savePresentation(presentation, userId) {
  const { id, title, description, slides } = presentation;
  const now = Date.now();

  if (id) {
    const ref = presentationsRef(userId).doc(id);
    const existing = await ref.get();
    if (existing.exists) {
      const data = { title, description: description || null, slides, updatedAt: now };
      await ref.update(data);
      return serializePresentation(id, { ...existing.data(), ...data });
    }
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
    lastOpenedAt: null
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
