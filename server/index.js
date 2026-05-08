require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const Pusher = require('pusher');
const Sentry = require('@sentry/node');
const { Server } = require('socket.io');
const os = require('os');
const fs = require('fs');
const path = require('path');
const https = require('https');
const createAdminRecoveryHandler = require('../routes/adminRecovery');

const app = express();

app.use(cors());
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: false }));

const JWT_EXPIRATION = '12h';
const FALLBACK_JWT_SECRET = 'cloud-brew-dev-secret-change-me';
const FALLBACK_ADMIN_EMAIL = 'admin@cloudbrew.app';
const FALLBACK_ADMIN_PASSWORD = 'Admin9090!';
const MAX_PAGE_SIZE = 50;
const DEFAULT_STAFF_PAGE_SIZE = 10;
const DEFAULT_LOG_PAGE_SIZE = 20;
const MAX_RECIPE_IMAGE_LENGTH = 6 * 1024 * 1024;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const RESET_TOKEN_TTL_MINUTES = Math.floor(RESET_TOKEN_TTL_MS / 60000);
const DEFAULT_ANALYTICS_LOOKBACK_DAYS = 30;
const ANALYTICS_GROUP_BY_OPTIONS = new Set(['hour', 'day', 'week']);
const PUSHER_CHANNEL = 'cloudbrew-queue';

const SENTRY_DSN = String(process.env.SENTRY_DSN || '').trim();
const PUSHER_APP_ID = String(process.env.PUSHER_APP_ID || '').trim();
const PUSHER_KEY = String(process.env.PUSHER_KEY || '').trim();
const PUSHER_SECRET = String(process.env.PUSHER_SECRET || '').trim();
const PUSHER_CLUSTER = String(process.env.PUSHER_CLUSTER || '').trim();

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.2,
  });
}

const PAYMENT_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  REFUNDED: 'refunded',
};

const DRINK_BASE_PRICES = {
  Espresso: 95,
  Americano: 115,
  Cappuccino: 145,
  Latte: 155,
  Mocha: 165,
};

const SIZE_MULTIPLIER = {
  Small: 0.9,
  Medium: 1,
  Large: 1.18,
};

const ADD_ON_PRICE = 20;

const ORDER_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',
};

const DEFAULT_RECIPES = {
  Espresso: {
    ingredients: ['18g espresso beans', '30ml hot water'],
    steps: ['Grind beans finely.', 'Tamp coffee grounds.', 'Pull 25-30 second shot.'],
  },
  Americano: {
    ingredients: ['Espresso shot', '120ml hot water'],
    steps: ['Prepare an espresso shot.', 'Add hot water to cup.', 'Pour espresso over water.'],
  },
  Cappuccino: {
    ingredients: ['Espresso shot', '120ml milk foam'],
    steps: ['Brew espresso.', 'Steam milk to silky foam.', 'Top espresso with foamed milk.'],
  },
  Latte: {
    ingredients: ['Espresso shot', '180ml steamed milk', 'Light foam'],
    steps: ['Prepare espresso.', 'Steam milk with microfoam.', 'Pour milk and finish with foam.'],
  },
  Mocha: {
    ingredients: ['Espresso shot', 'Chocolate syrup', '150ml steamed milk'],
    steps: ['Add chocolate syrup to cup.', 'Brew espresso into syrup.', 'Add steamed milk and stir.'],
  },
};

const DEFAULT_STAFF = [
  {
    id: 'cashier-1',
    name: 'Celine',
    role: 'cashier',
    email: 'cashier@cloudbrew.app',
    password: 'Cashier1111!',
    active: true,
  },
  {
    id: 'barista-1',
    name: 'Bruno',
    role: 'barista',
    email: 'barista@cloudbrew.app',
    password: 'Barista2222!',
    active: true,
  },
];

const ROOT_ADMIN_ACCOUNT = {
  id: 'admin-root',
  name: 'Cloudbrew Admin',
  role: 'admin',
  email: process.env.ADMIN_BOOTSTRAP_EMAIL || FALLBACK_ADMIN_EMAIL,
  password: process.env.ADMIN_BOOTSTRAP_PASSWORD || FALLBACK_ADMIN_PASSWORD,
  active: true,
};

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

function isValidEmail(emailValue = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(emailValue));
}

function isValidPassword(passwordValue = '') {
  return typeof passwordValue === 'string' && passwordValue.trim().length >= 8;
}

function hashSecret(secret, salt) {
  return crypto.scryptSync(secret, salt, 64).toString('hex');
}

function buildPasswordRecord(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return {
    passwordSalt: salt,
    passwordHash: hashSecret(password, salt),
  };
}

function verifyPassword(password, staffMember) {
  if (!staffMember?.passwordHash || !staffMember?.passwordSalt) {
    return false;
  }

  const computedHash = hashSecret(password, staffMember.passwordSalt);
  const computedBuffer = Buffer.from(computedHash, 'hex');
  const storedBuffer = Buffer.from(staffMember.passwordHash, 'hex');

  if (computedBuffer.length !== storedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(computedBuffer, storedBuffer);
}

function hashPasswordResetToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function isLoopbackHostname(hostname = '') {
  const normalizedHost = String(hostname || '').trim().toLowerCase();
  if (!normalizedHost) {
    return false;
  }

  const bareHost = normalizedHost.startsWith('[') ? normalizedHost.slice(1, normalizedHost.indexOf(']')) : normalizedHost.split(':')[0];

  if (!bareHost) {
    return false;
  }

  if (bareHost === 'localhost' || bareHost === '127.0.0.1' || bareHost === '::1') {
    return true;
  }

  if (bareHost.startsWith('10.')) {
    return true;
  }

  if (bareHost.startsWith('192.168.')) {
    return true;
  }

  const match172 = bareHost.match(/^172\.(\d{1,2})\./);
  if (match172) {
    const secondOctet = Number(match172[1]);
    if (secondOctet >= 16 && secondOctet <= 31) {
      return true;
    }
  }

  return false;
}

function resolveResetPasswordBaseUrl(req) {
  const port = Number(readEnvValue('PORT') || process.env.PORT || 4000);
  const fallbackBase = `http://localhost:${port}/reset-password`;
  const configuredBase = readEnvValue('FRONTEND_URL');

  if (!configuredBase) {
    const forwardedHost = String(req?.headers?.['x-forwarded-host'] || '').trim();
    const host = forwardedHost || String(req?.headers?.host || '').trim();
    if (host && !isLoopbackHostname(host)) {
      const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || req?.protocol || 'http').trim() || 'http';
      return `${forwardedProto}://${host}/reset-password`;
    }

    return fallbackBase;
  }

  try {
    const parsedBase = new URL(configuredBase);
    if (isLoopbackHostname(parsedBase.hostname)) {
      const forwardedHost = String(req?.headers?.['x-forwarded-host'] || '').trim();
      const host = forwardedHost || String(req?.headers?.host || '').trim();
      if (host && !isLoopbackHostname(host)) {
        const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || parsedBase.protocol || req?.protocol || 'http')
          .replace(/:$/, '')
          .trim() || 'http';
        return `${forwardedProto}://${host}/reset-password`;
      }
    }

    return configuredBase;
  } catch (_error) {
    return configuredBase;
  }
}

function buildAdminResetLink(token, req) {
  const configuredBase = resolveResetPasswordBaseUrl(req);

  if (configuredBase.includes('{token}')) {
    return configuredBase.replace('{token}', encodeURIComponent(token));
  }

  const separator = configuredBase.includes('?') ? '&' : '?';
  return `${configuredBase}${separator}token=${encodeURIComponent(token)}`;
}

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderResetPasswordPage({ token = '', message = '', success = false } = {}) {
  const safeToken = escapeHtml(token);
  const safeMessage = escapeHtml(message);
  const title = success ? 'Password Reset Complete' : 'Reset Admin Password';
  const statusToneClass = success ? 'status-success' : 'status-error';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    :root {
      --bg: #f6f2eb;
      --ink: #2a2521;
      --muted: #6f665f;
      --panel: #ffffff;
      --line: #ddd2c4;
      --line-soft: #ece3d7;
      --accent: #6b3f21;
      --accent-dark: #5a341b;
      --focus: #c88f61;
      --shadow: 0 18px 44px rgba(56, 34, 19, 0.12);
      --status-success-bg: #e7f4e9;
      --status-success-text: #205f2b;
      --status-error-bg: #fbe9ea;
      --status-error-text: #812428;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      color: var(--ink);
      background:
        radial-gradient(circle at 12% 8%, #ead7c0 0%, transparent 32%),
        radial-gradient(circle at 88% 92%, #efe2d0 0%, transparent 35%),
        var(--bg);
      font-family: "Segoe UI", "Aptos", "Helvetica Neue", sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 28px 16px;
    }

    .shell {
      width: min(100%, 900px);
      border-radius: 18px;
      overflow: hidden;
      border: 1px solid var(--line);
      box-shadow: var(--shadow);
      display: grid;
      grid-template-columns: 1fr;
      background: var(--panel);
    }

    @media (min-width: 820px) {
      .shell { grid-template-columns: 0.95fr 1.05fr; }
    }

    .brand {
      background: linear-gradient(165deg, #603a20 0%, #7a4b2a 58%, #8a5d38 100%);
      color: #f7f0e6;
      padding: 30px 28px;
      position: relative;
      border-right: 1px solid rgba(255, 255, 255, 0.15);
    }

    .brand-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      letter-spacing: 0.09em;
      text-transform: uppercase;
      border: 1px solid rgba(255, 255, 255, 0.35);
      border-radius: 999px;
      padding: 6px 10px;
      margin-bottom: 16px;
    }

    .brand h2 {
      margin: 0 0 10px;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 34px;
      line-height: 1.05;
      letter-spacing: 0.01em;
    }

    .brand p {
      margin: 0;
      color: rgba(247, 240, 230, 0.9);
      line-height: 1.55;
      max-width: 34ch;
    }

    .panel {
      padding: 28px;
    }

    .panel h1 {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 29px;
      line-height: 1.15;
    }

    .subtitle {
      margin: 10px 0 0;
      color: var(--muted);
      line-height: 1.55;
    }

    .status {
      margin: 16px 0 0;
      border-radius: 10px;
      border: 1px solid transparent;
      padding: 11px 12px;
      line-height: 1.4;
      font-size: 14px;
    }

    .status-success {
      background: var(--status-success-bg);
      color: var(--status-success-text);
      border-color: #b5ddb9;
    }

    .status-error {
      background: var(--status-error-bg);
      color: var(--status-error-text);
      border-color: #efc4c8;
    }

    form { margin-top: 18px; }

    .field {
      margin-top: 13px;
    }

    label {
      display: block;
      margin-bottom: 7px;
      font-size: 14px;
      font-weight: 700;
    }

    input {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 11px 12px;
      font-size: 15px;
      background: #fff;
      color: var(--ink);
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }

    input:focus {
      outline: none;
      border-color: var(--focus);
      box-shadow: 0 0 0 3px rgba(200, 143, 97, 0.22);
    }

    .submit {
      margin-top: 16px;
      width: 100%;
      border: none;
      border-radius: 10px;
      padding: 12px;
      font-weight: 800;
      letter-spacing: 0.01em;
      background: linear-gradient(180deg, #744523 0%, #663b1d 100%);
      color: #fff;
      cursor: pointer;
      transition: transform 0.12s ease, background-color 0.2s ease;
    }

    .submit:hover { background: linear-gradient(180deg, #6b3f21 0%, #5a341b 100%); }
    .submit:active { transform: translateY(1px); }

    .footnote {
      margin-top: 14px;
      border-top: 1px solid var(--line-soft);
      padding-top: 12px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="brand" aria-hidden="true">
      <div class="brand-badge">Cloud Brew Admin</div>
      <h2>Secure Account Recovery</h2>
      <p>This protected flow updates only admin credentials. Cashier and barista accounts remain managed through the admin staff tools.</p>
    </section>

    <section class="panel">
    <h1>${title}</h1>
    <p class="subtitle">Set a new password for your Cloud Brew admin account.</p>
    ${safeMessage ? `<div class="status ${statusToneClass}">${safeMessage}</div>` : ''}
    ${
      success
        ? '<p class="footnote">Return to the app and sign in with your new password.</p>'
        : `<form method="POST" action="/reset-password">
            <input type="hidden" name="token" value="${safeToken}" />
            <div class="field">
              <label for="newPassword">New password</label>
              <input id="newPassword" name="newPassword" type="password" minlength="8" required />
            </div>
            <div class="field">
              <label for="confirmPassword">Confirm password</label>
              <input id="confirmPassword" name="confirmPassword" type="password" minlength="8" required />
            </div>
            <button class="submit" type="submit">Reset Password</button>
          </form>
          <p class="footnote">This secure link expires after 15 minutes.</p>`
    }
    </section>
  </main>
</body>
</html>`;
}

let mailTransport = null;
let dotenvFallback = null;

function readDotenvFallback() {
  if (dotenvFallback) {
    return dotenvFallback;
  }

  try {
    const dotenvPath = path.resolve(process.cwd(), '.env');
    if (!fs.existsSync(dotenvPath)) {
      dotenvFallback = {};
      return dotenvFallback;
    }

    const raw = fs.readFileSync(dotenvPath, 'utf8');
    dotenvFallback = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .reduce((acc, line) => {
        const [key, ...rest] = line.split('=');
        acc[String(key || '').trim()] = rest.join('=').trim();
        return acc;
      }, {});
  } catch (_error) {
    dotenvFallback = {};
  }

  return dotenvFallback;
}

function readEnvValue(name) {
  const runtimeValue = String(process.env[name] || '').trim();
  if (runtimeValue) {
    return runtimeValue;
  }

  const fallback = readDotenvFallback();
  return String(fallback[name] || '').trim();
}

function uploadImageToCloudinary(imageData, { folder = 'cloud-brew/products' } = {}) {
  const cloudName = readEnvValue('CLOUDINARY_CLOUD_NAME');
  const apiKey = readEnvValue('CLOUDINARY_API_KEY');
  const apiSecret = readEnvValue('CLOUDINARY_API_SECRET');

  if (!cloudName || !apiKey || !apiSecret) {
    return Promise.resolve({
      storageProvider: 'inline',
      imageUrl: imageData,
    });
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signatureBase = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash('sha1').update(signatureBase).digest('hex');

  const formData = new URLSearchParams({
    file: imageData,
    api_key: apiKey,
    timestamp: String(timestamp),
    signature,
    folder,
  }).toString();

  const requestOptions = {
    method: 'POST',
    hostname: 'api.cloudinary.com',
    path: `/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(formData),
    },
  };

  return new Promise((resolve, reject) => {
    const cloudinaryReq = https.request(requestOptions, (cloudinaryRes) => {
      let responseBody = '';
      cloudinaryRes.on('data', (chunk) => {
        responseBody += chunk;
      });

      cloudinaryRes.on('end', () => {
        let parsed;
        try {
          parsed = responseBody ? JSON.parse(responseBody) : {};
        } catch (_error) {
          parsed = {};
        }

        if (cloudinaryRes.statusCode >= 200 && cloudinaryRes.statusCode < 300 && parsed.secure_url) {
          // Provide a mobile-optimized URL using Cloudinary URL transformations if possible.
          const secureUrl = String(parsed.secure_url || '');
          let mobileUrl = secureUrl;
          try {
            if (secureUrl.includes('/upload/')) {
              mobileUrl = secureUrl.replace('/upload/', '/upload/c_limit,w_800,q_auto/');
            }
          } catch (_e) {
            mobileUrl = secureUrl;
          }

          return resolve({
            storageProvider: 'cloudinary',
            imageUrl: mobileUrl,
            originalUrl: secureUrl,
          });
        }

        const details = parsed.error?.message || 'Cloudinary upload failed.';
        return reject(createHttpError(502, details));
      });
    });

    cloudinaryReq.on('error', (error) => {
      reject(createHttpError(502, error.message || 'Unable to upload image.'));
    });

    cloudinaryReq.write(formData);
    cloudinaryReq.end();
  });
}

function getMailTransport() {
  if (mailTransport) {
    return mailTransport;
  }

  const user = readEnvValue('EMAIL_USER');
  const pass = readEnvValue('EMAIL_PASS');
  const normalizedPass = pass.replace(/\s+/g, '');
  if (!user || !pass) {
    throw new Error('EMAIL_USER and EMAIL_PASS are required for forgot-password email delivery.');
  }

  const smtpHost = readEnvValue('SMTP_HOST');
  const smtpPort = Number(readEnvValue('SMTP_PORT') || 587);
  const smtpSecure = String(readEnvValue('SMTP_SECURE') || 'false').toLowerCase() === 'true';

  if (smtpHost) {
    mailTransport = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: { user, pass: normalizedPass },
    });
    return mailTransport;
  }

  mailTransport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass: normalizedPass },
  });

  return mailTransport;
}

async function sendAdminResetEmail(recipientEmail, resetLink) {
  const from = readEnvValue('EMAIL_FROM') || readEnvValue('EMAIL_USER');
  const transport = getMailTransport();
  await transport.sendMail({
    from,
    to: recipientEmail,
    subject: 'Cloud Brew Admin Password Reset',
    text: `A password reset was requested for your Cloud Brew admin account.\n\nReset link: ${resetLink}\n\nThis link expires in 15 minutes. If you did not request this, ignore this email.`,
  });
}

function getJwtSecret() {
  return process.env.JWT_SECRET || FALLBACK_JWT_SECRET;
}

const orderSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    item: { type: String, required: true },
    quantity: { type: Number, default: 1, min: 1 },
    size: { type: String, required: true },
    addons: { type: [String], default: [] },
    unitPrice: { type: Number, default: 0, min: 0 },
    addonsTotal: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, default: 0, min: 0 },
    paymentStatus: {
      type: String,
      enum: [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.PAID, PAYMENT_STATUS.REFUNDED],
      default: PAYMENT_STATUS.PAID,
    },
    status: {
      type: String,
      enum: [ORDER_STATUS.PENDING, ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.COMPLETED],
      default: ORDER_STATUS.PENDING,
    },
    createdBy: { type: String, required: true },
    handledBy: { type: String },
    completedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

orderSchema.index({ status: 1, paymentStatus: 1, createdAt: -1 });
orderSchema.index({ completedAt: -1 });
orderSchema.index({ item: 1, createdAt: -1 });
orderSchema.index({ createdBy: 1, createdAt: -1 });
orderSchema.index({ handledBy: 1, createdAt: -1 });

const recipeSchema = new mongoose.Schema(
  {
    drinkName: { type: String, required: true, unique: true },
    ingredients: { type: [String], default: [] },
    steps: { type: [String], default: [] },
    imageUrl: { type: String, default: '' },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

const staffSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    role: { type: String, enum: ['cashier', 'barista', 'admin'], required: true },
    email: { type: String, required: true, unique: true },
    recoveryEmail: { type: String, default: '' },
    passwordHash: { type: String, required: true },
    passwordSalt: { type: String, required: true },
    resetCodeHash: { type: String, default: '' },
    resetCodeExpiresAt: { type: Date },
    active: { type: Boolean, default: true },
  },
  { versionKey: false }
);

const passwordResetTokenSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    adminId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const auditLogSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    action: { type: String, required: true },
    actor: { type: String, required: true },
    details: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

const Order = mongoose.model('Order', orderSchema);
const Recipe = mongoose.model('Recipe', recipeSchema);
const Staff = mongoose.model('Staff', staffSchema);
const PasswordResetToken = mongoose.model('PasswordResetToken', passwordResetTokenSchema);
const AuditLog = mongoose.model('AuditLog', auditLogSchema);

let realtimeQueueServer = null;
let pusherClient = null;

function getPusherClient() {
  if (pusherClient) {
    return pusherClient;
  }

  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET || !PUSHER_CLUSTER) {
    return null;
  }

  pusherClient = new Pusher({
    appId: PUSHER_APP_ID,
    key: PUSHER_KEY,
    secret: PUSHER_SECRET,
    cluster: PUSHER_CLUSTER,
    useTLS: true,
  });

  return pusherClient;
}

function toSocketPayload(orderDoc = {}, eventType, actor = 'system') {
  return {
    eventId: generateId('EVT'),
    eventType,
    occurredAt: new Date().toISOString(),
    actor,
    order: orderDoc,
  };
}

function broadcastQueueEvent(orderDoc, eventType, actor = 'system') {
  if (!orderDoc) {
    return;
  }

  const payload = toSocketPayload(orderDoc, eventType, actor);

  if (realtimeQueueServer) {
    ['cashier', 'barista', 'admin'].forEach((role) => {
      realtimeQueueServer.to(`role:${role}`).emit('queue.event', payload);
    });
  }

  const pusher = getPusherClient();
  if (pusher) {
    pusher.trigger(PUSHER_CHANNEL, eventType, payload).catch((error) => {
      console.error('Failed to publish Pusher queue event:', error.message || error);
      if (SENTRY_DSN) {
        Sentry.captureException(error, {
          tags: { component: 'pusher', eventType },
        });
      }
    });
  }
}

function configureRealtimeQueue(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    path: '/socket.io',
  });

  io.use((socket, next) => {
    try {
      const authToken = String(socket.handshake?.auth?.token || '').trim();
      const headerToken = readBearerToken(String(socket.handshake?.headers?.authorization || ''));
      const token = authToken || headerToken;

      if (!token) {
        return next(new Error('Authentication token is required.'));
      }

      socket.user = jwt.verify(token, getJwtSecret());
      return next();
    } catch (_error) {
      return next(new Error('Invalid or expired token.'));
    }
  });

  io.on('connection', (socket) => {
    const role = socket.user?.role;
    if (role) {
      socket.join(`role:${role}`);
    }

    socket.emit('queue.ready', {
      ok: true,
      connectedAt: new Date().toISOString(),
    });
  });

  realtimeQueueServer = io;
  return io;
}

function generateId(prefix) {
  const random = Math.floor(Math.random() * 9000) + 1000;
  return `${prefix}-${Date.now()}-${random}`;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

function parsePagination(pageValue, pageSizeValue, defaultPageSize) {
  const page = parsePositiveInt(pageValue, 1);
  const pageSize = Math.min(parsePositiveInt(pageSizeValue, defaultPageSize), MAX_PAGE_SIZE);
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
  };
}

function buildPaginationMeta(total, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    total,
    page,
    pageSize,
    totalPages,
  };
}

function normalizeTimeZone(value = '') {
  const timeZone = String(value || '').trim();
  if (!timeZone) {
    return 'Asia/Manila';
  }

  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return timeZone;
  } catch (_error) {
    return 'Asia/Manila';
  }
}

function parseAnalyticsDateRange(query = {}) {
  const now = new Date();
  const to = query.to ? new Date(query.to) : now;
  const from = query.from
    ? new Date(query.from)
    : new Date(now.getTime() - DEFAULT_ANALYTICS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw createHttpError(400, 'Invalid analytics date range. Use ISO date values for from/to.');
  }

  if (from > to) {
    throw createHttpError(400, '`from` must be earlier than `to`.');
  }

  return { from, to };
}

function resolveGroupBy(value = '') {
  const groupBy = String(value || '').trim().toLowerCase() || 'day';
  if (!ANALYTICS_GROUP_BY_OPTIONS.has(groupBy)) {
    return 'day';
  }
  return groupBy;
}

function getBucketFormat(groupBy) {
  if (groupBy === 'hour') {
    return '%Y-%m-%d %H:00';
  }

  if (groupBy === 'week') {
    return '%G-W%V';
  }

  return '%Y-%m-%d';
}

function calculateOrderPricing({ item = '', size = 'Medium', addons = [], quantity = 1 } = {}) {
  const normalizedQuantity = Number.isFinite(Number(quantity)) ? Math.max(1, Math.floor(Number(quantity))) : 1;
  const basePrice = DRINK_BASE_PRICES[item] || 120;
  const sizeMultiplier = SIZE_MULTIPLIER[size] || SIZE_MULTIPLIER.Medium;
  const addOnCount = Array.isArray(addons) ? addons.length : 0;

  const unitPrice = Math.round(basePrice * sizeMultiplier);
  const addonsTotal = addOnCount * ADD_ON_PRICE;
  const totalAmount = normalizedQuantity * (unitPrice + addonsTotal);

  return {
    unitPrice,
    addonsTotal,
    totalAmount,
  };
}

function escapeRegex(value = '') {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toCollectionResult(items, meta, extras = {}) {
  return {
    items,
    ...meta,
    ...extras,
  };
}

function toCollectionMeta(result = {}) {
  return {
    total: result.total || 0,
    page: result.page || 1,
    pageSize: result.pageSize || DEFAULT_STAFF_PAGE_SIZE,
    totalPages: result.totalPages || 1,
    query: result.query || '',
  };
}

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      role: user.role,
      email: user.email,
    },
    getJwtSecret(),
    { expiresIn: JWT_EXPIRATION }
  );
}

function getLanIpv4Addresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  Object.values(interfaces).forEach((items) => {
    (items || []).forEach((entry) => {
      if (entry?.family === 'IPv4' && !entry.internal && entry.address) {
        addresses.push(entry.address);
      }
    });
  });

  return [...new Set(addresses)];
}

function toPublicStaff(staffMember = {}) {
  return {
    id: staffMember.id,
    name: staffMember.name,
    role: staffMember.role,
    email: staffMember.email,
    recoveryEmail: staffMember.role === 'admin' ? staffMember.recoveryEmail || '' : undefined,
    active: Boolean(staffMember.active),
  };
}

function readBearerToken(headerValue = '') {
  const [scheme, token] = headerValue.trim().split(/\s+/);
  if (scheme !== 'Bearer' || !token) {
    return '';
  }
  return token;
}

function authenticate(req, res, next) {
  const token = readBearerToken(req.headers.authorization || '');
  if (!token) {
    return res.status(401).json({ message: 'Authentication token is required.' });
  }

  try {
    req.user = jwt.verify(token, getJwtSecret());
    return next();
  } catch (_error) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication token is required.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to perform this action.' });
    }

    return next();
  };
}

function summarizeOrders(orders = []) {
  return orders.reduce(
    (summary, order) => {
      summary.total += 1;
      summary[order.status] = (summary[order.status] || 0) + 1;
      return summary;
    },
    { total: 0, [ORDER_STATUS.PENDING]: 0, [ORDER_STATUS.IN_PROGRESS]: 0, [ORDER_STATUS.COMPLETED]: 0 }
  );
}

function mapRecipes(recipeDocs) {
  return recipeDocs.reduce((acc, recipe) => {
    acc[recipe.drinkName] = {
      ingredients: recipe.ingredients,
      steps: recipe.steps,
      imageUrl: recipe.imageUrl || '',
    };
    return acc;
  }, {});
}

async function queryStaff({ query = '', role = 'all', active = 'all', page = 1, pageSize = DEFAULT_STAFF_PAGE_SIZE } = {}) {
  const pagination = parsePagination(page, pageSize, DEFAULT_STAFF_PAGE_SIZE);
  const filters = {};

  if (['cashier', 'barista'].includes(role)) {
    filters.role = role;
  } else {
    filters.role = { $in: ['cashier', 'barista'] };
  }

  if (active === 'true') {
    filters.active = true;
  }

  if (active === 'false') {
    filters.active = false;
  }

  const normalizedQuery = query.trim();
  if (normalizedQuery) {
    const pattern = new RegExp(escapeRegex(normalizedQuery), 'i');
    filters.$or = [{ name: pattern }, { id: pattern }, { role: pattern }, { email: pattern }];
  }

  const [items, total] = await Promise.all([
    Staff.find(filters, { _id: 0, passwordHash: 0, passwordSalt: 0, resetCodeHash: 0, resetCodeExpiresAt: 0 })
      .sort({ name: 1 })
      .skip(pagination.skip)
      .limit(pagination.pageSize)
      .lean(),
    Staff.countDocuments(filters),
  ]);

  return toCollectionResult(items, buildPaginationMeta(total, pagination.page, pagination.pageSize), {
    query: normalizedQuery,
    role: ['cashier', 'barista'].includes(role) ? role : 'all',
    active: typeof filters.active === 'boolean' ? String(filters.active) : 'all',
  });
}

async function queryLogs({ query = '', action = 'all', page = 1, pageSize = DEFAULT_LOG_PAGE_SIZE } = {}) {
  const pagination = parsePagination(page, pageSize, DEFAULT_LOG_PAGE_SIZE);
  const filters = {};

  if (action && action !== 'all') {
    filters.action = action;
  }

  const normalizedQuery = query.trim();
  if (normalizedQuery) {
    const pattern = new RegExp(escapeRegex(normalizedQuery), 'i');
    filters.$or = [{ action: pattern }, { actor: pattern }, { details: pattern }, { id: pattern }];
  }

  const [items, total] = await Promise.all([
    AuditLog.find(filters, { _id: 0 })
      .sort({ timestamp: -1 })
      .skip(pagination.skip)
      .limit(pagination.pageSize)
      .lean(),
    AuditLog.countDocuments(filters),
  ]);

  return toCollectionResult(items, buildPaginationMeta(total, pagination.page, pagination.pageSize), {
    query: normalizedQuery,
    action: filters.action || 'all',
  });
}

function buildAnalyticsMatch({ from, to, cashier, barista } = {}) {
  const match = {
    createdAt: { $gte: from, $lte: to },
    paymentStatus: { $in: [PAYMENT_STATUS.PAID, null] },
  };

  if (cashier) {
    match.createdBy = cashier;
  }

  if (barista) {
    match.handledBy = barista;
  }

  return match;
}

function revenueExpression() {
  return {
    $ifNull: [
      '$totalAmount',
      {
        $multiply: [{ $ifNull: ['$quantity', 1] }, { $ifNull: ['$unitPrice', 120] }],
      },
    ],
  };
}

async function querySalesAnalytics({ from, to, groupBy, timeZone, cashier, barista } = {}) {
  const bucketFormat = getBucketFormat(groupBy);
  const match = buildAnalyticsMatch({ from, to, cashier, barista });

  const [summary] = await Order.aggregate([
    { $match: match },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: revenueExpression() },
              totalOrders: { $sum: 1 },
              totalDrinks: { $sum: { $ifNull: ['$quantity', 1] } },
            },
          },
        ],
        series: [
          {
            $group: {
              _id: {
                $dateToString: {
                  format: bucketFormat,
                  date: '$createdAt',
                  timezone: timeZone,
                },
              },
              revenue: { $sum: revenueExpression() },
              orders: { $sum: 1 },
              drinks: { $sum: { $ifNull: ['$quantity', 1] } },
            },
          },
          { $sort: { _id: 1 } },
          {
            $project: {
              _id: 0,
              bucket: '$_id',
              revenue: 1,
              orders: 1,
              drinks: 1,
            },
          },
        ],
      },
    },
  ]);

  const totals = summary?.totals?.[0] || { totalRevenue: 0, totalOrders: 0, totalDrinks: 0 };
  return {
    range: {
      from: from.toISOString(),
      to: to.toISOString(),
      groupBy,
      timeZone,
    },
    summary: {
      totalRevenue: Number(totals.totalRevenue || 0),
      totalOrders: Number(totals.totalOrders || 0),
      totalDrinks: Number(totals.totalDrinks || 0),
      avgOrderValue: Number(totals.totalOrders ? totals.totalRevenue / totals.totalOrders : 0),
    },
    series: summary?.series || [],
  };
}

async function queryTopItemsAnalytics({ from, to, limit = 10 } = {}) {
  const safeLimit = Math.min(parsePositiveInt(limit, 10), 30);
  const result = await Order.aggregate([
    { $match: buildAnalyticsMatch({ from, to }) },
    {
      $group: {
        _id: '$item',
        orders: { $sum: 1 },
        drinks: { $sum: { $ifNull: ['$quantity', 1] } },
        revenue: { $sum: revenueExpression() },
      },
    },
    { $sort: { revenue: -1, drinks: -1 } },
    { $limit: safeLimit },
    {
      $project: {
        _id: 0,
        item: '$_id',
        orders: 1,
        drinks: 1,
        revenue: 1,
      },
    },
  ]);

  return {
    range: {
      from: from.toISOString(),
      to: to.toISOString(),
    },
    items: result,
  };
}

async function queryStaffKpis({ from, to } = {}) {
  const [cashierKpis, baristaKpis] = await Promise.all([
    Order.aggregate([
      { $match: buildAnalyticsMatch({ from, to }) },
      {
        $group: {
          _id: '$createdBy',
          orders: { $sum: 1 },
          revenue: { $sum: revenueExpression() },
          drinks: { $sum: { $ifNull: ['$quantity', 1] } },
        },
      },
      { $sort: { revenue: -1 } },
      {
        $project: {
          _id: 0,
          staff: { $ifNull: ['$_id', 'Unknown'] },
          orders: 1,
          revenue: 1,
          drinks: 1,
          avgTicket: {
            $cond: [{ $gt: ['$orders', 0] }, { $divide: ['$revenue', '$orders'] }, 0],
          },
        },
      },
    ]),
    Order.aggregate([
      {
        $match: {
          ...buildAnalyticsMatch({ from, to }),
          status: ORDER_STATUS.COMPLETED,
          handledBy: { $exists: true, $ne: null },
        },
      },
      {
        $addFields: {
          prepMinutes: {
            $divide: [{ $subtract: [{ $ifNull: ['$completedAt', '$updatedAt'] }, '$createdAt'] }, 60000],
          },
        },
      },
      {
        $group: {
          _id: '$handledBy',
          completedOrders: { $sum: 1 },
          avgPrepMinutes: { $avg: '$prepMinutes' },
        },
      },
      { $sort: { completedOrders: -1 } },
      {
        $project: {
          _id: 0,
          staff: { $ifNull: ['$_id', 'Unassigned'] },
          completedOrders: 1,
          avgPrepMinutes: 1,
        },
      },
    ]),
  ]);

  return {
    range: {
      from: from.toISOString(),
      to: to.toISOString(),
    },
    cashiers: cashierKpis,
    baristas: baristaKpis,
  };
}

async function queryQueueHealth() {
  const [pendingCount, inProgressCount, waitMetrics] = await Promise.all([
    Order.countDocuments({ status: ORDER_STATUS.PENDING }),
    Order.countDocuments({ status: ORDER_STATUS.IN_PROGRESS }),
    Order.aggregate([
      {
        $match: {
          status: { $in: [ORDER_STATUS.PENDING, ORDER_STATUS.IN_PROGRESS] },
        },
      },
      {
        $addFields: {
          waitMinutes: {
            $divide: [{ $subtract: [new Date(), '$createdAt'] }, 60000],
          },
        },
      },
      {
        $group: {
          _id: '$status',
          avgWaitMinutes: { $avg: '$waitMinutes' },
          maxWaitMinutes: { $max: '$waitMinutes' },
        },
      },
    ]),
  ]);

  const findMetric = (status, key) => {
    const row = waitMetrics.find((metric) => metric._id === status);
    return Number(row?.[key] || 0);
  };

  return {
    asOf: new Date().toISOString(),
    queue: {
      pending: pendingCount,
      inProgress: inProgressCount,
      totalActive: pendingCount + inProgressCount,
    },
    waitTimes: {
      pendingAvgMinutes: findMetric(ORDER_STATUS.PENDING, 'avgWaitMinutes'),
      pendingMaxMinutes: findMetric(ORDER_STATUS.PENDING, 'maxWaitMinutes'),
      inProgressAvgMinutes: findMetric(ORDER_STATUS.IN_PROGRESS, 'avgWaitMinutes'),
      inProgressMaxMinutes: findMetric(ORDER_STATUS.IN_PROGRESS, 'maxWaitMinutes'),
    },
  };
}

async function queryAnalyticsOverview({ from, to, groupBy, timeZone, cashier, barista, topItemsLimit } = {}) {
  const [sales, topItems, staffKpis, queueHealth] = await Promise.all([
    querySalesAnalytics({ from, to, groupBy, timeZone, cashier, barista }),
    queryTopItemsAnalytics({ from, to, limit: topItemsLimit }),
    queryStaffKpis({ from, to }),
    queryQueueHealth(),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    sales,
    topItems,
    staffKpis,
    queueHealth,
  };
}

async function writeAuditLog(action, actor, details = '') {
  await AuditLog.create({
    id: generateId('LOG'),
    action,
    actor,
    details,
    timestamp: new Date(),
  });
}

async function performAdminPasswordReset(token, newPassword) {
  if (!token || typeof token !== 'string') {
    throw createHttpError(400, 'Reset token is required.');
  }

  if (!isValidPassword(newPassword)) {
    throw createHttpError(400, 'New password must be at least 8 characters.');
  }

  const resetToken = await PasswordResetToken.findOne(
    {
      tokenHash: hashPasswordResetToken(token),
      usedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { _id: 0, id: 1, adminId: 1 }
  ).lean();

  if (!resetToken) {
    throw createHttpError(400, 'Invalid or expired reset token.');
  }

  const staffMember = await Staff.findOne(
    { id: resetToken.adminId, role: 'admin', active: true },
    { _id: 0, id: 1, name: 1 }
  ).lean();

  if (!staffMember) {
    await PasswordResetToken.deleteMany({ adminId: resetToken.adminId });
    throw createHttpError(400, 'Admin account is no longer available for reset.');
  }

  await Staff.updateOne(
    { id: resetToken.adminId },
    {
      $set: buildPasswordRecord(newPassword.trim()),
      $unset: {
        resetCodeHash: '',
        resetCodeExpiresAt: '',
      },
    }
  );

  await PasswordResetToken.deleteMany({ adminId: resetToken.adminId });
  await writeAuditLog('ADMIN_PASSWORD_RESET', staffMember.name, 'Password reset via forgot-password flow.');
}

async function seedDefaults() {
  const recipeCount = await Recipe.countDocuments();

  await Promise.all(
    DEFAULT_STAFF.map((member) =>
      Staff.updateOne(
        { id: member.id },
        {
          $setOnInsert: {
            ...buildPasswordRecord(member.password),
          },
          $set: {
            name: member.name,
            role: member.role,
            email: normalizeEmail(member.email),
            active: true,
          },
        },
        { upsert: true }
      )
    )
  );

  const seededStaffAccounts = await Staff.find(
    { id: { $in: DEFAULT_STAFF.map((member) => member.id) } },
    { _id: 0, id: 1, passwordHash: 1, passwordSalt: 1 }
  ).lean();

  await Promise.all(
    seededStaffAccounts
      .filter((member) => !member?.passwordHash || !member?.passwordSalt)
      .map((member) => {
        const defaults = DEFAULT_STAFF.find((item) => item.id === member.id);
        if (!defaults) {
          return Promise.resolve();
        }

        return Staff.updateOne(
          { id: member.id },
          {
            $set: buildPasswordRecord(defaults.password),
          }
        );
      })
  );

  const normalizedAdminEmail = normalizeEmail(ROOT_ADMIN_ACCOUNT.email);
  const seededRecoveryEmail = normalizeEmail(process.env.ADMIN_RECOVERY_EMAIL || process.env.EMAIL_USER || '');
  await Staff.updateOne(
    { id: ROOT_ADMIN_ACCOUNT.id },
    {
      $setOnInsert: {
        ...buildPasswordRecord(ROOT_ADMIN_ACCOUNT.password),
        recoveryEmail: seededRecoveryEmail,
      },
      $set: {
        name: ROOT_ADMIN_ACCOUNT.name,
        role: ROOT_ADMIN_ACCOUNT.role,
        email: normalizedAdminEmail,
        active: true,
      },
    },
    { upsert: true }
  );

  const rootAccount = await Staff.findOne(
    { id: ROOT_ADMIN_ACCOUNT.id },
    { _id: 0, passwordHash: 1, passwordSalt: 1, recoveryEmail: 1 }
  ).lean();
  if (!rootAccount?.passwordHash || !rootAccount?.passwordSalt) {
    await Staff.updateOne(
      { id: ROOT_ADMIN_ACCOUNT.id },
      {
        $set: buildPasswordRecord(ROOT_ADMIN_ACCOUNT.password),
      }
    );
  }

  if (!normalizeEmail(rootAccount?.recoveryEmail || '') && seededRecoveryEmail) {
    await Staff.updateOne(
      { id: ROOT_ADMIN_ACCOUNT.id },
      {
        $set: { recoveryEmail: seededRecoveryEmail },
      }
    );
  }

  const legacyStaff = await Staff.find(
    {
      role: { $in: ['cashier', 'barista'] },
      $or: [{ email: { $exists: false } }, { passwordHash: { $exists: false } }, { passwordSalt: { $exists: false } }],
    },
    { _id: 0, id: 1, role: 1, pin: 1, email: 1 }
  ).lean();

  await Promise.all(
    legacyStaff.map(async (member) => {
      const fallbackEmail = member.email ? normalizeEmail(member.email) : `${member.role}.${member.id}@cloudbrew.local`;
      const fallbackPassword = member.pin ? `Legacy${member.pin}!` : `${member.role}12345!`;
      await Staff.updateOne(
        { id: member.id },
        {
          $set: {
            email: fallbackEmail,
            ...buildPasswordRecord(fallbackPassword),
          },
          $unset: {
            pin: '',
          },
        }
      );
    })
  );

  if (recipeCount === 0) {
    const docs = Object.entries(DEFAULT_RECIPES).map(([drinkName, recipe]) => ({
      drinkName,
      ingredients: recipe.ingredients,
      steps: recipe.steps,
      updatedAt: new Date(),
    }));
    await Recipe.insertMany(docs);
  }
}

async function getBootstrapPayload(user) {
  const [orders, recipeDocs] = await Promise.all([
    Order.find({}, { _id: 0 }).sort({ updatedAt: -1 }).lean(),
    Recipe.find({}, { _id: 0 }).sort({ drinkName: 1 }).lean(),
  ]);

  if (user.role === 'admin') {
    const adminAccount = await Staff.findOne(
      { id: user.id, role: 'admin' },
      { _id: 0, recoveryEmail: 1 }
    ).lean();

    const [staffResult, logsResult] = await Promise.all([
      queryStaff({ page: 1, pageSize: DEFAULT_STAFF_PAGE_SIZE }),
      queryLogs({ page: 1, pageSize: DEFAULT_LOG_PAGE_SIZE }),
    ]);

    return {
      orders,
      recipes: mapRecipes(recipeDocs),
      logs: logsResult.items,
      logsMeta: toCollectionMeta({ ...logsResult, pageSize: DEFAULT_LOG_PAGE_SIZE }),
      staff: staffResult.items,
      staffMeta: toCollectionMeta({ ...staffResult, pageSize: DEFAULT_STAFF_PAGE_SIZE }),
      adminSettings: {
        recoveryEmail: adminAccount?.recoveryEmail || '',
        recoveryEmailConfigured: Boolean(adminAccount?.recoveryEmail),
      },
    };
  }

  return {
    orders,
    recipes: mapRecipes(recipeDocs),
    logs: [],
    logsMeta: toCollectionMeta({ total: 0, pageSize: DEFAULT_LOG_PAGE_SIZE }),
    staff: [],
    staffMeta: toCollectionMeta({ total: 0, pageSize: DEFAULT_STAFF_PAGE_SIZE }),
    adminSettings: {
      recoveryEmail: '',
      recoveryEmailConfigured: false,
    },
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/bootstrap', authenticate, async (req, res, next) => {
  try {
    const payload = await getBootstrapPayload(req.user);
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { role, email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required.' });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: 'A valid email is required.' });
    }

    const filters = { email: normalizedEmail, active: true };
    if (role) {
      filters.role = role;
    }

    const staffMember = await Staff.findOne(filters, {
      _id: 0,
      passwordHash: 1,
      passwordSalt: 1,
      id: 1,
      name: 1,
      role: 1,
      email: 1,
      active: 1,
    }).lean();

    if (!staffMember || !verifyPassword(password, staffMember)) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const user = toPublicStaff(staffMember);
    await writeAuditLog('LOGIN', user.name, `Logged in as ${user.role}`);
    const token = signToken(user);
    res.json({ token, user });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/forgot-password', async (req, res, next) => {
  const adminRecoveryHandler = createAdminRecoveryHandler({
    Staff,
    PasswordResetToken,
    normalizeEmail,
    isValidEmail,
    sendAdminResetEmail,
    buildAdminResetLink,
    writeAuditLog,
    createHttpError,
    hashPasswordResetToken,
    generateId,
    resetTokenTtlMs: RESET_TOKEN_TTL_MS,
  });

  return adminRecoveryHandler(req, res, next);
});

const adminRecoveryHandler = createAdminRecoveryHandler({
  Staff,
  PasswordResetToken,
  normalizeEmail,
  isValidEmail,
  sendAdminResetEmail,
  buildAdminResetLink,
  writeAuditLog,
  createHttpError,
  hashPasswordResetToken,
  generateId,
  resetTokenTtlMs: RESET_TOKEN_TTL_MS,
});

app.post('/admin-recovery', adminRecoveryHandler);
// Alias for API-style route to meet frontend/clients expecting /api/admin-recovery
app.post('/api/admin-recovery', adminRecoveryHandler);

app.get('/api/products', authenticate, requireRole('cashier', 'barista', 'admin'), async (_req, res, next) => {
  try {
    const recipeDocs = await Recipe.find({}, { _id: 0 }).sort({ drinkName: 1 }).lean();
    const items = recipeDocs.map((recipe) => ({
      name: recipe.drinkName,
      ingredients: recipe.ingredients || [],
      steps: recipe.steps || [],
      imageUrl: recipe.imageUrl || '',
      updatedAt: recipe.updatedAt || null,
    }));

    res.json({ items, total: items.length });
  } catch (error) {
    next(error);
  }
});

app.post('/api/uploads/product-image', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { imageData } = req.body || {};
    const normalizedImageData = typeof imageData === 'string' ? imageData.trim() : '';

    if (!normalizedImageData || !normalizedImageData.startsWith('data:image/')) {
      return res.status(400).json({ message: 'imageData must be a valid base64 data URI image.' });
    }

    if (normalizedImageData.length > MAX_RECIPE_IMAGE_LENGTH) {
      return res.status(400).json({ message: 'Product image is too large. Please choose a smaller file.' });
    }

    const uploaded = await uploadImageToCloudinary(normalizedImageData);
    await writeAuditLog('PRODUCT_IMAGE_UPLOADED', req.user.name, `Provider: ${uploaded.storageProvider}`);
    return res.status(201).json({
      success: true,
      imageUrl: uploaded.imageUrl,
      storageProvider: uploaded.storageProvider,
    });
  } catch (error) {
    next(error);
  }
});

app.put('/api/products/:productName', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { productName } = req.params;
    const { ingredients = [], steps = [], imageUrl = '' } = req.body || {};

    if (!productName) {
      return res.status(400).json({ message: 'productName is required.' });
    }

    const normalizedImageUrl = typeof imageUrl === 'string' ? imageUrl.trim() : '';
    if (normalizedImageUrl.length > MAX_RECIPE_IMAGE_LENGTH) {
      return res.status(400).json({ message: 'Product image is too large. Please choose a smaller file.' });
    }

    const recipe = await Recipe.findOneAndUpdate(
      { drinkName: productName },
      { ingredients, steps, imageUrl: normalizedImageUrl, updatedAt: new Date() },
      { returnDocument: 'after', upsert: true, projection: { _id: 0 } }
    ).lean();

    await writeAuditLog('PRODUCT_UPDATED', req.user.name, productName);
    return res.json({
      name: recipe.drinkName,
      ingredients: recipe.ingredients || [],
      steps: recipe.steps || [],
      imageUrl: recipe.imageUrl || '',
      updatedAt: recipe.updatedAt || null,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/reset-password', async (req, res) => {
  const token = String(req.query.token || '').trim();
  if (!token) {
    return res.status(400).send(renderResetPasswordPage({ message: 'Reset token is missing from this link.' }));
  }

  return res.status(200).send(renderResetPasswordPage({ token }));
});

app.post('/reset-password', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const newPassword = String(req.body?.newPassword || '');
  const confirmPassword = String(req.body?.confirmPassword || '');

  if (!token) {
    return res.status(400).send(renderResetPasswordPage({ message: 'Reset token is required.' }));
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).send(renderResetPasswordPage({ token, message: 'Password confirmation does not match.' }));
  }

  try {
    await performAdminPasswordReset(token, newPassword);
    return res.status(200).send(renderResetPasswordPage({ success: true, message: 'Password reset successful. You can now sign in to Cloud Brew.' }));
  } catch (error) {
    const status = Number(error?.status) || 400;
    return res.status(status).send(renderResetPasswordPage({ token, message: error.message || 'Unable to reset password.' }));
  }
});

app.post('/api/auth/reset-password', async (req, res, next) => {
  try {
    const { token, newPassword } = req.body || {};
    await performAdminPasswordReset(token, newPassword);
    res.json({ ok: true });
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
});

app.post('/api/auth/change-password', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { oldPassword, currentPassword, newPassword } = req.body || {};
    const existingPassword = oldPassword || currentPassword;

    if (!existingPassword || !newPassword) {
      return res.status(400).json({ message: 'oldPassword and newPassword are required.' });
    }

    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ message: 'New password must be at least 8 characters.' });
    }

    const staffMember = await Staff.findOne(
      { id: req.user.id, role: 'admin', active: true },
      { _id: 0, id: 1, name: 1, passwordHash: 1, passwordSalt: 1 }
    ).lean();

    if (!staffMember || !verifyPassword(existingPassword, staffMember)) {
      return res.status(401).json({ message: 'Current password is incorrect.' });
    }

    await Staff.updateOne({ id: staffMember.id }, { $set: buildPasswordRecord(newPassword.trim()) });
    await writeAuditLog('ADMIN_PASSWORD_CHANGED', staffMember.name, 'Password changed from admin console.');
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.put('/api/auth/recovery-email', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { recoveryEmail } = req.body || {};
    const normalizedRecoveryEmail = normalizeEmail(recoveryEmail);

    if (!isValidEmail(normalizedRecoveryEmail)) {
      return res.status(400).json({ message: 'A valid recoveryEmail is required.' });
    }

    const currentAdmin = await Staff.findOne(
      { id: req.user.id, role: 'admin', active: true },
      { _id: 0, id: 1, name: 1, role: 1, recoveryEmail: 1 }
    ).lean();

    if (!currentAdmin) {
      return res.status(404).json({ message: 'Admin account not found.' });
    }

    if (normalizeEmail(currentAdmin.recoveryEmail || '') === normalizedRecoveryEmail) {
      return res.json({ recoveryEmail: normalizedRecoveryEmail, recoveryEmailConfigured: true, message: 'Recovery email is already configured.' });
    }

    const conflict = await Staff.findOne(
      {
        id: { $ne: req.user.id },
        $or: [{ email: normalizedRecoveryEmail }, { recoveryEmail: normalizedRecoveryEmail }],
      },
      { _id: 0, id: 1, role: 1, email: 1, recoveryEmail: 1 }
    ).lean();

    if (conflict) {
      return res.status(409).json({ message: 'Recovery email already exists in another account. Use a different email.' });
    }

    const updated = await Staff.findOneAndUpdate(
      { id: req.user.id, role: 'admin', active: true },
      { recoveryEmail: normalizedRecoveryEmail },
      { returnDocument: 'after', projection: { _id: 0, id: 1, name: 1, role: 1, recoveryEmail: 1 } }
    ).lean();

    await writeAuditLog('ADMIN_RECOVERY_EMAIL_UPDATED', req.user.name, `Recovery email set to ${normalizedRecoveryEmail}`);
    res.json({ recoveryEmail: updated.recoveryEmail, recoveryEmailConfigured: Boolean(updated.recoveryEmail) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/orders', authenticate, requireRole('cashier', 'admin'), async (req, res, next) => {
  try {
    const { item, size, addons = [], quantity = 1 } = req.body || {};
    if (!item || !size) {
      return res.status(400).json({ message: 'item and size are required.' });
    }

    const normalizedQuantity = Number.isFinite(Number(quantity)) ? Math.max(1, Math.floor(Number(quantity))) : 1;
    const pricing = calculateOrderPricing({ item, size, addons, quantity: normalizedQuantity });

    const order = await Order.create({
      id: generateId('ORD'),
      item,
      quantity: normalizedQuantity,
      size,
      addons,
      unitPrice: pricing.unitPrice,
      addonsTotal: pricing.addonsTotal,
      totalAmount: pricing.totalAmount,
      paymentStatus: PAYMENT_STATUS.PAID,
      status: ORDER_STATUS.PENDING,
      createdBy: req.user.name,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await writeAuditLog('ORDER_CREATED', req.user.name, `${order.id} ${normalizedQuantity}x ${item} (${size})`);
    const payload = order.toObject({ versionKey: false, transform: (_doc, ret) => {
      delete ret._id;
      return ret;
    } });

    broadcastQueueEvent(payload, 'queue.order.created', req.user.name);
    res.status(201).json(payload);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/orders/:orderId/status', authenticate, requireRole('barista', 'admin'), async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body || {};

    if (![ORDER_STATUS.PENDING, ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.COMPLETED].includes(status)) {
      return res.status(400).json({ message: 'Invalid order status.' });
    }

    const existing = await Order.findOne({ id: orderId }, { _id: 0 }).lean();
    if (!existing) {
      return res.status(404).json({ message: 'Order not found.' });
    }

    if (existing.status === ORDER_STATUS.COMPLETED) {
      return res.status(400).json({ message: 'Completed items are locked and cannot be modified.' });
    }

    const isAdmin = req.user.role === 'admin';
    const isAssignedBarista = existing.handledBy && existing.handledBy === req.user.name;

    if (!isAdmin && existing.status === ORDER_STATUS.IN_PROGRESS && !isAssignedBarista) {
      return res.status(403).json({ message: `In progress by ${existing.handledBy}. Only the assigned barista can modify this item.` });
    }

    if (status === ORDER_STATUS.IN_PROGRESS && existing.status !== ORDER_STATUS.PENDING) {
      return res.status(400).json({ message: 'Only pending items can be started.' });
    }

    if (status === ORDER_STATUS.COMPLETED && existing.status !== ORDER_STATUS.IN_PROGRESS) {
      return res.status(400).json({ message: 'Start the item before completing it.' });
    }

    const nextHandledBy =
      status === ORDER_STATUS.IN_PROGRESS
        ? req.user.name
        : existing.handledBy || req.user.name;
    const completedAt = status === ORDER_STATUS.COMPLETED ? new Date() : null;

    const order = await Order.findOneAndUpdate(
      { id: orderId },
      { status, handledBy: nextHandledBy, completedAt, updatedAt: new Date() },
      { returnDocument: 'after', projection: { _id: 0 } }
    ).lean();

    await writeAuditLog('ORDER_STATUS_CHANGED', req.user.name, `${orderId} -> ${status}`);
    broadcastQueueEvent(order, 'queue.order.updated', req.user.name);
    res.json(order);
  } catch (error) {
    next(error);
  }
});

app.put('/api/recipes/:drinkName', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { drinkName } = req.params;
    const { ingredients = [], steps = [], imageUrl = '' } = req.body || {};

    if (!drinkName) {
      return res.status(400).json({ message: 'drinkName is required.' });
    }

    const normalizedImageUrl = typeof imageUrl === 'string' ? imageUrl.trim() : '';
    if (normalizedImageUrl.length > MAX_RECIPE_IMAGE_LENGTH) {
      return res.status(400).json({ message: 'Recipe image is too large. Please choose a smaller file.' });
    }

    const recipe = await Recipe.findOneAndUpdate(
      { drinkName },
      { ingredients, steps, imageUrl: normalizedImageUrl, updatedAt: new Date() },
      { returnDocument: 'after', upsert: true, projection: { _id: 0 } }
    ).lean();

    await writeAuditLog('RECIPE_UPDATED', req.user.name, drinkName);
    res.json(recipe);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/recipes/:drinkName', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { drinkName } = req.params;

    const deleted = await Recipe.findOneAndDelete({ drinkName }, { projection: { _id: 0 } }).lean();
    if (!deleted) {
      return res.status(404).json({ message: 'Recipe not found.' });
    }

    await writeAuditLog('RECIPE_DELETED', req.user.name, drinkName);
    res.json({ ok: true, drinkName });
  } catch (error) {
    next(error);
  }
});

app.get('/api/staff', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const result = await queryStaff(req.query || {});
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post('/api/staff', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { name, role, email, password } = req.body || {};
    if (!name || !role || !email || !password) {
      return res.status(400).json({ message: 'name, role, email, and password are required.' });
    }

    if (!['cashier', 'barista'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role.' });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: 'A valid email is required.' });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    const emailTaken = await Staff.findOne({ email: normalizedEmail }, { _id: 0, id: 1 }).lean();
    if (emailTaken) {
      return res.status(400).json({ message: 'Email is already assigned to another staff account.' });
    }

    const staffMember = await Staff.create({
      id: `${role}-${Date.now()}`,
      name: name.trim(),
      role,
      email: normalizedEmail,
      ...buildPasswordRecord(password.trim()),
      active: true,
    });

    await writeAuditLog('STAFF_ADDED', req.user.name, `${name} (${role}) <${normalizedEmail}>`);
    res.status(201).json(toPublicStaff(staffMember));
  } catch (error) {
    next(error);
  }
});

app.patch('/api/staff/:staffId/active', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { staffId } = req.params;
    const { active } = req.body || {};

    if (typeof active !== 'boolean') {
      return res.status(400).json({ message: 'active boolean is required.' });
    }

    const existing = await Staff.findOne({ id: staffId }, { _id: 0, role: 1 }).lean();
    if (!existing) {
      return res.status(404).json({ message: 'Staff member not found.' });
    }

    if (existing.role === 'admin') {
      return res.status(403).json({ message: 'Admin account is managed separately and cannot be changed here.' });
    }

    const staffMember = await Staff.findOneAndUpdate(
      { id: staffId },
      { active },
      { returnDocument: 'after', projection: { _id: 0, passwordHash: 0, passwordSalt: 0, resetCodeHash: 0, resetCodeExpiresAt: 0 } }
    ).lean();

    if (!staffMember) {
      return res.status(404).json({ message: 'Staff member not found.' });
    }

    await writeAuditLog('STAFF_STATUS_CHANGED', req.user.name, `${staffId} -> ${active ? 'active' : 'inactive'}`);
    res.json(toPublicStaff(staffMember));
  } catch (error) {
    next(error);
  }
});

app.put('/api/staff/:staffId', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { staffId } = req.params;
    const { name, role, email, password } = req.body || {};

    if (!name || !role || !email) {
      return res.status(400).json({ message: 'name, role, and email are required.' });
    }

    if (!['cashier', 'barista'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role.' });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: 'A valid email is required.' });
    }

    const existing = await Staff.findOne({ id: staffId }, { _id: 0, role: 1 }).lean();
    if (!existing) {
      return res.status(404).json({ message: 'Staff member not found.' });
    }

    if (existing.role === 'admin') {
      return res.status(403).json({ message: 'Admin account is managed separately and cannot be changed here.' });
    }

    const emailTaken = await Staff.findOne({ id: { $ne: staffId }, email: normalizedEmail }, { _id: 0, id: 1 }).lean();
    if (emailTaken) {
      return res.status(400).json({ message: 'Email is already assigned to another staff account.' });
    }

    const updatePayload = {
      name: name.trim(),
      role,
      email: normalizedEmail,
    };

    if (password !== undefined && String(password).trim()) {
      if (!isValidPassword(password)) {
        return res.status(400).json({ message: 'Password must be at least 8 characters.' });
      }
      Object.assign(updatePayload, buildPasswordRecord(String(password).trim()));
    }

    const updated = await Staff.findOneAndUpdate(
      { id: staffId },
      updatePayload,
      { returnDocument: 'after', projection: { _id: 0, passwordHash: 0, passwordSalt: 0, resetCodeHash: 0, resetCodeExpiresAt: 0 } }
    ).lean();

    await writeAuditLog('STAFF_UPDATED', req.user.name, `${staffId} -> ${updated.name} (${updated.role}) <${updated.email}>`);
    res.json(toPublicStaff(updated));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/staff/:staffId', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { staffId } = req.params;

    const existing = await Staff.findOne({ id: staffId }, { _id: 0, role: 1, active: 1 }).lean();
    if (!existing) {
      return res.status(404).json({ message: 'Staff member not found.' });
    }

    if (existing.role === 'admin') {
      return res.status(403).json({ message: 'Admin account is managed separately and cannot be deleted here.' });
    }

    const deleted = await Staff.findOneAndDelete(
      { id: staffId },
      { projection: { _id: 0, passwordHash: 0, passwordSalt: 0, resetCodeHash: 0, resetCodeExpiresAt: 0 } }
    ).lean();
    if (!deleted) {
      return res.status(404).json({ message: 'Staff member not found.' });
    }

    await writeAuditLog('STAFF_DELETED', req.user.name, `${deleted.name} (${deleted.role})`);
    res.json({ ok: true, id: staffId });
  } catch (error) {
    next(error);
  }
});

app.get('/api/logs', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const result = await queryLogs(req.query || {});
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post('/api/reports', authenticate, requireRole('admin'), async (_req, res, next) => {
  try {
    const [orders, logsCount, activeStaff] = await Promise.all([
      Order.find({}, { _id: 0, status: 1 }).lean(),
      AuditLog.countDocuments(),
      Staff.countDocuments({ active: true }),
    ]);

    const report = {
      generatedAt: new Date().toISOString(),
      orderSummary: summarizeOrders(orders),
      totalLogs: logsCount,
      activeStaff,
    };

    res.json(report);
  } catch (error) {
    next(error);
  }
});

app.post('/api/integrations/self-test', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const timestamp = new Date().toISOString();
    const actor = req.user?.name || 'admin';

    const sentryEnabled = Boolean(SENTRY_DSN);
    const pusher = getPusherClient();
    const pusherConfigured = Boolean(pusher);
    let pusherTriggered = false;
    let pusherError = '';

    if (sentryEnabled) {
      Sentry.captureMessage('Cloud Brew integration self-test executed', {
        level: 'info',
        tags: { component: 'integration-self-test' },
        extra: { actor, timestamp },
      });
    }

    if (pusher) {
      try {
        await pusher.trigger(PUSHER_CHANNEL, 'queue.integration.test', {
          eventId: generateId('EVT'),
          eventType: 'queue.integration.test',
          occurredAt: timestamp,
          actor,
          details: 'Realtime queue self-test event',
        });
        pusherTriggered = true;
      } catch (error) {
        pusherError = error?.message || 'Failed to trigger Pusher self-test event.';
        if (sentryEnabled) {
          Sentry.captureException(error, {
            tags: { component: 'integration-self-test', provider: 'pusher' },
          });
        }
      }
    }

    await writeAuditLog('INTEGRATIONS_SELF_TEST', actor, `sentry=${sentryEnabled} pusher=${pusherConfigured} triggered=${pusherTriggered}`);

    res.json({
      ok: sentryEnabled || pusherConfigured,
      checkedAt: timestamp,
      sentryEnabled,
      pusherConfigured,
      pusherTriggered,
      pusherError,
      message: 'Integration self-test completed.',
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/analytics/sales', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { from, to } = parseAnalyticsDateRange(req.query || {});
    const groupBy = resolveGroupBy(req.query?.groupBy);
    const timeZone = normalizeTimeZone(req.query?.tz);
    const cashier = String(req.query?.cashier || '').trim();
    const barista = String(req.query?.barista || '').trim();

    const payload = await querySalesAnalytics({ from, to, groupBy, timeZone, cashier, barista });
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

app.get('/api/analytics/overview', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { from, to } = parseAnalyticsDateRange(req.query || {});
    const groupBy = resolveGroupBy(req.query?.groupBy);
    const timeZone = normalizeTimeZone(req.query?.tz);
    const cashier = String(req.query?.cashier || '').trim();
    const barista = String(req.query?.barista || '').trim();
    const topItemsLimit = req.query?.limit;

    const payload = await queryAnalyticsOverview({
      from,
      to,
      groupBy,
      timeZone,
      cashier,
      barista,
      topItemsLimit,
    });

    res.json(payload);
  } catch (error) {
    next(error);
  }
});

app.get('/api/analytics/top-items', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { from, to } = parseAnalyticsDateRange(req.query || {});
    const payload = await queryTopItemsAnalytics({ from, to, limit: req.query?.limit });
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

app.get('/api/analytics/staff-kpis', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { from, to } = parseAnalyticsDateRange(req.query || {});
    const payload = await queryStaffKpis({ from, to });
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

app.get('/api/analytics/queue-health', authenticate, requireRole('admin'), async (_req, res, next) => {
  try {
    const payload = await queryQueueHealth();
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

app.get('/api/analytics/barista-dashboard', authenticate, requireRole('barista', 'admin'), async (req, res, next) => {
  try {
    const barista = req.user?.id || String(req.query?.barista || '').trim();
    const { from, to } = parseAnalyticsDateRange(req.query || {});

    const [myStats, queueHealth] = await Promise.all([
      Order.aggregate([
        {
          $match: {
            ...buildAnalyticsMatch({ from, to }),
            status: ORDER_STATUS.COMPLETED,
            handledBy: barista,
          },
        },
        {
          $addFields: {
            prepMinutes: {
              $divide: [
                { $subtract: [{ $ifNull: ['$completedAt', '$updatedAt'] }, '$createdAt'] },
                60000,
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            completedOrders: { $sum: 1 },
            totalDrinks: { $sum: { $ifNull: ['$quantity', 1] } },
            avgPrepMinutes: { $avg: '$prepMinutes' },
            minPrepMinutes: { $min: '$prepMinutes' },
            maxPrepMinutes: { $max: '$prepMinutes' },
          },
        },
        {
          $project: {
            _id: 0,
            completedOrders: 1,
            totalDrinks: 1,
            avgPrepMinutes: 1,
            minPrepMinutes: 1,
            maxPrepMinutes: 1,
          },
        },
      ]),
      queryQueueHealth(),
    ]);

    const stats = myStats?.[0] || {
      completedOrders: 0,
      totalDrinks: 0,
      avgPrepMinutes: 0,
      minPrepMinutes: 0,
      maxPrepMinutes: 0,
    };

    res.json({
      generatedAt: new Date().toISOString(),
      range: { from: from.toISOString(), to: to.toISOString() },
      myStats: stats,
      queueHealth,
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  if (SENTRY_DSN) {
    Sentry.captureException(error, {
      tags: { component: 'api' },
    });
  }
  console.error(error);
  res.status(500).json({ message: error.message || 'Internal server error.' });
});

// Debug helper: list express routes (temporary)
app.get('/debug/routes', (_req, res) => {
  try {
    const router = app._router && app._router.stack ? app._router.stack : [];
    const routes = router
      .map((layer) => {
        if (!layer || !layer.route) return null;
        const methods = Object.keys(layer.route.methods || {}).join(',');
        return { path: layer.route.path, methods };
      })
      .filter(Boolean);

    res.json({ routes });
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

async function startServer() {
  const mongoUri = process.env.MONGODB_URI;
  const port = Number(process.env.PORT || 4000);
  const host = process.env.HOST || '0.0.0.0';
  const localMongoUri = 'mongodb://127.0.0.1:27017/cloudbrew';

  if (!mongoUri) {
    throw new Error('MONGODB_URI is missing. Add it to your .env file.');
  }

  if (!process.env.JWT_SECRET) {
    console.warn('JWT_SECRET is missing. Falling back to a development secret.');
  }

  const existingServerReady = await isExistingApiRunning(port);
  if (existingServerReady) {
    console.log(`Mongo API is already running at http://localhost:${port}`);
    return;
  }

  const mongoCandidates = [mongoUri, localMongoUri].filter(Boolean);
  let connectedUri = '';
  let connectError = null;

  for (const candidate of mongoCandidates) {
    try {
      await mongoose.connect(candidate, {
        serverSelectionTimeoutMS: 4000,
        connectTimeoutMS: 4000,
      });
      connectedUri = candidate;
      break;
    } catch (error) {
      connectError = error;
      await mongoose.disconnect().catch(() => {});

      if (candidate === mongoUri && candidate !== localMongoUri) {
        console.warn('Primary MongoDB connection failed, trying local MongoDB fallback...');
      }
    }
  }

  if (!connectedUri) {
    throw connectError || new Error('Unable to connect to MongoDB.');
  }

  if (connectedUri === localMongoUri && mongoUri !== localMongoUri) {
    console.warn('Using local MongoDB fallback at mongodb://127.0.0.1:27017/cloudbrew');
  }

  await seedDefaults();

  const httpServer = http.createServer(app);
  configureRealtimeQueue(httpServer);

  await new Promise((resolve, reject) => {
    const onListen = () => {
      console.log(`Mongo API running at http://localhost:${port}`);
      getLanIpv4Addresses().forEach((ip) => {
        console.log(`Mongo API LAN URL: http://${ip}:${port}`);
      });
      console.log(`Realtime Queue socket ready at ws://localhost:${port}/socket.io`);
      if (getPusherClient()) {
        console.log(`Realtime Queue Pusher ready on channel: ${PUSHER_CHANNEL}`);
      } else {
        console.log('Realtime Queue Pusher not configured (missing PUSHER_* env values).');
      }
      if (SENTRY_DSN) {
        console.log('Sentry monitoring enabled.');
      }
      resolve();
    };

    const onError = async (error) => {
      if (error?.code === 'EADDRINUSE') {
        const apiStillRunning = await isExistingApiRunning(port);
        if (apiStillRunning) {
          console.log(`Mongo API is already running at http://localhost:${port}`);
          resolve();
          return;
        }
      }

      reject(error);
    };

    httpServer.once('error', onError);
    httpServer.listen(port, host, onListen);
  });
}

function isExistingApiRunning(port) {
  return new Promise((resolve) => {
    const request = http.get(
      {
        host: '127.0.0.1',
        port,
        path: '/api/health',
        timeout: 1200,
      },
      (response) => {
        response.resume();
        resolve(response.statusCode === 200);
      }
    );

    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });

    request.on('error', () => {
      resolve(false);
    });
  });
}

startServer().catch((error) => {
  if (SENTRY_DSN) {
    Sentry.captureException(error, {
      tags: { component: 'startup' },
    });
  }
  console.error('Failed to start server:', error);
  process.exit(1);
});
