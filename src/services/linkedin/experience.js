/**
 * Experience Extraction & Normalization Module
 */
function extractExperience($, jsonLdData, rscData) {
  const experiences = [];
  const seenCompanies = new Set();

  // 1. Extract from DOM
  $('section.experience-section li, ul.experience__list li, .experience-item, li.experience-group, [data-section="experience"] li').each((_, el) => {
    const $item = $(el);
    const title = $item.find('h3, .experience-item__title, .profile-section-card__title, [data-anonymize="job-title"]').first().text().trim();
    const company = $item.find('h4, .experience-item__subtitle, .profile-section-card__subtitle, [data-anonymize="company-name"]').first().text().trim();
    const dateRange = $item.find('.date-range, .experience-item__duration, .profile-section-card__metadata, time').first().text().trim();
    const location = $item.find('.experience-item__location, [data-anonymize="location"]').first().text().trim();
    const description = $item.find('p.show-more-less-text__text--more, .experience-item__description, p').first().text().trim();

    if (title || company) {
      const compKey = company.toLowerCase();
      if (compKey) seenCompanies.add(compKey);
      const { startDate, endDate } = parseDateRange(dateRange);
      experiences.push({
        title: title || '',
        company: company || '',
        location: location || '',
        startDate: startDate || '',
        endDate: endDate || '',
        description: description || ''
      });
    }
  });

  // 2. Extract from JSON-LD worksFor (only if not already found in DOM/RSC)
  if (jsonLdData && Array.isArray(jsonLdData.worksFor)) {
    for (const w of jsonLdData.worksFor) {
      const compName = typeof w === 'string' ? w : (w.name || w.legalName || '');
      if (compName && !seenCompanies.has(compName.toLowerCase())) {
        seenCompanies.add(compName.toLowerCase());
        experiences.push({
          title: jsonLdData.jobTitle || '',
          company: compName,
          location: jsonLdData.address || '',
          startDate: '',
          endDate: '',
          description: ''
        });
      }
    }
  }

  // 3. Extract from RSC stream
  if (rscData && Array.isArray(rscData.experience)) {
    for (const exp of rscData.experience) {
      const compKey = (exp.company || '').toLowerCase();
      if (compKey && !seenCompanies.has(compKey)) {
        seenCompanies.add(compKey);
        experiences.push(exp);
      }
    }
  }

  return experiences;
}

function parseDateRange(raw) {
  if (!raw) return { startDate: '', endDate: '' };
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  const parts = cleaned.split(/–|-| to /i);
  return {
    startDate: (parts[0] || '').trim(),
    endDate: (parts[1] || '').trim()
  };
}

module.exports = { extractExperience, parseDateRange };
