import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './firebaseAdmin.js';
import { seedPresentation } from '../data/seedPresentation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  batch.set(exampleSubfolder, { folderId: exampleFolder.id, name: EXAMPLE_SUBFOLDER_NAME, createdAt: now });
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
  batch.set(defaultSubfolder, { folderId: defaultFolder.id, name: DEFAULT_SUBFOLDER_NAME, createdAt: now });
  await batch.commit();

  return profile;
}

// Cria uma disciplina: 1 doc em folders + sua subpasta "Geral" (a mais antiga
// por createdAt — é onde cai tudo que não está em nenhuma subpasta nomeada,
// ver getFolderTree/isGeneral). O usuário pode criar subpastas adicionais
// depois via createSubfolder; a "Geral" nunca aparece como nó editável na UI.
export async function createFolder(userId, name, color) {
  const now = Date.now();
  const folder = foldersRef(userId).doc();
  const subfolder = subfoldersRef(userId).doc();

  const batch = db.batch();
  batch.set(folder, { name, color: color || '#38bdf8', createdAt: now });
  batch.set(subfolder, { folderId: folder.id, name: 'Geral', createdAt: now });
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

// Cria uma subpasta dentro de uma disciplina já existente (ex.: uma unidade
// ou assunto específico). Retorna null se a disciplina não existir.
export async function createSubfolder(userId, folderId, name) {
  const folderSnap = await foldersRef(userId).doc(folderId).get();
  if (!folderSnap.exists) return null;
  const now = Date.now();
  const subfolder = subfoldersRef(userId).doc();
  await subfolder.set({ folderId, name, createdAt: now });
  return { id: subfolder.id, folderId, name };
}

export async function renameSubfolder(userId, subfolderId, name) {
  const ref = subfoldersRef(userId).doc(subfolderId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  await ref.update({ name });
  return { id: subfolderId, ...snap.data(), name };
}

// Exclui uma subpasta, reatribuindo antes qualquer apresentação nela pra
// subpasta-irmã mais antiga da mesma disciplina (a "Geral"). Bloqueia excluir
// a subpasta padrão global do usuário e a última subpasta restante de uma
// disciplina — toda disciplina precisa manter pelo menos uma.
export async function deleteSubfolder(userId, subfolderId) {
  const profileSnap = await userRef(userId).get();
  const defaultSubfolderId = profileSnap.data()?.defaultSubfolderId || null;
  if (subfolderId === defaultSubfolderId) {
    return { error: 'default' };
  }

  const ref = subfoldersRef(userId).doc(subfolderId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const { folderId } = snap.data();

  // Sem orderBy na query: um doc sem createdAt (subpastas "Geral" criadas
  // antes desta feature) seria silenciosamente excluído do resultado de um
  // orderBy('createdAt') do Firestore — ordena em memória em vez disso (ver
  // mesmo cuidado em getFolderTree/movePresentationToFolder).
  const siblingsSnap = await subfoldersRef(userId).where('folderId', '==', folderId).get();
  if (siblingsSnap.size <= 1) {
    return { error: 'last' };
  }

  const siblings = siblingsSnap.docs.sort((a, b) => (a.data().createdAt || 0) - (b.data().createdAt || 0));
  const targetId = siblings.find((doc) => doc.id !== subfolderId).id;

  const batch = db.batch();
  const presentationsSnap = await presentationsRef(userId).where('subfolderId', '==', subfolderId).get();
  presentationsSnap.forEach((doc) => batch.update(doc.ref, { subfolderId: targetId }));
  batch.delete(ref);
  await batch.commit();

  return { success: true };
}

// Move uma apresentação direto pra uma subpasta específica (ex.: escolhida
// no popover "Mover para pasta" da UI). Ver movePresentationToFolder pra
// mover pra "Geral" da disciplina sem escolher subpasta.
export async function movePresentationToSubfolder(userId, presentationId, subfolderId) {
  const subfolderSnap = await subfoldersRef(userId).doc(subfolderId).get();
  if (!subfolderSnap.exists) return null;

  const ref = presentationsRef(userId).doc(presentationId);
  const snap = await ref.get();
  if (!snap.exists) return null;

  await ref.update({ subfolderId });
  return { subfolderId };
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

// Move uma apresentação pra outra disciplina, resolvendo a subpasta "Geral"
// dela (a mais antiga por createdAt — ver createFolder/getFolderTree). Pra
// mover pra uma subpasta específica, ver movePresentationToSubfolder.
export async function movePresentationToFolder(userId, presentationId, folderId) {
  // Sem orderBy na query (ver comentário em deleteSubfolder) — ordena em
  // memória pra não excluir subpastas "Geral" antigas sem createdAt.
  const subfoldersSnap = await subfoldersRef(userId).where('folderId', '==', folderId).get();
  if (subfoldersSnap.empty) return null;
  const subfolderId = subfoldersSnap.docs.sort((a, b) => (a.data().createdAt || 0) - (b.data().createdAt || 0))[0].id;

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
    if (p.trashed) return; // apresentações na lixeira não aparecem na biblioteca normal
    const list = presentationsBySubfolder.get(p.subfolderId) || [];
    list.push({
      id: doc.id,
      title: p.title,
      favorite: !!p.favorite,
      updatedAt: p.updatedAt,
      lastOpenedAt: p.lastOpenedAt || null,
      firstSlideHtml: Array.isArray(p.slides) ? p.slides[0]?.html || null : null,
      // Mesma medida usada por findOversizedSlide (só o array `slides`, que é
      // de longe o grosso do documento) — dá pra biblioteca mostrar quão perto
      // do limite de 1 MiB do Firestore cada apresentação está.
      sizeBytes: Array.isArray(p.slides) ? Buffer.byteLength(JSON.stringify(p.slides), 'utf8') : 0
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
      // Docs criados antes desta feature não têm createdAt — tratamos como 0
      // (mais antigo possível), o que é exatamente o comportamento desejado:
      // a "Geral" pré-existente de cada disciplina continua sendo a raiz.
      createdAt: sub.createdAt || 0,
      presentations: (presentationsBySubfolder.get(doc.id) || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    });
    subfoldersByFolder.set(sub.folderId, list);
  });

  return foldersSnap.docs.map((doc) => {
    const folder = doc.data();
    // A subpasta mais antiga de cada disciplina é a "Geral" (isGeneral) — a
    // raiz onde caem apresentações sem subpasta própria, nunca exposta como
    // nó editável/apagável na árvore da UI (ver HomeLibrary.jsx).
    const subfolders = (subfoldersByFolder.get(doc.id) || [])
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((sub, index) => ({ id: sub.id, name: sub.name, presentations: sub.presentations, isGeneral: index === 0 }));
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
    // Slides apagados individualmente dentro do editor (ver SlideTrashModal/
    // PresentationEditor) — ficam aqui até serem restaurados ou apagados de
    // vez, persistidos junto do resto pelo autosave normal.
    trashedSlides: p.trashedSlides || [],
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

// Firestore recusa qualquer documento acima de 1 MiB — sem exceção, sem
// aviso amigável, só um erro genérico do gRPC (que às vezes nem menciona
// tamanho, ver findInvalidNestedArrayPath acima; foi assim que um slide de
// 4,5 MB — importado via "Importar Pasta Inteira" embutindo algo enorme,
// provavelmente uma imagem colada como base64 em vez de enviada como arquivo
// — ficou horas disfarçado de bug de array aninhado, 2026-08-07). Checa
// ANTES de tentar gravar e aponta o slide culpado, em vez de deixar o
// Firestore recusar com uma mensagem que não ajuda a achar o problema.
// Exportada pra rota /tree devolver junto (ver presentationsRoutes.js) — a
// biblioteca mostra o tamanho de cada apresentação contra este mesmo limite,
// em vez de um número mágico duplicado no frontend.
export const FIRESTORE_MAX_DOCUMENT_BYTES = 1048576;
const SIZE_WARNING_THRESHOLD_BYTES = FIRESTORE_MAX_DOCUMENT_BYTES * 0.9;

// `extraBytes` soma o tamanho de outros campos gravados junto de `slides` no
// mesmo documento (hoje só trashedSlides, ver serializePresentation) — sem
// isso, um documento perto do limite de 1 MiB por causa da lixeira interna
// de slides passaria batido neste aviso e só falharia com o erro genérico do
// Firestore lá na hora de gravar (ver savePresentation acima).
export function findOversizedSlide(slides, extraBytes = 0) {
  const totalBytes = Buffer.byteLength(JSON.stringify(slides), 'utf8') + extraBytes;
  if (totalBytes < SIZE_WARNING_THRESHOLD_BYTES) return null;

  let biggest = null;
  slides.forEach((slide, index) => {
    const bytes = Buffer.byteLength(JSON.stringify(slide), 'utf8');
    if (!biggest || bytes > biggest.bytes) biggest = { index, bytes, title: slide?.title || '(sem título)' };
  });
  return { totalBytes, biggest };
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
  const { id, title, description, slides, trashedSlides, relatedPresentationId, relatedPresentationTitle, expectedUpdatedAt, force, sessionId } = presentation;
  const now = Date.now();

  if (id) {
    const ref = presentationsRef(userId).doc(id);
    // `data` fica fora do runTransaction pra ficar acessível no catch abaixo
    // — o gRPC do Firestore só rejeita a gravação de verdade quando a
    // transação faz commit, DEPOIS que o callback já retornou, então o erro
    // sempre aparece aqui fora, nunca dentro do próprio callback.
    let data;
    let result;
    try {
      result = await db.runTransaction(async (tx) => {
        const existing = await tx.get(ref);
        if (!existing.exists) return null;

        const currentData = existing.data();
        const sameSessionAsLastWriter = !!sessionId && currentData.lastWriterSessionId === sessionId;

        if (!force && !sameSessionAsLastWriter && typeof expectedUpdatedAt === 'number' && currentData.updatedAt !== expectedUpdatedAt) {
          return { conflict: true, presentation: serializePresentation(id, currentData) };
        }

        data = {
          title, description: description || null, slides, trashedSlides: trashedSlides || [], updatedAt: now,
          lastWriterSessionId: sessionId || null,
          relatedPresentationId: relatedPresentationId || null,
          relatedPresentationTitle: relatedPresentationTitle || null
        };
        tx.update(ref, data);
        return { conflict: false, presentation: serializePresentation(id, { ...currentData, ...data }) };
      });
    } catch (err) {
      // code 3 = INVALID_ARGUMENT do gRPC do Firestore. findInvalidNestedArrayPath
      // já busca em `slides` sozinho (checado antes de chegar aqui, tanto no
      // cliente quanto na rota) — aqui varre TUDO que foi de fato escrito
      // (title/description/etc também), pro caso do campo culpado não ser em
      // slides. Se mesmo assim não achar, devolve uma amostra bruta dos dados
      // em vez de deixar só a mensagem genérica do Firestore, que não diz
      // onde está o problema (incidente 2026-08-07, Aula 08).
      if (err && err.code === 3 && data) {
        const invalidPath = findInvalidNestedArrayPath(data, '');
        // Grava o payload INTEIRO em disco em vez de truncar numa resposta
        // HTTP — apresentações com várias slides passam fácil de qualquer
        // corte razoável de string, e cortado no meio esconde exatamente a
        // parte que importa.
        const debugFilePath = path.join(__dirname, '..', 'tmp-debug-payload.json');
        try {
          fs.writeFileSync(debugFilePath, JSON.stringify(data, null, 2), 'utf8');
        } catch { /* melhor esforço — não deixa o diagnóstico quebrar a resposta de erro em si */ }
        const diagnostic = invalidPath
          ? `Campo inválido: "${invalidPath}" (array dentro de array).`
          : `Campo não identificado automaticamente. Dados completos salvos em server/tmp-debug-payload.json — procure por "[[" nesse arquivo.`;
        const diagnosedError = new Error(`Firestore recusou a gravação. ${diagnostic}`);
        diagnosedError.status = 400;
        throw diagnosedError;
      }
      throw err;
    }
    if (result) return result;
  }

  const profileSnap = await userRef(userId).get();
  const subfolderId = profileSnap.data()?.defaultSubfolderId || null;

  const data = {
    subfolderId,
    title,
    description: description || null,
    slides,
    trashedSlides: trashedSlides || [],
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

// --- Lixeira de apresentações --------------------------------------------
// Exclusão de apresentação é soft-delete (flag `trashed` + `trashedAt`, item
// some da árvore normal — ver getFolderTree acima) — só some de vez do
// Firestore ao ser apagada explicitamente DA lixeira (permanentlyDeletePresentation)
// ou pelo "esvaziar lixeira" (emptyTrash).

export async function trashPresentation(id, userId) {
  const ref = presentationsRef(userId).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return false;
  await ref.update({ trashed: true, trashedAt: Date.now() });
  return true;
}

export async function restorePresentation(id, userId) {
  const ref = presentationsRef(userId).doc(id);
  const snap = await ref.get();
  if (!snap.exists || !snap.data().trashed) return false;
  await ref.update({ trashed: false, trashedAt: null });
  return true;
}

export async function permanentlyDeletePresentation(id, userId) {
  const ref = presentationsRef(userId).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return false;
  await ref.delete();
  return true;
}

export async function emptyTrash(userId) {
  const snap = await presentationsRef(userId).where('trashed', '==', true).get();
  const batch = db.batch();
  snap.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  return snap.size;
}

export async function getTrash(userId) {
  const [presentationsSnap, subfoldersSnap, foldersSnap] = await Promise.all([
    presentationsRef(userId).where('trashed', '==', true).get(),
    subfoldersRef(userId).get(),
    foldersRef(userId).get()
  ]);

  const subfolderById = new Map(subfoldersSnap.docs.map((doc) => [doc.id, doc.data()]));
  const folderById = new Map(foldersSnap.docs.map((doc) => [doc.id, doc.data()]));

  return presentationsSnap.docs
    .map((doc) => {
      const p = doc.data();
      const subfolder = subfolderById.get(p.subfolderId);
      const folder = subfolder ? folderById.get(subfolder.folderId) : null;
      return {
        id: doc.id,
        title: p.title,
        trashedAt: p.trashedAt || null,
        folderName: folder?.name || null,
        folderColor: folder?.color || null,
        subfolderName: subfolder?.name || null,
        firstSlideHtml: Array.isArray(p.slides) ? p.slides[0]?.html || null : null
      };
    })
    .sort((a, b) => (b.trashedAt || 0) - (a.trashedAt || 0));
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
