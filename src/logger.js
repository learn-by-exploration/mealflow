const pino = require('pino');
const config = require('./config');

const logger = pino({
  level: config.log.level,
  redact: {
    paths: ['password', 'req.headers.cookie', 'req.headers.authorization', '*.password', '*.api_key', '*.apiKey'],
    censor: '[REDACTED]'
  },
  ...(config.isProd ? {} : {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:HH:MM:ss' }
    }
  }),
});

module.exports = logger;
