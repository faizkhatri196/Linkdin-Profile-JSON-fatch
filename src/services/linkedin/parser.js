const cheerio = require('cheerio');
const vm = require('vm');
const logger = require('../../utils/logger');
const { extractCoreProfile } = require('./profile');
const { extractExperience } = require('./experience');
const { extractEducation } = require('./education');
const { extractSkills } = require('./skills');
const { extractCertifications } = require('./certifications');
const { extractLanguages } = require('./languages');

class LinkedInParser {
  /**
   * Parse HTML and extract all available profile signals
   * @param {string} html 
   * @param {string} targetUrl 
   * @returns {object} Raw extracted fields
   */
  parse(html, targetUrl) {
    if (!html || typeof html !== 'string') {
      return this.emptyResult(targetUrl);
    }

    const $ = cheerio.load(html);

    // 1. Extract JSON-LD structured data (Schema.org Person / ProfilePage)
    const jsonLdData = this.extractJsonLd($);

    // 2. Extract OpenGraph & Meta tags
    const metaData = this.extractMetaData($);

    // 3. Extract from React Server Component (RSC) Rehydration Stream
    const rscData = this.extractRscData($);

    // 4. Extract Core Profile (Name, Headline, Location, About, Image)
    const core = extractCoreProfile($, jsonLdData, metaData, rscData);

    // 5. Extract Detailed Sections
    const experience = extractExperience($, jsonLdData, rscData);
    const education = extractEducation($, jsonLdData, rscData);
    const skills = extractSkills($, jsonLdData, rscData);
    const certifications = extractCertifications($, jsonLdData, rscData);
    const languages = extractLanguages($, jsonLdData, rscData);

    return {
      url: targetUrl || metaData.canonicalUrl || metaData.ogUrl || null,
      name: core.name,
      headline: core.headline,
      location: core.location,
      about: core.about,
      profileImage: core.profileImage,
      experience,
      education,
      skills,
      certifications,
      languages,
      additionalInfo: {
        ...metaData.additional,
        ...rscData.additional
      }
    };
  }

  emptyResult(targetUrl) {
    return {
      url: targetUrl || null,
      name: null,
      headline: null,
      location: null,
      about: null,
      profileImage: null,
      experience: [],
      education: [],
      skills: [],
      certifications: [],
      languages: [],
      additionalInfo: {}
    };
  }

  /**
   * Extract from React Server Component (RSC) Rehydration Stream
   */
  extractRscData($) {
    const result = {
      name: null,
      headline: null,
      location: null,
      about: null,
      profileImage: null,
      experience: [],
      education: [],
      skills: [],
      certifications: [],
      languages: [],
      additional: {}
    };

    // 1. Check title tag
    const titleTag = $('title').text() || '';
    if (titleTag && titleTag.includes('| LinkedIn')) {
      const cleanedTitle = titleTag.replace(/\s*\|\s*LinkedIn.*$/i, '').trim();
      if (cleanedTitle && cleanedTitle !== 'LinkedIn' && cleanedTitle !== 'Feed') {
        if (cleanedTitle.includes(' - ')) {
          const parts = cleanedTitle.split(' - ');
          result.name = parts[0].trim();
          result.headline = parts.slice(1).join(' - ').trim();
        } else {
          result.name = cleanedTitle;
        }
      }
    }

    const rawScript = $('script#rehydrate-data').html() || '';
    if (!rawScript.includes('__como_rehydration__')) {
      return result;
    }

    const context = { window: {} };
    vm.createContext(context);
    try {
      vm.runInContext(rawScript, context, { timeout: 3000 });
      const chunks = context.window.__como_rehydration__ || [];

      for (const chunk of chunks) {
        if (typeof chunk !== 'string') continue;

        // 1. Name from metadata title
        const metaTitleMatch = chunk.match(/\["title",null,\{"children":"([^"]+)\s*\|\s*LinkedIn"\}\]/);
        if (metaTitleMatch && !result.name) {
          const t = metaTitleMatch[1].trim();
          if (t.includes(' - ')) {
            const parts = t.split(' - ');
            result.name = parts[0].trim();
            if (!result.headline) result.headline = parts.slice(1).join(' - ').trim();
          } else {
            result.name = t;
          }
        }

        // 2. Name from children array containing 2-3 capitalized words
        const nameRegex = /"children":\["([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})"\]/g;
        let nm;
        while ((nm = nameRegex.exec(chunk)) !== null) {
          const cand = nm[1].trim();
          const blacklist = ['Send profile', 'Save to', 'About this', 'Stop seeing', 'Top card', 'Main Feed', 'LinkedIn Member', 'For third Party'];
          if (!blacklist.some(b => cand.includes(b)) && !result.name) {
            result.name = cand;
          }
        }

        // 3. Profile Avatar Image from imageRenditions
        if (!result.profileImage && chunk.includes('renderPayload') && chunk.includes('rootUrl')) {
          const rootMatch = chunk.match(/"rootUrl":\s*"([^"]+)"/);
          const suffixMatch = chunk.match(/"suffixUrl":\s*"([^"]+)"/);
          if (rootMatch && suffixMatch) {
            result.profileImage = rootMatch[1] + suffixMatch[1];
          }
        }

        // 4. Location
        const locRegex = /"children":\["([A-Za-z\s]+,\s*[A-Za-z\s]+(?:,\s*[A-Za-z\s]+)?)"\]/g;
        let lm;
        while ((lm = locRegex.exec(chunk)) !== null) {
          const cand = lm[1].trim();
          if (!result.location && !cand.includes('LinkedIn') && !cand.includes('Send') && !cand.includes('Save')) {
            result.location = cand;
          }
        }

        // 5. Headline / Top card children
        const headlineRegex = /"children":\["([A-Z][^"]*(?:\bat\b|@|Engineer|Developer|CEO|Founder|Manager|Student|Lead|Director|Specialist)[^"]*)"\]/g;
        let hm;
        while ((hm = headlineRegex.exec(chunk)) !== null) {
          const candidate = hm[1].trim();
          if (!candidate.includes('LinkedIn') && !candidate.includes('Unfollow') && !candidate.includes('Report') && !candidate.includes('Stop seeing') && !candidate.includes('Student at')) {
            if (!result.headline) result.headline = candidate;
          }
        }

        // 6. Summary
        const summaryMatch = chunk.match(/"summary":\s*"([^"]+)"/);
        if (summaryMatch && !result.about) {
          result.about = summaryMatch[1];
        }
      }
    } catch (e) {
      logger.debug(`Failed to parse RSC stream: ${e.message}`);
    }

    return result;
  }

  /**
   * Extract Schema.org structured metadata from <script type="application/ld+json">
   */
  extractJsonLd($) {
    const result = {
      name: null,
      headline: null,
      location: null,
      about: null,
      profileImage: null,
      worksFor: [],
      alumniOf: [],
      knowsAbout: []
    };

    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const rawContent = $(el).html();
        if (!rawContent) return;
        const parsed = JSON.parse(rawContent.trim());
        const items = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);

        for (const item of items) {
          if (!item) continue;
          const type = item['@type'];
          const isPerson = type === 'Person' || (Array.isArray(type) && type.includes('Person'));
          const isProfile = type === 'ProfilePage' || (Array.isArray(type) && type.includes('ProfilePage'));

          const person = isPerson ? item : (item.mainEntity && item.mainEntity['@type'] === 'Person' ? item.mainEntity : (isProfile ? item.mainEntity : null));

          if (person) {
            if (person.name && typeof person.name === 'string') {
              result.name = person.name.trim();
            } else if (person.givenName || person.familyName) {
              result.name = [person.givenName, person.familyName].filter(Boolean).join(' ').trim();
            }

            if (person.jobTitle) {
              result.headline = typeof person.jobTitle === 'string' ? person.jobTitle.trim() : (Array.isArray(person.jobTitle) ? person.jobTitle.join(', ') : null);
            }

            if (person.address) {
              if (typeof person.address === 'string') {
                result.location = person.address.trim();
              } else if (typeof person.address === 'object') {
                const parts = [
                  person.address.addressLocality,
                  person.address.addressRegion,
                  person.address.addressCountry
                ].filter(Boolean);
                if (parts.length) result.location = parts.join(', ');
              }
            }

            if (person.description && typeof person.description === 'string') {
              result.about = person.description.trim();
            }

            if (person.image) {
              if (typeof person.image === 'string') {
                result.profileImage = person.image.trim();
              } else if (person.image.contentUrl) {
                result.profileImage = person.image.contentUrl.trim();
              } else if (person.image.url) {
                result.profileImage = person.image.url.trim();
              }
            }

            if (person.worksFor) {
              const works = Array.isArray(person.worksFor) ? person.worksFor : [person.worksFor];
              result.worksFor.push(...works);
            }

            if (person.alumniOf) {
              const schools = Array.isArray(person.alumniOf) ? person.alumniOf : [person.alumniOf];
              result.alumniOf.push(...schools);
            }

            if (person.knowsAbout) {
              const skills = Array.isArray(person.knowsAbout) ? person.knowsAbout : [person.knowsAbout];
              result.knowsAbout.push(...skills);
            }
          }
        }
      } catch (err) {
        logger.debug(`Failed to parse JSON-LD chunk: ${err.message}`);
      }
    });

    return result;
  }

  /**
   * Extract OpenGraph and Twitter meta tag metadata
   */
  extractMetaData($) {
    const getMeta = (names) => {
      for (const name of names) {
        const val = $(`meta[property="${name}"]`).attr('content') ||
                    $(`meta[name="${name}"]`).attr('content') ||
                    $(`meta[itemprop="${name}"]`).attr('content');
        if (val && val.trim()) return val.trim();
      }
      return null;
    };

    const ogTitle = getMeta(['og:title', 'twitter:title']);
    const ogImage = getMeta(['og:image', 'twitter:image', 'image']);
    const ogDesc = getMeta(['og:description', 'twitter:description', 'description']);
    const ogUrl = getMeta(['og:url', 'canonical']);
    const canonical = $('link[rel="canonical"]').attr('href') || null;

    let parsedName = null;
    let parsedHeadline = null;
    let parsedLocation = null;

    if (ogTitle) {
      const cleaned = ogTitle.replace(/\s*\|\s*LinkedIn.*$/i, '').trim();
      if (cleaned.includes(' - ')) {
        const parts = cleaned.split(' - ');
        parsedName = parts[0].trim();
        parsedHeadline = parts.slice(1).join(' - ').trim();
      } else {
        parsedName = cleaned;
      }
    }

    let parsedAbout = ogDesc || null;
    if (ogDesc) {
      const parts = ogDesc.split(' · ');
      if (parts.length > 1 && !parsedLocation) {
        parsedLocation = parts[0].trim();
      }
    }

    return {
      name: parsedName,
      headline: parsedHeadline,
      location: parsedLocation,
      about: parsedAbout,
      profileImage: ogImage,
      ogUrl: ogUrl,
      canonicalUrl: canonical,
      additional: {
        metaTitle: ogTitle,
        metaDescription: ogDesc
      }
    };
  }
}

module.exports = new LinkedInParser();
