const extractor = require('./extractor');
const parser = require('./parser');
const normalizer = require('./normalizer');
const cache = require('../../utils/cache');
const logger = require('../../utils/logger');
const { extractVanityName } = require('./endpoints');

class LinkedInService {
  /**
   * Orchestrates the direct reverse-engineered extraction pipeline:
   * Direct HTTP -> Parser -> Normalizer -> In-Memory Cache
   * @param {string} canonicalUrl - Validated and canonicalized LinkedIn profile URL
   * @returns {Promise<object>} Normalized structured profile JSON
   */
  async getProfile(canonicalUrl) {
    const vanityName = extractVanityName(canonicalUrl);
    const cacheKey = `li_profile:${canonicalUrl}`;

    // 1. Check in-memory cache
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      logger.info(`Returning cached profile for: ${vanityName || canonicalUrl}`);
      return {
        ...cachedData,
        metadata: {
          ...cachedData.metadata,
          cached: true
        }
      };
    }

    // 2. Make Direct HTTP request to LinkedIn endpoint (NO browser automation)
    const { html, authenticated } = await extractor.fetchProfileHtml(canonicalUrl);

    // 3. Parse multi-signal data defensively (JSON-LD, OpenGraph, DOM, RSC Flight stream)
    const rawParsed = parser.parse(html, canonicalUrl);

    // 4. Normalize fields into standard hiring-challenge response schema
    const normalizedResponse = normalizer.normalize(rawParsed, canonicalUrl, {
      cached: false,
      authenticated
    });

    // 5. Store in zero-cost in-memory cache
    cache.set(cacheKey, normalizedResponse);

    return normalizedResponse;
  }
}

module.exports = new LinkedInService();
