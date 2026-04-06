const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const initDatabase = require('./db');
const createHelpers = require('./helpers');
const createAuthMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/errors');
const createCsrfMiddleware = require('./middleware/csrf');
const createAuditLogger = require('./services/audit');
const createRequestLogger = require('./middleware/request-logger');
const createPerUserRateLimit = require('./middleware/per-user-rate-limit');
const logger = require('./logger');

const app = express();
const PORT = config.port;

// ─── Trust proxy when behind reverse proxy ───
if (config.trustProxy) {
  app.set('trust proxy', 1);
}

const { db } = initDatabase(config.dbDir);
const helpers = createHelpers(db);

const deps = { db, dbDir: config.dbDir, ...helpers };

// ─── Audit logger ───
const audit = createAuditLogger(db);
deps.audit = audit;
setInterval(() => {
  audit.purge();
  // Issue 12: Clean expired sessions
  try {
    db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
  } catch (err) { logger.warn({ err }, 'Session cleanup failed'); }
}, 24 * 60 * 60 * 1000);

// Issue 9: Automated backup scheduling
if (!config.isTest) {
  setInterval(() => {
    try {
      const backupDir = path.join(config.dbDir, '..', 'backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const dbPath = path.join(config.dbDir, 'mealflow.db');
      if (fs.existsSync(dbPath)) {
        const date = new Date().toISOString().slice(0, 10);
        const dest = path.join(backupDir, `mealflow-${date}.db`);
        db.backup(dest).then(() => {
          // Rotate: keep last N backups
          const files = fs.readdirSync(backupDir).filter(f => f.startsWith('mealflow-') && f.endsWith('.db')).sort();
          while (files.length > config.backup.retainCount) {
            fs.unlinkSync(path.join(backupDir, files.shift()));
          }
          logger.info({ dest }, 'Backup completed');
        }).catch(err => logger.warn({ err }, 'Backup failed'));
      }
    } catch (err) { logger.warn({ err }, 'Backup failed'); }
  }, config.backup.intervalHours * 3600 * 1000);
}

const { requireAuth, optionalAuth } = createAuthMiddleware(db);

// ─── Security headers ───
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: config.trustProxy ? [] : null
    }
  },
  strictTransportSecurity: config.trustProxy,
  referrerPolicy: { policy: 'same-origin' }
}));

// ─── No-cache on API responses ───
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// ─── CORS ───
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, same-origin)
    if (!origin) return callback(null, true);
    // Allow configured origins
    if (config.allowedOrigins.length > 0 && config.allowedOrigins.includes(origin)) return callback(null, true);
    // Allow same-host on any port in development
    if (!config.isProd) return callback(null, true);
    // In production with no configured origins, allow private network IPs
    try {
      const url = new URL(origin);
      const host = url.hostname;
      if (host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.') || host.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
        return callback(null, true);
      }
    } catch {}
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// ─── Rate limiting ───
if (!config.isTest) {
  const globalLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' }
  });
  app.use('/api/', globalLimiter);
}

const authLimiter = config.isTest ? (req, res, next) => next() : rateLimit({
  windowMs: config.auth.authLimitWindowMs,
  max: config.auth.authLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later' }
});

app.use(express.json({ limit: '1mb' }));

// ─── Request ID middleware ───
app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', requestId);
  req.requestId = requestId;
  next();
});

app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.body) req.body = {};
  next();
});

// ─── Compression ───
const compression = require('compression');
app.use(compression());

app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1d', etag: true }));

// ─── Serve uploaded images ───
app.use('/images', express.static(path.join(config.dbDir, 'images'), { maxAge: '1d', etag: true }));

// ─── CSRF Protection ───
const csrfProtection = createCsrfMiddleware();
if (!config.isTest) {
  app.use('/api', csrfProtection);
}

// ─── Request Logging ───
if (!config.isTest) {
  app.use(createRequestLogger(logger));
}

// ─── Auth middleware on all /api/* routes ───
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/') || req.path.startsWith('/health')) return optionalAuth(req, res, next);
  requireAuth(req, res, next);
});

// ─── Per-user rate limiting ───
if (!config.isTest) {
  app.use('/api', createPerUserRateLimit({
    maxRequests: config.rateLimit.perUserMax,
    windowMs: config.rateLimit.windowMs,
  }));
}

// ─── Auth routes ───
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/change-password', authLimiter);
app.use(require('./routes/auth')(deps));

// ─── Route modules ───
app.use(require('./routes/recipes')(deps));
app.use(require('./routes/ingredients')(deps));
app.use(require('./routes/meals')(deps));
app.use(require('./routes/tags')(deps));
app.use(require('./routes/nutrition')(deps));
app.use(require('./routes/shopping')(deps));
app.use(require('./routes/stats')(deps));
app.use(require('./routes/data')(deps));
app.use(require('./routes/households')(deps));
app.use(require('./routes/persons')(deps));
app.use(require('./routes/festivals')(deps));
app.use(require('./routes/polls')(deps));
app.use(require('./routes/templates')(deps));
app.use(require('./routes/pantry')(deps));
app.use(require('./routes/purchases')(deps));
app.use(require('./routes/seed')(deps));
app.use(require('./routes/import')(deps));
app.use(require('./routes/notifications')(deps));
app.use(require('./routes/calendar')(deps));
app.use(require('./routes/ai')(deps));
app.use(require('./routes/cost')(deps));
app.use(require('./routes/ratings')(deps));
app.use(require('./routes/units')(deps));

// ─── Admin: Audit log rotation ───
app.post('/api/admin/audit/rotate', (req, res) => {
  try {
    const role = db.prepare('SELECT household_role FROM users WHERE id = ?').get(req.userId);
    if (!role || role.household_role !== 'admin') {
      return res.status(403).json({ error: 'Admin role required', code: 'FORBIDDEN' });
    }
    const countBefore = db.prepare('SELECT COUNT(*) as cnt FROM audit_log').get().cnt;
    audit.purge(90);
    const countAfter = db.prepare('SELECT COUNT(*) as cnt FROM audit_log').get().cnt;
    res.json({ deleted: countBefore - countAfter, remaining: countAfter });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'INTERNAL_ERROR' });
  }
});

// ─── Error rate tracking (DO-07) ───
const errorTimestamps = [];
let totalRequests = 0;
app.use((req, res, next) => {
  totalRequests++;
  res.on('finish', () => {
    if (res.statusCode >= 500) {
      errorTimestamps.push(Date.now());
    }
  });
  next();
});

// ─── Health checks ───
app.get('/api/health', (req, res) => {
  let dbOk = false;
  try { db.prepare('SELECT 1').get(); dbOk = true; } catch {}
  let dbSizeMb = 0;
  try {
    const dbPath = path.join(config.dbDir, 'mealflow.db');
    const stats = require('fs').statSync(dbPath);
    dbSizeMb = Math.round((stats.size / (1024 * 1024)) * 100) / 100;
    if (dbSizeMb > 500) {
      logger.warn({ db_size_mb: dbSizeMb }, 'Database size exceeds 500MB');
    }
  } catch {}
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    version: config.version,
    uptime: Math.floor(process.uptime()),
    db: dbOk ? 'connected' : 'disconnected',
    db_size_mb: dbSizeMb,
  });
});

app.get('/api/health/metrics', (req, res) => {
  const now = Date.now();
  const oneMinAgo = now - 60_000;
  const fiveMinAgo = now - 300_000;
  // Prune old entries (> 5 min)
  while (errorTimestamps.length > 0 && errorTimestamps[0] < fiveMinAgo) {
    errorTimestamps.shift();
  }
  const error1m = errorTimestamps.filter(t => t >= oneMinAgo).length;
  const error5m = errorTimestamps.length;
  res.json({
    error_count_1m: error1m,
    error_count_5m: error5m,
    uptime_s: Math.floor(process.uptime()),
    request_count: totalRequests,
  });
});

app.get('/health', (req, res) => {
  let dbOk = false;
  try { db.prepare('SELECT 1').get(); dbOk = true; } catch {}
  res.status(dbOk ? 200 : 503).json({ status: dbOk ? 'ok' : 'degraded', dbOk });
});

app.get('/ready', (req, res) => {
  let dbOk = false;
  try { db.prepare('SELECT 1').get(); dbOk = true; } catch {}
  if (!dbOk) return res.status(503).json({ ready: false });
  res.json({ ready: true });
});

// ─── Login page ───
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

// ─── OpenAPI spec endpoint ───
app.get('/api/docs', (req, res) => {
  const yamlPath = path.join(__dirname, '..', 'docs', 'openapi.yaml');
  const yamlContent = fs.readFileSync(yamlPath, 'utf-8');
  // Simple YAML-to-JSON: parse key-value lines (serve raw YAML as text for simplicity)
  res.type('text/yaml').send(yamlContent);
});

// ─── API 404 catch-all ───
app.all('/api/{*splat}', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── SPA fallback ───
app.get('/{*splat}', (req, res) => {
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(/mf_sid=([^;]+)/);
  if (match) {
    const session = db.prepare("SELECT * FROM sessions WHERE sid = ? AND expires_at > datetime('now')").get(match[1]);
    if (session) {
      return res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
    }
  }
  res.redirect('/login');
});

// ─── Global error handler ───
app.use(errorHandler);

// ─── Start server when run directly ───
if (require.main === module) {
  // ─── DO-12: Environment validation ───
  try {
    const validateEnv = require('./validate-env');
    validateEnv(process.env);
  } catch (err) {
    logger.fatal({ err: err.message }, 'Startup aborted: invalid environment');
    console.error(err.message);
    process.exit(1);
  }

  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception — forcing shutdown');
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled rejection — forcing shutdown');
    process.exit(1);
  });

  const HOST = config.host;
  const server = app.listen(PORT, HOST, () => logger.info({ port: PORT, host: HOST, version: config.version }, 'MealFlow started'));

  // ─── Graceful shutdown (DO-10) ───
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.getConnections((err, count) => {
      logger.info({ signal, activeConnections: err ? 'unknown' : count }, 'Shutdown signal received, draining connections...');
    });
    server.close(() => {
      try { audit.purge(90); logger.info('Audit log flushed'); } catch {}
      try { db.close(); logger.info('Database closed'); } catch {}
      logger.info('Server stopped cleanly');
      process.exit(0);
    });
    setTimeout(() => {
      logger.warn('Forced shutdown after timeout');
      try { audit.purge(90); } catch {}
      try { db.close(); } catch {}
      process.exit(1);
    }, config.shutdownTimeoutMs);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = { app, db };
