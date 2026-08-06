import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// Config pública do app Web (não é secreta — a segurança vem das regras do
// Firestore e dos domínios autorizados no Firebase Console, não deste objeto).
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();

// Provider SEPARADO do login normal, só pro fluxo de Backup no Google Drive
// (ver lib/googleDriveAuth.js) — pedido sob demanda quando o usuário clica em
// "Fazer Backup"/"Restaurar", não no login. Escopo mínimo (drive.file): só dá
// acesso aos arquivos que o PRÓPRIO app cria no Drive do usuário, não ao
// Drive inteiro.
export const driveGoogleProvider = new GoogleAuthProvider();
driveGoogleProvider.addScope('https://www.googleapis.com/auth/drive.file');
