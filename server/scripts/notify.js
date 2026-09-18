#!/usr/bin/env node
// Envia um e-mail de alerta — usado pelo deploy.sh quando um deploy falha e
// reverte sozinho (ver rollback() em deploy.sh), pra Sergio saber na hora em
// vez de só descobrir quando for dar aula (ver incidente 2026-09-18: deploy
// ficou quebrado silenciosamente por ~3 semanas, ninguém percebeu). Chamado
// via linha de comando: node scripts/notify.js "Assunto" "Corpo da mensagem".
// Nunca lança/derruba quem chamou se o e-mail falhar (rede fora do ar, SMTP
// mal configurado) — um alerta que falha não pode travar o próprio deploy.
import 'dotenv/config';
import nodemailer from 'nodemailer';

const [, , subject, body] = process.argv;

async function main() {
  if (!subject) {
    console.error('Uso: node scripts/notify.js "Assunto" "Corpo"');
    process.exit(1);
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, ALERT_EMAIL_TO } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !ALERT_EMAIL_TO) {
    console.error('notify.js: SMTP_HOST/SMTP_USER/SMTP_PASS/ALERT_EMAIL_TO não configurados no .env — alerta não enviado.');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });

  await transporter.sendMail({
    from: SMTP_USER,
    to: ALERT_EMAIL_TO,
    subject: `[Posologia Slides] ${subject}`,
    text: body || subject
  });
  console.log('notify.js: e-mail de alerta enviado.');
}

main().catch((err) => {
  // Melhor esforço: loga o erro mas nunca sai com falha "ruidosa" o
  // suficiente pra quebrar o script que chamou (deploy.sh já roda sem
  // set -e, mas mesmo assim isto é só um aviso, não o processo principal).
  console.error('notify.js: falha ao enviar e-mail de alerta:', err.message);
  process.exit(0);
});
