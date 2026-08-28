/**
 * Data Normalizer Module
 * Transforms extracted signals into the strict target JSON schema
 * Tracks fieldsAvailable and fieldsUnavailable with zero fabrication
 */

class LinkedInNormalizer {
  normalize(raw, targetUrl, options = {}) {
    const { cached = false, authenticated = false } = options;

    // Build strictly typed profile schema
    const profile = {
      url: targetUrl || raw.url || null,
      name: this.cleanString(raw.name),
      headline: this.cleanString(raw.headline),
      location: this.cleanString(raw.location),
      about: this.cleanString(raw.about),
      profileImage: this.cleanUrl(raw.profileImage),
      experience: this.normalizeExperience(raw.experience),
      education: this.normalizeEducation(raw.education),
      skills: this.normalizeSkills(raw.skills),
      certifications: this.normalizeCertifications(raw.certifications),
      languages: this.normalizeLanguages(raw.languages)
    };

    // Track field presence truthfully
    const fieldsAvailable = [];
    const fieldsUnavailable = [];

    const fieldChecklist = [
      { key: 'name', val: profile.name },
      { key: 'headline', val: profile.headline },
      { key: 'location', val: profile.location },
      { key: 'about', val: profile.about },
      { key: 'profileImage', val: profile.profileImage },
      { key: 'experience', val: profile.experience.length > 0 },
      { key: 'education', val: profile.education.length > 0 },
      { key: 'skills', val: profile.skills.length > 0 },
      { key: 'certifications', val: profile.certifications.length > 0 },
      { key: 'languages', val: profile.languages.length > 0 }
    ];

    for (const item of fieldChecklist) {
      if (item.val) {
        fieldsAvailable.push(item.key);
      } else {
        fieldsUnavailable.push(item.key);
      }
    }

    return {
      success: true,
      source: 'linkedin',
      profile,
      metadata: {
        retrievedAt: new Date().toISOString(),
        cached,
        fieldsAvailable,
        fieldsUnavailable,
        publicExtraction: !authenticated
      }
    };
  }

  cleanString(val) {
    if (!val || typeof val !== 'string') return null;
    const trimmed = val.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  cleanUrl(val) {
    if (!val || typeof val !== 'string') return null;
    const trimmed = val.trim();
    return trimmed.startsWith('http') ? trimmed : null;
  }

  normalizeExperience(list) {
    if (!Array.isArray(list)) return [];
    return list.map(item => ({
      title: this.cleanString(item.title) || '',
      company: this.cleanString(item.company) || '',
      location: this.cleanString(item.location) || '',
      startDate: this.cleanString(item.startDate) || '',
      endDate: this.cleanString(item.endDate) || '',
      description: this.cleanString(item.description) || ''
    })).filter(item => item.title || item.company);
  }

  normalizeEducation(list) {
    if (!Array.isArray(list)) return [];
    return list.map(item => ({
      institution: this.cleanString(item.institution) || '',
      degree: this.cleanString(item.degree) || '',
      fieldOfStudy: this.cleanString(item.fieldOfStudy) || '',
      startDate: this.cleanString(item.startDate) || '',
      endDate: this.cleanString(item.endDate) || '',
      description: this.cleanString(item.description) || ''
    })).filter(item => item.institution);
  }

  normalizeSkills(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const result = [];
    for (const item of list) {
      const name = typeof item === 'string' ? item : (item.name || '');
      const cleaned = this.cleanString(name);
      if (cleaned && !seen.has(cleaned.toLowerCase())) {
        seen.add(cleaned.toLowerCase());
        result.push({ name: cleaned });
      }
    }
    return result;
  }

  normalizeCertifications(list) {
    if (!Array.isArray(list)) return [];
    return list.map(item => ({
      name: this.cleanString(item.name) || '',
      issuer: this.cleanString(item.issuer) || '',
      issueDate: this.cleanString(item.issueDate) || '',
      expirationDate: this.cleanString(item.expirationDate) || '',
      credentialId: this.cleanString(item.credentialId) || ''
    })).filter(item => item.name);
  }

  normalizeLanguages(list) {
    if (!Array.isArray(list)) return [];
    return list.map(item => ({
      name: this.cleanString(item.name) || '',
      proficiency: this.cleanString(item.proficiency) || ''
    })).filter(item => item.name);
  }
}

module.exports = new LinkedInNormalizer();
