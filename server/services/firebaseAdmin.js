import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

// A chave privada vem do .env com \n escapados (formato de variável de ambiente
// de linha única); precisa virar quebras de linha reais para o SDK aceitar.
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey
    }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  });
}

export const db = getFirestore();
export const auth = getAuth();
// Bucket do Cloud Storage — mídia enviada pelo usuário (imagem/vídeo/áudio)
// vai aqui em vez de virar data: URI dentro do documento da apresentação no
// Firestore, que tem limite rígido de 1 MiB por documento.
export const bucket = getStorage().bucket();
