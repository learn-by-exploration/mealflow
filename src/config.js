require('dotenv').config();
const path = require('path');
const fs = require('fs');

let version = '0.1.0';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  version = pkg.version || version;
} catch {}

const config = Object.freeze({
  port: parseInt(process.env.PORT, 10) || 3458,
  dbDir: process.env.DB_DIR || path.join(__dirname, '..', 'data'),
  nodeEnv: process.env.NODE_ENV || 'development',
  isTest: process.env.NODE_ENV === 'test',
  isProd: process.env.NODE_ENV === 'production',
  version,
  session: {
    maxAgeDays: parseInt(process.env.SESSION_MAX_AGE_DAYS, 10) || 7,
    rememberMeDays: parseInt(process.env.SESSION_REMEMBER_DAYS, 10) || 30,
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 200,
    perUserMax: parseInt(process.env.RATE_LIMIT_PER_USER_MAX, 10) || 100,
  },
  auth: {
    saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12,
    authLimitWindowMs: parseInt(process.env.AUTH_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    authLimitMax: parseInt(process.env.AUTH_LIMIT_MAX, 10) || 20,
  },
  backup: {
    retainCount: parseInt(process.env.BACKUP_RETAIN_COUNT, 10) || 7,
    intervalHours: parseInt(process.env.BACKUP_INTERVAL_HOURS, 10) || 24,
  },
  log: {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  },
  shutdownTimeoutMs: parseInt(process.env.SHUTDOWN_TIMEOUT_MS, 10) || 10000,
  baseUrl: process.env.BASE_URL || '',
  trustProxy: process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true',
  allowedOrigins: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    : (process.env.NODE_ENV === 'production' ? [] : ['http://localhost:3458']),
});

module.exports = config;
