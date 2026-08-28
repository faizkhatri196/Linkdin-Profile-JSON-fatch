/**
 * Languages Extraction & Normalization Module
 */
function extractLanguages($, jsonLdData, rscData) {
  const languages = [];
  const seen = new Set();

  // 1. Extract from DOM
  $('section.languages-section li, ul.languages__list li, .language-item, [data-section="languages"] li').each((_, el) => {
    const name = $(el).find('h3, strong').first().text().trim();
    const prof = $(el).find('p, span').last().text().trim();
    if (name) {
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        languages.push({
          name: name,
          proficiency: prof || ''
        });
      }
    }
  });

  // 2. Extract from RSC stream
  if (rscData && Array.isArray(rscData.languages)) {
    for (const lang of rscData.languages) {
      const key = lang.name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        languages.push(lang);
      }
    }
  }

  return languages;
}

module.exports = { extractLanguages };
