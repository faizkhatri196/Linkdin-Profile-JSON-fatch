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
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    };

    if (env.LINKEDIN_COOKIE) {
      headers['Cookie'] = env.LINKEDIN_COOKIE;
    } else if (env.LINKEDIN_LI_AT) {
      headers['Cookie'] = `li_at=${env.LINKEDIN_LI_AT}`;
    }

    return headers;
  }

  /**
   * Execute direct HTTP request to LinkedIn endpoint with timeout and redirect handling
   * @param {string} targetUrl 
   * @returns {Promise<{html: string, status: number, statusCode: number, finalUrl: string, authenticated: boolean}>}
   */
  async get(targetUrl) {
    const vanityName = extractVanityName(targetUrl);
    logger.info(`[Direct HTTP] Requesting LinkedIn endpoint for profile: ${vanityName || targetUrl}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    let currentUrl = targetUrl;
    let response;
    let redirects = 0;
    const maxRedirects = 4;
    const visitedUrls = new Set([targetUrl]);

    try {
      while (redirects < maxRedirects) {
        response = await fetch(currentUrl, {
          method: 'GET',
          headers: this.getHeaders(),
          redirect: 'manual',
          signal: controller.signal
        });

        // Detect authwall / checkpoint / login URL directly
        const respUrl = response.url || currentUrl;
        if (respUrl.includes('/authwall') || respUrl.includes('/checkpoint/') || respUrl.includes('/login') || respUrl.includes('/uas/')) {
          logger.warn(`LinkedIn redirected to authwall checkpoint: ${respUrl}`);
          throw new ProfileRestrictedError('LinkedIn restricted public access for this profile (redirected to authwall).');
        }

        // Check for 3xx redirect status
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const loc = response.headers && typeof response.headers.get === 'function' ? response.headers.get('location') : null;
          if (!loc) break;

          const nextUrl = loc.startsWith('http') ? loc : new URL(loc, currentUrl).href;

          if (nextUrl.includes('/authwall') || nextUrl.includes('/checkpoint/') || nextUrl.includes('/login') || nextUrl.includes('/uas/')) {
            logger.warn(`LinkedIn redirected to authwall checkpoint: ${nextUrl}`);
            throw new ProfileRestrictedError('LinkedIn restricted public access for this profile (redirected to authwall).');
          }

          if (visitedUrls.has(nextUrl)) {
            logger.warn(`LinkedIn redirect loop detected for ${nextUrl}. Session expired or checkpoint triggered.`);
            throw new UpstreamRateLimitError('LinkedIn anti-bot protection triggered (HTTP 302 Loop). Profile extraction is temporarily restricted by upstream.');
          }

          visitedUrls.add(nextUrl);
          currentUrl = nextUrl;
          redirects++;
        } else {
          break;
        }
      }

      clearTimeout(timeoutId);

      const finalUrl = response && response.url ? response.url : currentUrl;
      const statusCode = response ? response.status : 502;

      // Detect authwall on finalUrl
      if (finalUrl.includes('/authwall') || finalUrl.includes('/checkpoint/') || finalUrl.includes('/login')) {
        throw new ProfileRestrictedError('LinkedIn restricted public access for this profile (redirected to authwall).');
      }

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

      if (!response || !response.ok) {
        throw new AppError(`LinkedIn upstream returned unexpected HTTP ${statusCode}`, 502, 'UPSTREAM_ERROR');
      }

      const html = typeof response.text === 'function' ? await response.text() : '';

      return {
        html,
        status: statusCode,
        statusCode,
        finalUrl,
        authenticated: Boolean(env.LINKEDIN_COOKIE || env.LINKEDIN_LI_AT)
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
