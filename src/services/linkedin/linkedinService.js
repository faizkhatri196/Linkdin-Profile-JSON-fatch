const cache = require('../../utils/cache');
const extractor = require('./extractor');
const parser = require('./parser');
const normalizer = require('./normalizer');
const logger = require('../../utils/logger');
const env = require('../../config/env');

class LinkedInService {
  /**
   * Main pipeline to retrieve, parse, and normalize a LinkedIn profile
   * @param {string} canonicalUrl 
   * @returns {Promise<object>} Structured response object
   */
  async getProfile(canonicalUrl) {
    const cacheKey = `li_profile:${canonicalUrl.toLowerCase()}`;

    // 1. Check in-memory cache
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      logger.info(`Returning cached profile for: ${canonicalUrl}`);
      return {
        ...cachedData,
        metadata: {
          ...cachedData.metadata,
          cached: true
        }
      };
    }

    // 2. Fetch raw HTML from upstream
    const { html, status, finalUrl } = await extractor.fetchProfileHtml(canonicalUrl);

    // 3. Parse HTML, JSON-LD, and meta tags
    const rawData = parser.parse(html, canonicalUrl);

    // 4. Normalize according to API contract
    const isAuthenticated = Boolean(env.LINKEDIN_LI_AT);
    const normalized = normalizer.normalize(rawData, canonicalUrl, {
      cached: false,
      authenticated: isAuthenticated
    });

    // 5. Save in memory cache
    cache.set(cacheKey, normalized);

    return normalized;
  }
}

module.exports = new LinkedInService();
