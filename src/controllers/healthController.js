const { HTTP_STATUS } = require('../config/constants');
const cache = require('../utils/cache');

function getHealth(req, res) {
  const cacheStats = cache.getStats();

  return res.status(HTTP_STATUS.OK).json({
    status: 'ok',
    service: 'linkedin-profile-api',
    version: '1.0.0',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    cache: {
      keys: cacheStats.keys,
      hits: cacheStats.hits,
      misses: cacheStats.misses
    }
  });
}

module.exports = {
  getHealth
};
