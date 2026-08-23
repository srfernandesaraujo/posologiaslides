// Detecta iPad/iPhone/iPod pra contornar um bug de plataforma do WebKit: com a
// Fullscreen API REAL (`element.requestFullscreen()`) ativa, um arrasto de
// CIMA PRA BAIXO em qualquer lugar da tela sai da tela cheia imediatamente —
// mesmo gesto de "dispensar" usado em quase toda a UI do iOS (Central de
// Controle, vídeo em tela cheia, modais), reconhecido pelo WebKit/UIKit ANTES
// de qualquer evento chegar na página. Não tem como bloquear via JS
// (touch-action/preventDefault não alcançam esse nível) — confirmado testando
// no app real (apresentação com zoom manual: arrastar pra cima nunca sai,
// pra baixo sai sempre, em qualquer ponto da tela, não só perto de borda).
// A única forma de evitar o gesto é nunca abrir uma sessão de Fullscreen API
// de verdade nesses dispositivos (ver `isFullscreen` em PresentationEditor.jsx
// — só troca de estado do próprio app, não chama requestFullscreen()/
// exitFullscreen() quando isto retorna true).
//
// iPadOS 13+ manda User-Agent de Safari desktop (relata "Macintosh", igual
// um Mac de verdade) — por isso UA sozinho não distingue os dois. O truque
// padrão da comunidade (usado também pelo React DOM e por libs de detecção
// de dispositivo) é combinar isso com `maxTouchPoints`: um Mac de verdade não
// tem tela touch (maxTouchPoints 0), um iPad sempre tem.
export function isIOSFullscreenSwipeDownQuirk() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isClassicIOS = /iPad|iPhone|iPod/.test(ua);
  const isIPadOSReportingAsMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return isClassicIOS || isIPadOSReportingAsMac;
}
