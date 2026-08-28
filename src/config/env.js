const dotenv = require('dotenv');

dotenv.config();

const env = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '30', 10),
  CACHE_TTL_SECONDS: parseInt(process.env.CACHE_TTL_SECONDS || '3600', 10),
  SCRAPER_TIMEOUT_MS: parseInt(process.env.SCRAPER_TIMEOUT_MS || '15000', 10),
  LINKEDIN_LI_AT: process.env.LINKEDIN_LI_AT || '',
  LINKEDIN_COOKIE: process.env.LINKEDIN_COOKIE || '',
  MONGODB_URI: process.env.MONGODB_URI || ''
};

module.exports = env;
