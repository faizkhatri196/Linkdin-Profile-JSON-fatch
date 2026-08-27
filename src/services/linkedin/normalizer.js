/**
 * Normalizes extracted raw fields into standard JSON contract.
 * Strictly adheres to truthfulness: Missing fields are set to null or empty arrays.
 * NEVER invents or mocks data.
 */

class LinkedInNormalizer {
  /**
   * Normalize profile data
   * @param {object} rawData 
   * @param {string} canonicalUrl 
   * @param {object} options 
   * @returns {object} Standardized response object
   */
  normalize(rawData = {}, canonicalUrl = '', options = {}) {
    const profile = {
      url: canonicalUrl || rawData.url || null,
      name: this.cleanString(rawData.name),
      headline: this.cleanString(rawData.headline),
      location: this.cleanString(rawData.location),
      about: this.cleanString(rawData.about),
      profileImage: this.cleanImageUrl(rawData.profileImage),
      experience: this.normalizeExperience(rawData.experience),
      education: this.normalizeEducation(rawData.education),
      skills: this.normalizeSkills(rawData.skills),
      certifications: this.normalizeCertifications(rawData.certifications),
      languages: this.normalizeLanguages(rawData.languages)
    };

    // Calculate available vs unavailable fields for transparent reporting
    const trackedFields = ['name', 'headline', 'location', 'about', 'profileImage', 'experience', 'education', 'skills', 'certifications', 'languages'];
    const fieldsAvailable = [];
    const fieldsUnavailable = [];

    for (const field of trackedFields) {
      const val = profile[field];
      if (val !== null && (!Array.isArray(val) || val.length > 0)) {
        fieldsAvailable.push(field);
      } else {
        fieldsUnavailable.push(field);
      }
    }

    const metadata = {
      retrievedAt: new Date().toISOString(),
      cached: Boolean(options.cached),
      fieldsAvailable,
      fieldsUnavailable,
      publicExtraction: Boolean(!options.authenticated)
    };

    return {
      success: true,
      source: 'linkedin',
      profile,
      metadata
    };
  }

  cleanString(str) {
    if (!str || typeof str !== 'string') return null;
    const trimmed = str.replace(/\s+/g, ' ').trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  cleanImageUrl(url) {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    return null;
  }

  normalizeExperience(list) {
    if (!Array.isArray(list)) return [];
    return list.map(item => {
      if (!item || typeof item !== 'object') return null;
      const title = this.cleanString(item.title) || '';
      const company = this.cleanString(item.company) || '';
      if (!title && !company) return null;
      return {
        title: title,
        company: company,
        location: this.cleanString(item.location) || '',
        startDate: this.cleanString(item.startDate) || '',
        endDate: this.cleanString(item.endDate) || '',
        description: this.cleanString(item.description) || ''
      };
    }).filter(Boolean);
  }

  normalizeEducation(list) {
    if (!Array.isArray(list)) return [];
    return list.map(item => {
      if (!item || typeof item !== 'object') return null;
      const inst = this.cleanString(item.institution) || '';
      if (!inst) return null;
      return {
        institution: inst,
        degree: this.cleanString(item.degree) || '',
        fieldOfStudy: this.cleanString(item.fieldOfStudy) || '',
        startDate: this.cleanString(item.startDate) || '',
        endDate: this.cleanString(item.endDate) || '',
        description: this.cleanString(item.description) || ''
      };
    }).filter(Boolean);
  }

  normalizeSkills(list) {
    if (!Array.isArray(list)) return [];
    const unique = new Set();
    for (const item of list) {
      const cleaned = this.cleanString(typeof item === 'string' ? item : (item && item.name));
      if (cleaned && cleaned.length < 100) {
        unique.add(cleaned);
      }
    }
    return Array.from(unique);
  }

  normalizeCertifications(list) {
    if (!Array.isArray(list)) return [];
    return list.map(item => {
      if (!item || typeof item !== 'object') return null;
      const name = this.cleanString(item.name) || '';
      if (!name) return null;
      return {
        name: name,
        issuer: this.cleanString(item.issuer) || '',
        issueDate: this.cleanString(item.issueDate) || '',
        expirationDate: this.cleanString(item.expirationDate) || '',
        credentialId: this.cleanString(item.credentialId) || ''
      };
    }).filter(Boolean);
  }

  normalizeLanguages(list) {
    if (!Array.isArray(list)) return [];
    return list.map(item => {
      if (!item || typeof item !== 'object') return null;
      const name = this.cleanString(item.name) || '';
      if (!name) return null;
      return {
        name: name,
        proficiency: this.cleanString(item.proficiency) || ''
      };
    }).filter(Boolean);
  }
}

module.exports = new LinkedInNormalizer();
