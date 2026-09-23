const nodemailer = require('nodemailer');

function transporter() {
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

async function enviarCodigoRecuperacao(destinatario, codigo) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP não configurado.');
  }
  await transporter().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: destinatario,
    subject: 'IDE+ — Código para redefinir sua senha',
    text: `Seu código de confirmação do IDE+ é: ${codigo}\n\nEle é válido por 10 minutos e pode ser usado uma única vez.\nSe você não solicitou a troca de senha, ignore este e-mail.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto"><h2>IDE+</h2><p>Recebemos uma solicitação para redefinir sua senha.</p><p>Seu código de confirmação é:</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:18px 0">${codigo}</div><p>O código é válido por <b>10 minutos</b> e só pode ser usado uma vez.</p><p>Se você não solicitou esta alteração, ignore este e-mail.</p></div>`
  });
}

module.exports = { enviarCodigoRecuperacao };
