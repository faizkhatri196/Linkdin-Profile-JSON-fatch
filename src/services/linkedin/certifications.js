/**
 * Certifications Extraction & Normalization Module
 */
const { parseDateRange } = require('./experience');

function extractCertifications($, jsonLdData, rscData) {
  const certs = [];
  const seen = new Set();

  // 1. Extract from DOM
  $('section.certifications-section li, .certifications__list li, .certification-item, [data-section="certifications"] li').each((_, el) => {
    const $item = $(el);
    const name = $item.find('h3, .profile-section-card__title').first().text().trim();
    const issuer = $item.find('h4, .profile-section-card__subtitle').first().text().trim();
    const dateRange = $item.find('.profile-section-card__metadata, time').first().text().trim();

    if (name) {
      const key = `${name}|${issuer}`.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        const { startDate } = parseDateRange(dateRange);
        certs.push({
          name: name,
          issuer: issuer || '',
          issueDate: startDate || '',
          expirationDate: '',
          credentialId: ''
        });
      }
    }
  });

  // 2. Extract from RSC stream
  if (rscData && Array.isArray(rscData.certifications)) {
    for (const cert of rscData.certifications) {
      const key = `${cert.name}|${cert.issuer}`.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        certs.push(cert);
      }
    }
  }

  return certs;
}

module.exports = { extractCertifications };
