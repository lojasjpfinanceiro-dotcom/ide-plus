const nodemailer = require('nodemailer');

function smtpConfig() {
  const port = Number(process.env.SMTP_PORT || 587);
  const host = String(process.env.SMTP_HOST || '').trim();
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').replace(/\s+/g, '');
  const from = String(process.env.SMTP_FROM || '').trim() || user;
  return { host, port, user, pass, from };
}

function transporter(config) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || config.port === 465,
    auth: { user: config.user, pass: config.pass }
  });
}

async function enviarCodigoRecuperacao(destinatario, codigo) {
  const config = smtpConfig();
  const faltando = [];
  if (!config.host) faltando.push('SMTP_HOST');
  if (!config.user) faltando.push('SMTP_USER');
  if (!config.pass) faltando.push('SMTP_PASS');
  if (faltando.length) {
    const erro = new Error('Configuração de e-mail incompleta: ' + faltando.join(', '));
    erro.code = 'SMTP_CONFIG';
    throw erro;
  }

  try {
    await transporter(config).sendMail({
      from: config.from,
      to: destinatario,
      subject: 'IDE+ — Código para redefinir sua senha',
      text: `Seu código de confirmação do IDE+ é: ${codigo}\n\nEle é válido por 10 minutos e pode ser usado uma única vez.\nSe você não solicitou a troca de senha, ignore este e-mail.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto"><h2>IDE+</h2><p>Recebemos uma solicitação para redefinir sua senha.</p><p>Seu código de confirmação é:</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:18px 0">${codigo}</div><p>O código é válido por <b>10 minutos</b> e só pode ser usado uma vez.</p><p>Se você não solicitou esta alteração, ignore este e-mail.</p></div>`
    });
  } catch (e) {
    const erro = new Error('Falha ao enviar pelo Gmail.');
    erro.code = e.code || e.responseCode || 'SMTP_SEND';
    erro.smtpMessage = e.message;
    throw erro;
  }
}

module.exports = { enviarCodigoRecuperacao };
