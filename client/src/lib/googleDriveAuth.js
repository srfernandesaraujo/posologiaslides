import { GoogleAuthProvider, reauthenticateWithPopup } from 'firebase/auth';
import { auth, driveGoogleProvider } from './firebase';

// Cache em memória (não localStorage — token de vida curta, ~1h, não vale
// persistir em disco) do access token OAuth do Google com escopo Drive.
let cached = null; // { token, expiresAt }

// Margem de segurança antes do TTL estimado (o Google não informa o TTL
// exato neste fluxo — Firebase não expõe expires_in aqui, só o access token
// em si — então assumimos a validade "normal" de ~1h e damos folga).
const EXPIRY_MARGIN_MS = 2 * 60 * 1000;
const ASSUMED_TTL_MS = 60 * 60 * 1000;

export class DriveAuthError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DriveAuthError';
    this.code = code;
  }
}

// Pede (ou reaproveita, se ainda válido) um access token do Google com
// escopo drive.file. Usa `reauthenticateWithPopup` sobre o usuário Firebase
// JÁ LOGADO (não um signInWithPopup solto) — protege contra a pessoa
// escolher no popup uma conta Google diferente da que já está logada no app
// (o Firebase lança `auth/user-mismatch` sozinho nesse caso, sem precisar de
// nenhuma checagem manual aqui).
export async function getDriveAccessToken() {
  if (cached && cached.expiresAt > Date.now() + EXPIRY_MARGIN_MS) {
    return cached.token;
  }

  if (!auth.currentUser) {
    throw new DriveAuthError('not_logged_in', 'Você precisa estar logado pra usar o backup.');
  }

  let result;
  try {
    result = await reauthenticateWithPopup(auth.currentUser, driveGoogleProvider);
  } catch (err) {
    if (err.code === 'auth/user-mismatch') {
      throw new DriveAuthError('user_mismatch', 'Você autorizou uma conta Google diferente da que está logada. Escolha a mesma conta.');
    }
    if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
      throw new DriveAuthError('popup_closed', 'Autorização do Google Drive cancelada.');
    }
    throw new DriveAuthError('auth_failed', 'Falha ao autorizar o acesso ao Google Drive: ' + err.message);
  }

  const credential = GoogleAuthProvider.credentialFromResult(result);
  const token = credential?.accessToken;
  if (!token) {
    throw new DriveAuthError('no_token', 'O Google não devolveu um token de acesso ao Drive.');
  }

  cached = { token, expiresAt: Date.now() + ASSUMED_TTL_MS };
  return token;
}

// Chamado quando o backend devolve `drive_token_expired` no meio de uma
// operação — descarta o cache pra forçar um novo popup na próxima tentativa,
// em vez de ficar reusando um token que o Google já rejeitou.
export function invalidateDriveAccessToken() {
  cached = null;
}
