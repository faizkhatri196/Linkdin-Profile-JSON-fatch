const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const { HTTP_STATUS, ERROR_CODES } = require('../config/constants');

const profileRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
      message: `Rate limit exceeded. Maximum ${env.RATE_LIMIT_MAX} requests per ${Math.floor(env.RATE_LIMIT_WINDOW_MS / 1000)} seconds allowed per IP.`
    }
  },
  statusCode: HTTP_STATUS.TOO_MANY_REQUESTS
});

module.exports = {
  profileRateLimiter
};
