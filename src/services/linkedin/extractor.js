const env = require('../../config/env');
const logger = require('../../utils/logger');
const { USER_AGENTS } = require('../../config/constants');
const {
  NotFoundError,
  ProfileRestrictedError,
  UpstreamRateLimitError,
  ExtractionError
} = require('../../utils/customErrors');

class LinkedInExtractor {
  constructor() {
    this.timeout = env.SCRAPER_TIMEOUT_MS;
  }

  /**
   * Generates realistic browser headers
   */
  getHeaders() {
    const randomUserAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const headers = {
      'User-Agent': randomUserAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    };

    // Attach session cookies if provided via environment variables (optional authenticated strategy)
    const cookies = [];
    if (env.LINKEDIN_LI_AT) {
      cookies.push(`li_at=${env.LINKEDIN_LI_AT}`);
    }
    if (env.LINKEDIN_JSESSIONID) {
      cookies.push(`JSESSIONID="${env.LINKEDIN_JSESSIONID}"`);
    }
    if (cookies.length > 0) {
      headers['Cookie'] = cookies.join('; ');
    }

    return headers;
  }

  /**
   * Fetches raw HTML for a LinkedIn profile URL
   * @param {string} targetUrl 
   * @returns {Promise<{ html: string, status: number, finalUrl: string }>}
   */
  async fetchProfileHtml(targetUrl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      logger.info(`Fetching profile from LinkedIn: ${targetUrl}`);
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: this.getHeaders(),
        redirect: 'follow',
        signal: controller.signal
      });

      clearTimeout(timer);

      const status = response.status;
      const finalUrl = response.url || targetUrl;

      // Handle LinkedIn-specific response codes & authwalls
      if (status === 404) {
        throw new NotFoundError(`The LinkedIn profile at ${targetUrl} was not found (HTTP 404).`);
      }

      if (status === 429 || status === 999) {
        logger.warn(`LinkedIn anti-scraping triggered (HTTP ${status})`);
        throw new UpstreamRateLimitError(`LinkedIn anti-bot protection triggered (HTTP ${status}). Profile extraction is temporarily restricted by upstream.`);
      }

      if (status === 403 || status === 401) {
        throw new ProfileRestrictedError(`The LinkedIn profile at ${targetUrl} is private or requires authentication (HTTP ${status}).`);
      }

      // Check if redirected to authwall / login
      if (finalUrl.includes('linkedin.com/authwall') || finalUrl.includes('linkedin.com/login') || finalUrl.includes('linkedin.com/checkpoint')) {
        logger.warn(`LinkedIn redirected to authwall: ${finalUrl}`);
        throw new ProfileRestrictedError('LinkedIn redirected request to an authentication checkpoint/authwall. The requested profile requires authenticated access.');
      }

      if (!response.ok) {
        throw new ExtractionError(`LinkedIn upstream returned unexpected status code: ${status}`, null, 502);
      }

      const html = await response.text();
      return { html, status, finalUrl };
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new ExtractionError(`Request to LinkedIn timed out after ${this.timeout}ms.`, null, 504);
      }
      // Re-throw our domain errors directly
      if (err.statusCode) {
        throw err;
      }
      logger.error(`Failed to fetch profile: ${err.message}`);
      throw new ExtractionError(`Network or upstream error connecting to LinkedIn: ${err.message}`, null, 502);
    }
  }
}

module.exports = new LinkedInExtractor();
