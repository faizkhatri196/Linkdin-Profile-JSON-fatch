const cheerio = require('cheerio');
const vm = require('vm');
const logger = require('../../utils/logger');

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

    // 3. Extract Public DOM Elements & Microdata
    const domData = this.extractDomData($);

    // 4. Extract from React Server Component (RSC) Rehydration Stream
    const rscData = this.extractRscData($);

    // Merge and synthesize extracted data with priority: JSON-LD > RSC > DOM > OpenGraph
    const combined = {
      url: targetUrl || metaData.canonicalUrl || metaData.ogUrl || null,
      name: jsonLdData.name || rscData.name || domData.name || metaData.name || null,
      headline: jsonLdData.headline || rscData.headline || domData.headline || metaData.headline || null,
      location: jsonLdData.location || rscData.location || domData.location || metaData.location || null,
      about: jsonLdData.about || rscData.about || domData.about || metaData.about || null,
      profileImage: jsonLdData.profileImage || rscData.profileImage || domData.profileImage || metaData.profileImage || null,
      experience: jsonLdData.experience.length ? jsonLdData.experience : (rscData.experience.length ? rscData.experience : domData.experience),
      education: jsonLdData.education.length ? jsonLdData.education : (rscData.education.length ? rscData.education : domData.education),
      skills: jsonLdData.skills.length ? jsonLdData.skills : (rscData.skills.length ? rscData.skills : domData.skills),
      certifications: jsonLdData.certifications.length ? jsonLdData.certifications : (rscData.certifications.length ? rscData.certifications : domData.certifications),
      languages: jsonLdData.languages.length ? jsonLdData.languages : (rscData.languages.length ? rscData.languages : domData.languages),
      additionalInfo: {
        ...metaData.additional,
        ...domData.additional,
        ...rscData.additional
      }
    };

    return combined;
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
      experience: [],
      education: [],
      skills: [],
      certifications: [],
      languages: []
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
            // Name
            if (person.name && typeof person.name === 'string') {
              result.name = person.name.trim();
            } else if (person.givenName || person.familyName) {
              result.name = [person.givenName, person.familyName].filter(Boolean).join(' ').trim();
            }

            // Headline / Job title
            if (person.jobTitle) {
              result.headline = typeof person.jobTitle === 'string' ? person.jobTitle.trim() : (Array.isArray(person.jobTitle) ? person.jobTitle.join(', ') : null);
            }

            // Location
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

            // About / Description
            if (person.description && typeof person.description === 'string') {
              result.about = person.description.trim();
            }

            // Image
            if (person.image) {
              if (typeof person.image === 'string') {
                result.profileImage = person.image.trim();
              } else if (person.image.contentUrl) {
                result.profileImage = person.image.contentUrl.trim();
              } else if (person.image.url) {
                result.profileImage = person.image.url.trim();
              }
            }

            // Experience from worksFor / organization
            if (person.worksFor) {
              const works = Array.isArray(person.worksFor) ? person.worksFor : [person.worksFor];
              for (const w of works) {
                if (!w) continue;
                const company = typeof w === 'string' ? w : (w.name || w.legalName || null);
                if (company) {
                  result.experience.push({
                    title: person.jobTitle || '',
                    company: company,
                    location: '',
                    startDate: '',
                    endDate: '',
                    description: ''
                  });
                }
              }
            }

            // Education from alumniOf
            if (person.alumniOf) {
              const schools = Array.isArray(person.alumniOf) ? person.alumniOf : [person.alumniOf];
              for (const s of schools) {
                if (!s) continue;
                const inst = typeof s === 'string' ? s : (s.name || null);
                if (inst) {
                  result.education.push({
                    institution: inst,
                    degree: '',
                    fieldOfStudy: '',
                    startDate: '',
                    endDate: '',
                    description: ''
                  });
                }
              }
            }

            // Skills from knowsAbout
            if (person.knowsAbout) {
              const skills = Array.isArray(person.knowsAbout) ? person.knowsAbout : [person.knowsAbout];
              result.skills = skills.map(sk => (typeof sk === 'string' ? sk : sk.name)).filter(Boolean);
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

  /**
   * Extract from public DOM selectors, microdata, and top cards
   */
  extractDomData($) {
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

    // Name Selectors
    const nameEl = $('h1.top-card-layout__title, h1.top-card__title, .top-card__name, [data-anonymize="person-name"], h1.v-align-middle, .pv-top-card--list h1').first();
    if (nameEl.length) {
      result.name = nameEl.text().trim();
    }

    // Headline Selectors
    const headlineEl = $('.top-card-layout__headline, .top-card__subline, .pv-top-card--list-bullet h2, h2.top-card-layout__headline').first();
    if (headlineEl.length) {
      result.headline = headlineEl.text().trim();
    }

    // Location Selectors
    const locationEl = $('.top-card__subline-item, .top-card-layout__first-subline, .pv-top-card--list-bullet li, .profile-info-subheader').first();
    if (locationEl.length) {
      const locText = locationEl.text().trim().replace(/\s+/g, ' ');
      if (!locText.toLowerCase().includes('connections') && !locText.toLowerCase().includes('followers')) {
        result.location = locText;
      }
    }

    // About / Summary Selectors
    const aboutEl = $('.core-section-container__content p, .summary-section p, .about-section .pv-about__summary-text, [data-section="summary"] p').first();
    if (aboutEl.length) {
      result.about = aboutEl.text().trim();
    }

    // Profile Image Selectors
    const imgEl = $('img.top-card-layout__entity-image, img.profile-image, img[data-anonymize="headshot-photo"], .pv-top-card__photo img').first();
    if (imgEl.length) {
      const src = imgEl.attr('src') || imgEl.attr('data-delayed-url') || imgEl.attr('data-ghost-url');
      if (src && !src.includes('data:image/gif') && !src.includes('ghost-person')) {
        result.profileImage = src.trim();
      }
    }

    // Experience Items
    $('section.experience-section li, ul.experience__list li, .experience-item, li.experience-group').each((_, el) => {
      const $item = $(el);
      const title = $item.find('h3, .experience-item__title, .profile-section-card__title').first().text().trim();
      const company = $item.find('h4, .experience-item__subtitle, .profile-section-card__subtitle').first().text().trim();
      const dateRange = $item.find('.date-range, .experience-item__duration, .profile-section-card__metadata').first().text().trim();
      const location = $item.find('.experience-item__location').first().text().trim();
      const description = $item.find('p.show-more-less-text__text--more, .experience-item__description').first().text().trim();

      if (title || company) {
        const { startDate, endDate } = this.parseDateRange(dateRange);
        result.experience.push({
          title: title || '',
          company: company || '',
          location: location || '',
          startDate: startDate || '',
          endDate: endDate || '',
          description: description || ''
        });
      }
    });

    // Education Items
    $('section.education-section li, ul.education__list li, .education-item').each((_, el) => {
      const $item = $(el);
      const inst = $item.find('h3, .education__school-name, .profile-section-card__title').first().text().trim();
      const degree = $item.find('h4, .education__degree-name, .profile-section-card__subtitle').first().text().trim();
      const dateRange = $item.find('.date-range, .education__dates, .profile-section-card__metadata').first().text().trim();
      const description = $item.find('p, .education-item__description').first().text().trim();

      if (inst) {
        const { startDate, endDate } = this.parseDateRange(dateRange);
        result.education.push({
          institution: inst,
          degree: degree || '',
          fieldOfStudy: '',
          startDate: startDate || '',
          endDate: endDate || '',
          description: description || ''
        });
      }
    });

    // Certifications
    $('section.certifications-section li, .certifications__list li, .certification-item').each((_, el) => {
      const $item = $(el);
      const name = $item.find('h3, .profile-section-card__title').first().text().trim();
      const issuer = $item.find('h4, .profile-section-card__subtitle').first().text().trim();
      const dateRange = $item.find('.profile-section-card__metadata').first().text().trim();

      if (name) {
        const { startDate } = this.parseDateRange(dateRange);
        result.certifications.push({
          name: name,
          issuer: issuer || '',
          issueDate: startDate || '',
          expirationDate: '',
          credentialId: ''
        });
      }
    });

    // Skills
    $('section.skills-section li, ul.skills__list li, .skill-item').each((_, el) => {
      const skillText = $(el).text().trim();
      if (skillText && skillText.length < 100) {
        result.skills.push(skillText);
      }
    });

    // Languages
    $('section.languages-section li, ul.languages__list li, .language-item').each((_, el) => {
      const name = $(el).find('h3, strong').first().text().trim();
      const prof = $(el).find('p, span').last().text().trim();
      if (name) {
        result.languages.push({
          name: name,
          proficiency: prof || ''
        });
      }
    });

    return result;
  }

  parseDateRange(raw) {
    if (!raw) return { startDate: '', endDate: '' };
    const cleaned = raw.replace(/\s+/g, ' ').trim();
    const parts = cleaned.split(/–|-| to /i);
    return {
      startDate: (parts[0] || '').trim(),
      endDate: (parts[1] || '').trim()
    };
  }
}

module.exports = new LinkedInParser();
