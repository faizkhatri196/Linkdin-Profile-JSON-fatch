const env = require('../config/env');

const isProduction = env.NODE_ENV === 'production';
const isTest = env.NODE_ENV === 'test';

function formatMessage(level, message, meta) {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ' ' + JSON.stringify(maskSensitive(meta)) : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
}

function maskSensitive(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const clone = Array.isArray(obj) ? [...obj] : { ...obj };
  const sensitiveKeys = ['cookie', 'authorization', 'password', 'li_at', 'jsessionid', 'token'];
  for (const key of Object.keys(clone)) {
    if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
      clone[key] = '***REDACTED***';
    } else if (typeof clone[key] === 'object' && clone[key] !== null) {
      clone[key] = maskSensitive(clone[key]);
    }
  }
  return clone;
}

const logger = {
  info: (message, meta) => {
    if (!isTest) console.log(formatMessage('info', message, meta));
  },
  warn: (message, meta) => {
    if (!isTest) console.warn(formatMessage('warn', message, meta));
  },
  error: (message, meta) => {
    if (!isTest) console.error(formatMessage('error', message, meta));
  },
  debug: (message, meta) => {
    if (!isProduction && !isTest) console.debug(formatMessage('debug', message, meta));
  }
};

module.exports = logger;
