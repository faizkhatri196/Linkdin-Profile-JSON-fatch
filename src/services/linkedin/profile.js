/**
 * Core Profile Signal Extraction Module
 */
function extractCoreProfile($, jsonLdData, metaData, rscData) {
  let name = jsonLdData?.name || rscData?.name || metaData?.name || null;
  let headline = jsonLdData?.headline || rscData?.headline || metaData?.headline || null;
  let location = jsonLdData?.location || rscData?.location || metaData?.location || null;
  let about = jsonLdData?.about || rscData?.about || metaData?.about || null;
  let profileImage = jsonLdData?.profileImage || rscData?.profileImage || metaData?.profileImage || null;

  // DOM Fallback for Name
  if (!name) {
    const nameEl = $('h1.top-card-layout__title, h1.top-card__title, .top-card__name, [data-anonymize="person-name"], h1.v-align-middle, .pv-top-card--list h1').first();
    if (nameEl.length) name = nameEl.text().trim();
  }

  // DOM Fallback for Headline
  if (!headline) {
    const headlineEl = $('.top-card-layout__headline, .top-card__subline, .pv-top-card--list-bullet h2, h2.top-card-layout__headline').first();
    if (headlineEl.length) headline = headlineEl.text().trim();
  }

  // DOM Fallback for Location
  if (!location) {
    const locationEl = $('.top-card__subline-item, .top-card-layout__first-subline, .pv-top-card--list-bullet li, .profile-info-subheader').first();
    if (locationEl.length) {
      const locText = locationEl.text().trim().replace(/\s+/g, ' ');
      if (!locText.toLowerCase().includes('connections') && !locText.toLowerCase().includes('followers')) {
        location = locText;
      }
    }
  }

  // DOM Fallback for About
  if (!about) {
    const aboutEl = $('.core-section-container__content p, .summary-section p, .about-section .pv-about__summary-text, [data-section="summary"] p').first();
    if (aboutEl.length) about = aboutEl.text().trim();
  }

  // DOM Fallback for Image
  if (!profileImage) {
    const imgEl = $('img.top-card-layout__entity-image, img.profile-image, img[data-anonymize="headshot-photo"], .pv-top-card__photo img').first();
    if (imgEl.length) {
      const src = imgEl.attr('src') || imgEl.attr('data-delayed-url') || imgEl.attr('data-ghost-url');
      if (src && !src.includes('data:image/gif') && !src.includes('ghost-person')) {
        profileImage = src.trim();
      }
    }
  }

  return { name, headline, location, about, profileImage };
}

module.exports = { extractCoreProfile };
