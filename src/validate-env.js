const { z } = require('zod');

const envSchema = z.object({
  PORT: z.string().regex(/^\d+$/, 'PORT must be a valid number').transform(Number).pipe(z.number().int().min(1).max(65535)).default('3458'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DB_DIR: z.string().min(1, 'DB_DIR must not be empty').default('./data'),
  LOG_LEVEL: z.enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace']).optional(),
  RATE_LIMIT_MAX: z.string().regex(/^\d+$/).transform(Number).optional(),
  SHUTDOWN_TIMEOUT_MS: z.string().regex(/^\d+$/).transform(Number).optional(),
  BCRYPT_SALT_ROUNDS: z.string().regex(/^\d+$/).transform(Number).optional(),
  SESSION_MAX_AGE_DAYS: z.string().regex(/^\d+$/).transform(Number).optional(),
  BASE_URL: z.string().optional(),
  TRUST_PROXY: z.enum(['0', '1', 'true', 'false']).optional(),
  ALLOWED_ORIGINS: z.string().optional(),
});

function validateEnv(env) {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map(i => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Environment validation failed:\n${issues}`);
  }
  return result.data;
}

module.exports = validateEnv;
