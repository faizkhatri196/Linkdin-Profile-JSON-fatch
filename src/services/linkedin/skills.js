/**
 * Skills Extraction & Normalization Module
 */
function extractSkills($, jsonLdData, rscData) {
  const skillsList = [];
  const seen = new Set();

  const addSkill = (name) => {
    if (!name || typeof name !== 'string') return;
    const cleaned = name.trim();
    if (!cleaned || cleaned.length > 80 || cleaned.length < 2) return;
    const lower = cleaned.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      skillsList.push({ name: cleaned });
    }
  };

  // 1. Extract from DOM
  $('section.skills-section li, ul.skills__list li, .skill-item, [data-section="skills"] li, .pv-skill-category-entity__name-node').each((_, el) => {
    const text = $(el).find('h3, span, a').first().text().trim() || $(el).text().trim();
    addSkill(text);
  });

  // 2. Extract from JSON-LD knowsAbout
  if (jsonLdData && Array.isArray(jsonLdData.knowsAbout)) {
    for (const sk of jsonLdData.knowsAbout) {
      const name = typeof sk === 'string' ? sk : (sk.name || '');
      addSkill(name);
    }
  }

  // 3. Extract from RSC stream
  if (rscData && Array.isArray(rscData.skills)) {
    for (const sk of rscData.skills) {
      const name = typeof sk === 'string' ? sk : (sk.name || '');
      addSkill(name);
    }
  }

  return skillsList;
}

module.exports = { extractSkills };
