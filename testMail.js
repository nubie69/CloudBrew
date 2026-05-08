require('dotenv').config();
const nodemailer = require('nodemailer');

function readEnv(name) {
  return String(process.env[name] || '').trim();
}

async function main() {
  const user = readEnv('EMAIL_USER');
  const pass = readEnv('EMAIL_PASS').replace(/\s+/g, '');
  const from = readEnv('EMAIL_FROM') || user;
  const to = readEnv('EMAIL_TO') || user;
  const smtpHost = readEnv('SMTP_HOST');
  const smtpPort = Number(readEnv('SMTP_PORT') || 587);
  const smtpSecure = String(readEnv('SMTP_SECURE') || 'false').toLowerCase() === 'true';

  if (!user || !pass) {
    throw new Error('EMAIL_USER and EMAIL_PASS are required.');
  }

  const transporter = smtpHost
    ? nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: { user, pass },
      })
    : nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass },
      });

  const info = await transporter.sendMail({
    from,
    to,
    subject: 'Cloud Brew SMTP test',
    text: 'This is a Cloud Brew SMTP connectivity test message.',
  });

  console.log(JSON.stringify({
    success: true,
    messageId: info.messageId,
    response: info.response,
    envelope: info.envelope,
    to,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ success: false, message: error.message }, null, 2));
  process.exit(1);
});
