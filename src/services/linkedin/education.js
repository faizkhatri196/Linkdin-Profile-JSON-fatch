/**
 * Education Extraction & Normalization Module
 */
const { parseDateRange } = require('./experience');

function extractEducation($, jsonLdData, rscData) {
  const educationList = [];
  const seenSchools = new Set();

  // 1. Extract from DOM
  $('section.education-section li, ul.education__list li, .education-item, [data-section="education"] li').each((_, el) => {
    const $item = $(el);
    const inst = $item.find('h3, .education__school-name, .profile-section-card__title, [data-anonymize="school-name"]').first().text().trim();
    const degree = $item.find('h4, .education__degree-name, .profile-section-card__subtitle, [data-anonymize="degree"]').first().text().trim();
    const dateRange = $item.find('.date-range, .education__dates, .profile-section-card__metadata, time').first().text().trim();
    const description = $item.find('p, .education-item__description').first().text().trim();

    if (inst) {
      seenSchools.add(inst.toLowerCase());
      const { startDate, endDate } = parseDateRange(dateRange);
      educationList.push({
        institution: inst,
        degree: degree || '',
        fieldOfStudy: '',
        startDate: startDate || '',
        endDate: endDate || '',
        description: description || ''
      });
    }
  });

  // 2. Extract from JSON-LD alumniOf (only if not already found in DOM)
  if (jsonLdData && Array.isArray(jsonLdData.alumniOf)) {
    for (const a of jsonLdData.alumniOf) {
      const school = typeof a === 'string' ? a : (a.name || '');
      if (school && !seenSchools.has(school.toLowerCase())) {
        seenSchools.add(school.toLowerCase());
        educationList.push({
          institution: school,
          degree: '',
          fieldOfStudy: '',
          startDate: '',
          endDate: '',
          description: ''
        });
      }
    }
  }

  // 3. Extract from RSC stream
  if (rscData && Array.isArray(rscData.education)) {
    for (const edu of rscData.education) {
      const schoolKey = (edu.institution || '').toLowerCase();
      if (schoolKey && !seenSchools.has(schoolKey)) {
        seenSchools.add(schoolKey);
        educationList.push(edu);
      }
    }
  }

  return educationList;
}

module.exports = { extractEducation };
