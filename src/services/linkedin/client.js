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
   * Generates realistic browser headers
   */
  getHeaders(includeAuth = true, userAgentType = 'desktop') {
    let userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    if (userAgentType === 'mobile') {
      userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1';
    }

    const headers = {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'Sec-Ch-Ua-Mobile': userAgentType === 'mobile' ? '?1' : '?0',
      'Sec-Ch-Ua-Platform': userAgentType === 'mobile' ? '"iOS"' : '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    };

    if (includeAuth) {
      if (env.LINKEDIN_COOKIE) {
        headers['Cookie'] = env.LINKEDIN_COOKIE;
      } else if (env.LINKEDIN_LI_AT) {
        headers['Cookie'] = `li_at=${env.LINKEDIN_LI_AT}`;
      }
    }

    return headers;
  }

  /**
   * Execute direct HTTP request to LinkedIn endpoint with multi-tier fallback
   * @param {string} targetUrl 
   * @returns {Promise<{html: string, status: number, statusCode: number, finalUrl: string, authenticated: boolean}>}
   */
  async get(targetUrl) {
    const vanityName = extractVanityName(targetUrl);
    logger.info(`[Direct HTTP] Requesting LinkedIn endpoint for profile: ${vanityName || targetUrl}`);

    // Tier 1: Try authenticated request if cookie is present
    const hasAuthCookie = Boolean(env.LINKEDIN_COOKIE || env.LINKEDIN_LI_AT);
    if (hasAuthCookie) {
      try {
        const authResult = await this.executeFetch(targetUrl, true, 'desktop');
        if (authResult && authResult.html && authResult.html.length > 2000) {
          return authResult;
        }
      } catch (err) {
        logger.warn(`Authenticated request failed (${err.message}). Automatically falling back to clean unauthenticated request.`);
      }
    }

    // Tier 2: Clean Unauthenticated Public Request
    try {
      const publicResult = await this.executeFetch(targetUrl, false, 'desktop');
      if (publicResult && publicResult.html) {
        return publicResult;
      }
    } catch (err) {
      // If 404, throw immediately
      if (err instanceof NotFoundError) throw err;
      logger.warn(`Public desktop request encountered (${err.message}). Trying regional mobile endpoint.`);
    }

    // Tier 3: Regional Public Endpoint Fallback
    const regionalUrl = targetUrl.replace('www.linkedin.com', 'in.linkedin.com');
    try {
      return await this.executeFetch(regionalUrl, false, 'mobile');
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new UpstreamRateLimitError('LinkedIn anti-bot protection triggered (HTTP 999 / Checkpoint). Profile extraction is temporarily restricted by upstream.');
    }
  }

  /**
   * Low-level fetch executor with redirect loop protection
   */
  async executeFetch(targetUrl, includeAuth = true, uaType = 'desktop') {
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
          headers: this.getHeaders(includeAuth, uaType),
          redirect: 'manual',
          signal: controller.signal
        });

        // Detect authwall / checkpoint / login URL directly
        const respUrl = response.url || currentUrl;
        if (respUrl.includes('/authwall') || respUrl.includes('/checkpoint/') || respUrl.includes('/login') || respUrl.includes('/uas/')) {
          throw new ProfileRestrictedError('LinkedIn restricted public access for this profile (redirected to authwall).');
        }

        // Check for 3xx redirect status
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const loc = response.headers && typeof response.headers.get === 'function' ? response.headers.get('location') : null;
          if (!loc) break;

          const nextUrl = loc.startsWith('http') ? loc : new URL(loc, currentUrl).href;

          if (nextUrl.includes('/authwall') || nextUrl.includes('/checkpoint/') || nextUrl.includes('/login') || nextUrl.includes('/uas/')) {
            throw new ProfileRestrictedError('LinkedIn restricted public access for this profile (redirected to authwall).');
          }

          if (visitedUrls.has(nextUrl)) {
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
        throw new NotFoundError(`LinkedIn profile '${extractVanityName(targetUrl) || targetUrl}' was not found.`);
      }

      // Handle 429 and LinkedIn 999 anti-scraping block
      if (statusCode === HTTP_STATUS.TOO_MANY_REQUESTS || statusCode === 999) {
        throw new UpstreamRateLimitError(`LinkedIn anti-bot protection triggered (HTTP ${statusCode}). Profile extraction is temporarily restricted by upstream.`);
      }

      // Handle 401 Unauthorized
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
        authenticated: includeAuth && Boolean(env.LINKEDIN_COOKIE || env.LINKEDIN_LI_AT)
      };
    } catch (err) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError') {
        throw new TimeoutError(`Request to LinkedIn upstream timed out after ${this.timeoutMs / 1000} seconds.`);
      }

      throw err;
    }
  }
}

module.exports = new LinkedInHttpClient();
