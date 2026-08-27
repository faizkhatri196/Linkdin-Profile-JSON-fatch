const NodeCache = require('node-cache');
const env = require('../config/env');
const logger = require('./logger');

// Zero-cost in-memory TTL Cache
const ttl = env.CACHE_TTL_SECONDS > 0 ? env.CACHE_TTL_SECONDS : 3600;
const memoryCache = new NodeCache({
  stdTTL: ttl,
  checkperiod: Math.floor(ttl * 0.2) || 120,
  useClones: false
});

const cacheService = {
  get: (key) => {
    if (env.CACHE_TTL_SECONDS <= 0) return null;
    const value = memoryCache.get(key);
    if (value) {
      logger.debug(`Cache hit for key: ${key}`);
      return value;
    }
    return null;
  },
  set: (key, value, customTtl) => {
    if (env.CACHE_TTL_SECONDS <= 0) return false;
    const cacheTtl = typeof customTtl === 'number' ? customTtl : ttl;
    return memoryCache.set(key, value, cacheTtl);
  },
  has: (key) => {
    if (env.CACHE_TTL_SECONDS <= 0) return false;
    return memoryCache.has(key);
  },
  del: (key) => {
    return memoryCache.del(key);
  },
  flush: () => {
    return memoryCache.flushAll();
  },
  getStats: () => {
    return memoryCache.getStats();
  }
};

module.exports = cacheService;
