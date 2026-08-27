const { z } = require('zod');
const { InvalidUrlError, UnsupportedUrlError, ValidationError } = require('../utils/customErrors');

// URL Validation Regex
// Matches linkedin.com or any country subdomain (e.g., in.linkedin.com, uk.linkedin.com, www.linkedin.com)
const LINKEDIN_HOST_REGEX = /^(?:[a-zA-Z0-9-]+\.)*linkedin\.com$/i;
const PROFILE_PATH_REGEX = /^\/in\/([a-zA-Z0-9_%-]+)/i;
const INVALID_PATHS = /^\/(?:company|school|jobs|feed|learning|pulse|groups|showcase)\b/i;

const profileRequestSchema = z.object({
  url: z.string({
    required_error: 'The "url" field is required in the request body.',
    invalid_type_error: 'The "url" field must be a string.'
  }).trim().min(1, 'The "url" field cannot be empty.')
});

/**
 * Validates and normalizes LinkedIn Profile URL
 * @param {string} rawUrl 
 * @returns {string} canonical normalized URL
 */
function validateAndNormalizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new InvalidUrlError('LinkedIn profile URL is required.');
  }

  const trimmed = rawUrl.trim();

  // Basic security check: reject javascript:, data:, file: protocols
  if (/^(?:javascript|data|file|vbscript):/i.test(trimmed)) {
    throw new InvalidUrlError('Malformed or unsafe URL scheme.');
  }

  let parsed;
  try {
    // Ensure scheme is present
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    parsed = new URL(withScheme);
  } catch (err) {
    throw new InvalidUrlError('Invalid URL syntax. Please provide a valid HTTP/HTTPS URL.');
  }

  // Verify protocol
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new InvalidUrlError('URL scheme must be http or https.');
  }

  // Verify hostname is LinkedIn
  if (!LINKEDIN_HOST_REGEX.test(parsed.hostname)) {
    throw new InvalidUrlError(`Hostname "${parsed.hostname}" is not a valid LinkedIn domain.`);
  }

  // Check for company/school/feed/jobs unsupported paths
  if (INVALID_PATHS.test(parsed.pathname)) {
    throw new UnsupportedUrlError(`URL points to an unsupported LinkedIn resource ("${parsed.pathname}"). Only personal profile URLs (/in/...) are supported.`);
  }

  // Verify profile path format (/in/username)
  const match = parsed.pathname.match(PROFILE_PATH_REGEX);
  if (!match) {
    throw new UnsupportedUrlError('Valid LinkedIn URL, but does not match personal profile path format (expected /in/{username}).');
  }

  const vanityName = match[1];
  if (!vanityName || vanityName.length < 2) {
    throw new InvalidUrlError('LinkedIn vanity profile name is invalid or too short.');
  }

  // Canonicalize to clean HTTPS URL without query params, trailing slashes, or hash
  const canonicalUrl = `https://www.linkedin.com/in/${vanityName}/`;
  return { canonicalUrl, vanityName };
}

/**
 * Validates the full request payload
 * @param {object} body 
 * @returns {{ url: string, vanityName: string }}
 */
function validateProfileRequest(body) {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a valid JSON object with a "url" property.');
  }

  const parseResult = profileRequestSchema.safeParse(body);
  if (!parseResult.success) {
    const issue = parseResult.error.issues[0];
    throw new ValidationError(issue.message);
  }

  return validateAndNormalizeUrl(parseResult.data.url);
}

module.exports = {
  validateAndNormalizeUrl,
  validateProfileRequest
};
