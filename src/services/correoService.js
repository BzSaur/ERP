import nodemailer from 'nodemailer';

function obtenerTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('Falta configurar SMTP_HOST, SMTP_USER y SMTP_PASS');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: { user, pass }
  });
}

export async function enviarCorreo({ destinatarios, asunto, texto, adjuntos = [] }) {
  const to = (Array.isArray(destinatarios) ? destinatarios : [destinatarios])
    .map(email => String(email || '').trim())
    .filter(Boolean);

  if (to.length === 0) {
    throw new Error('No hay destinatarios configurados para el correo');
  }

  const transporter = obtenerTransporter();
  return transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject: asunto,
    text: texto,
    attachments: adjuntos
  });
}

export default { enviarCorreo };
