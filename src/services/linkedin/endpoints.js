/**
 * Verified LinkedIn Endpoints & URL Resolution Registry
 * Direct HTTP Reverse Engineering Layer
 */

const ENDPOINTS = {
  // Public Profile URL Pattern
  PROFILE_BASE: 'https://www.linkedin.com/in',
  
  // Direct Profile Request
  PROFILE_URL: (vanityName) => `https://www.linkedin.com/in/${encodeURIComponent(vanityName)}/`,

  // Core Identity / Voyager endpoints (observed via reverse engineering)
  VOYAGER_BASE: 'https://www.linkedin.com/voyager/api',
  VOYAGER_PROFILE: (vanityName) => `https://www.linkedin.com/voyager/api/identity/profiles/${encodeURIComponent(vanityName)}/profileView`,
  VOYAGER_DASH_PROFILE: (urn) => `https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${encodeURIComponent(urn)}`
};

/**
 * Extracts the clean vanity identifier from any canonicalized LinkedIn profile URL
 * @param {string} profileUrl 
 * @returns {string} vanityName (e.g. 'faiz-khatri-1912ab344' or 'satyanadella')
 */
function extractVanityName(profileUrl) {
  if (!profileUrl || typeof profileUrl !== 'string') return '';
  const match = profileUrl.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return match ? match[1].replace(/\/+$/, '') : '';
}

/**
 * Builds canonical target URL for direct HTTP request
 * @param {string} vanityName 
 * @returns {string} canonicalUrl
 */
function buildProfileUrl(vanityName) {
  return ENDPOINTS.PROFILE_URL(vanityName);
}

module.exports = {
  ENDPOINTS,
  extractVanityName,
  buildProfileUrl
};
