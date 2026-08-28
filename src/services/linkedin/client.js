const env = require('../../config/env');
const { USER_AGENTS, HTTP_STATUS } = require('../../config/constants');
const logger = require('../../utils/logger');
const {
  NotFoundError,
  UpstreamRateLimitError,
  ProfileRestrictedError,
  TimeoutError,
  AppError
} = require('../../utils/customErrors');
const { extractVanityName } = require('./endpoints');

class LinkedInHttpClient {
  constructor() {
    this.timeoutMs = env.SCRAPER_TIMEOUT_MS || 15000;
  }

  /**
   * Generates realistic browser headers for direct HTTP requests
   */
  getHeaders() {
    const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const headers = {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0'
    };

    if (env.LINKEDIN_LI_AT) {
      headers['Cookie'] = `li_at=${env.LINKEDIN_LI_AT}`;
    }

    return headers;
  }

  /**
   * Execute direct HTTP request to LinkedIn endpoint with timeout and status handling
   * @param {string} targetUrl 
   * @returns {Promise<{html: string, status: number, statusCode: number, finalUrl: string, authenticated: boolean}>}
   */
  async get(targetUrl) {
    const vanityName = extractVanityName(targetUrl);
    logger.info(`[Direct HTTP] Requesting LinkedIn endpoint for profile: ${vanityName || targetUrl}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: this.getHeaders(),
        redirect: 'follow',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const finalUrl = response.url || targetUrl;
      const statusCode = response.status;

      // Handle 404
      if (statusCode === HTTP_STATUS.NOT_FOUND) {
        throw new NotFoundError(`LinkedIn profile '${vanityName || targetUrl}' was not found.`);
      }

      // Handle 429 and LinkedIn 999 anti-scraping block
      if (statusCode === HTTP_STATUS.TOO_MANY_REQUESTS || statusCode === 999) {
        logger.warn(`LinkedIn anti-scraping triggered (HTTP ${statusCode}) on endpoint: ${targetUrl}`);
        throw new UpstreamRateLimitError(`LinkedIn anti-bot protection triggered (HTTP ${statusCode}). Profile extraction is temporarily restricted by upstream.`);
      }

      // Handle 401 Unauthorized / Session Expired
      if (statusCode === HTTP_STATUS.UNAUTHORIZED) {
        throw new AppError('LinkedIn session unauthorized or cookie expired.', 401, 'AUTHENTICATION_REQUIRED');
      }

      // Handle 403 Forbidden
      if (statusCode === HTTP_STATUS.FORBIDDEN) {
        throw new ProfileRestrictedError('LinkedIn profile access is forbidden or restricted by upstream.');
      }

      // Detect /authwall redirection
      if (finalUrl.includes('/authwall') || finalUrl.includes('/checkpoint/')) {
        logger.warn(`LinkedIn redirected request to authwall: ${finalUrl}`);
        throw new ProfileRestrictedError('LinkedIn restricted public access for this profile (redirected to authwall).');
      }

      if (!response.ok) {
        throw new AppError(`LinkedIn upstream returned unexpected HTTP ${statusCode}`, 502, 'UPSTREAM_ERROR');
      }

      const html = await response.text();

      return {
        html,
        status: statusCode,
        statusCode,
        finalUrl,
        authenticated: Boolean(env.LINKEDIN_LI_AT)
      };
    } catch (err) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError') {
        logger.error(`LinkedIn HTTP request timed out after ${this.timeoutMs}ms for ${targetUrl}`);
        throw new TimeoutError(`Request to LinkedIn upstream timed out after ${this.timeoutMs / 1000} seconds.`);
      }

      if (err instanceof AppError) {
        throw err;
      }

      logger.error(`Network error connecting to LinkedIn upstream: ${err.message}`);
      throw new AppError(`Network failure connecting to LinkedIn: ${err.message}`, 502, 'NETWORK_ERROR');
    }
  }
}

module.exports = new LinkedInHttpClient();
