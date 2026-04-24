require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const os = require('os');

const app = express();

app.use(cors());
app.use(express.json({ limit: '8mb' }));

const JWT_EXPIRATION = '12h';
const FALLBACK_JWT_SECRET = 'cloud-brew-dev-secret-change-me';
const FALLBACK_ADMIN_EMAIL = 'admin@cloudbrew.app';
const FALLBACK_ADMIN_PASSWORD = 'Admin9090!';
const MAX_PAGE_SIZE = 50;
const DEFAULT_STAFF_PAGE_SIZE = 10;
const DEFAULT_LOG_PAGE_SIZE = 20;
const MAX_RECIPE_IMAGE_LENGTH = 6 * 1024 * 1024;
const RESET_CODE_TTL_MS = 10 * 60 * 1000;

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

function buildResetCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashResetCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
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
    status: {
      type: String,
      enum: [ORDER_STATUS.PENDING, ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.COMPLETED],
      default: ORDER_STATUS.PENDING,
    },
    createdBy: { type: String, required: true },
    handledBy: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

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
const AuditLog = mongoose.model('AuditLog', auditLogSchema);

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

async function writeAuditLog(action, actor, details = '') {
  await AuditLog.create({
    id: generateId('LOG'),
    action,
    actor,
    details,
    timestamp: new Date(),
  });
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
  await Staff.updateOne(
    { id: ROOT_ADMIN_ACCOUNT.id },
    {
      $setOnInsert: {
        ...buildPasswordRecord(ROOT_ADMIN_ACCOUNT.password),
      },
      $set: {
        name: ROOT_ADMIN_ACCOUNT.name,
        role: ROOT_ADMIN_ACCOUNT.role,
        email: normalizedAdminEmail,
        recoveryEmail: normalizeEmail(process.env.ADMIN_RECOVERY_EMAIL || ''),
        active: true,
      },
    },
    { upsert: true }
  );

  const rootAccount = await Staff.findOne({ id: ROOT_ADMIN_ACCOUNT.id }, { _id: 0, passwordHash: 1, passwordSalt: 1 }).lean();
  if (!rootAccount?.passwordHash || !rootAccount?.passwordSalt) {
    await Staff.updateOne(
      { id: ROOT_ADMIN_ACCOUNT.id },
      {
        $set: buildPasswordRecord(ROOT_ADMIN_ACCOUNT.password),
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
  try {
    const { recoveryEmail, email } = req.body || {};
    const normalizedRecoveryEmail = normalizeEmail(recoveryEmail || email);

    if (!isValidEmail(normalizedRecoveryEmail)) {
      return res.status(400).json({ message: 'A valid recoveryEmail is required.' });
    }

    const staffMember = await Staff.findOne(
      { role: 'admin', recoveryEmail: normalizedRecoveryEmail, active: true },
      { _id: 0, id: 1, name: 1, email: 1, recoveryEmail: 1 }
    ).lean();

    let devResetCode = '';
    if (staffMember) {
      const resetCode = buildResetCode();
      devResetCode = resetCode;

      await Staff.updateOne(
        { id: staffMember.id },
        {
          $set: {
            resetCodeHash: hashResetCode(resetCode),
            resetCodeExpiresAt: new Date(Date.now() + RESET_CODE_TTL_MS),
          },
        }
      );

      await writeAuditLog('ADMIN_PASSWORD_RESET_REQUEST', staffMember.name, `Reset code issued for ${staffMember.email}`);
    }

    res.json({
      ok: true,
      message: 'If an admin account exists for this recovery email, a reset code has been issued.',
      devResetCode,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/reset-password', async (req, res, next) => {
  try {
    const { recoveryEmail, email, resetCode, newPassword } = req.body || {};

    const normalizedRecoveryEmail = normalizeEmail(recoveryEmail || email);
    if (!isValidEmail(normalizedRecoveryEmail)) {
      return res.status(400).json({ message: 'A valid recoveryEmail is required.' });
    }

    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ message: 'New password must be at least 8 characters.' });
    }

    const staffMember = await Staff.findOne(
      { role: 'admin', recoveryEmail: normalizedRecoveryEmail, active: true },
      { _id: 0, id: 1, name: 1, resetCodeHash: 1, resetCodeExpiresAt: 1 }
    ).lean();

    if (!staffMember || !staffMember.resetCodeHash || !staffMember.resetCodeExpiresAt) {
      return res.status(400).json({ message: 'No active reset request was found.' });
    }

    if (new Date(staffMember.resetCodeExpiresAt).getTime() < Date.now()) {
      return res.status(400).json({ message: 'Reset code has expired. Request a new one.' });
    }

    if (hashResetCode(resetCode || '') !== staffMember.resetCodeHash) {
      return res.status(400).json({ message: 'Invalid reset code.' });
    }

    await Staff.updateOne(
      { id: staffMember.id },
      {
        $set: buildPasswordRecord(newPassword.trim()),
        $unset: {
          resetCodeHash: '',
          resetCodeExpiresAt: '',
        },
      }
    );

    await writeAuditLog('ADMIN_PASSWORD_RESET', staffMember.name, 'Password reset via forgot-password flow.');
    res.json({ ok: true });
  } catch (error) {
    next(error);
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

    const updated = await Staff.findOneAndUpdate(
      { id: req.user.id, role: 'admin', active: true },
      { recoveryEmail: normalizedRecoveryEmail },
      { returnDocument: 'after', projection: { _id: 0, id: 1, name: 1, role: 1, recoveryEmail: 1 } }
    ).lean();

    if (!updated) {
      return res.status(404).json({ message: 'Admin account not found.' });
    }

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

    const order = await Order.create({
      id: generateId('ORD'),
      item,
      quantity: normalizedQuantity,
      size,
      addons,
      status: ORDER_STATUS.PENDING,
      createdBy: req.user.name,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await writeAuditLog('ORDER_CREATED', req.user.name, `${order.id} ${normalizedQuantity}x ${item} (${size})`);
    res.status(201).json(order.toObject({ versionKey: false, transform: (_doc, ret) => {
      delete ret._id;
      return ret;
    } }));
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

    const order = await Order.findOneAndUpdate(
      { id: orderId },
      { status, handledBy: nextHandledBy, updatedAt: new Date() },
      { returnDocument: 'after', projection: { _id: 0 } }
    ).lean();

    await writeAuditLog('ORDER_STATUS_CHANGED', req.user.name, `${orderId} -> ${status}`);
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

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: error.message || 'Internal server error.' });
});

async function startServer() {
  const mongoUri = process.env.MONGODB_URI;
  const port = Number(process.env.PORT || 4000);
  const host = process.env.HOST || '0.0.0.0';

  if (!mongoUri) {
    throw new Error('MONGODB_URI is missing. Add it to your .env file.');
  }

  if (!process.env.JWT_SECRET) {
    console.warn('JWT_SECRET is missing. Falling back to a development secret.');
  }

  await mongoose.connect(mongoUri);
  await seedDefaults();

  app.listen(port, host, () => {
    console.log(`Mongo API running at http://localhost:${port}`);
    getLanIpv4Addresses().forEach((ip) => {
      console.log(`Mongo API LAN URL: http://${ip}:${port}`);
    });
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
