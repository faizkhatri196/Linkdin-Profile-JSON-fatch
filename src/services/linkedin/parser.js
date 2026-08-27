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

    // 5. Extract from embedded <code> and <script> JSON blobs (Voyager/Dash payloads)
    const codeBlobData = this.extractCodeBlobs($);

    // 6. Merge array fields across all extractors with deduplication
    const experience = this.mergeExperiences([
      jsonLdData.experience,
      rscData.experience,
      codeBlobData.experience,
      domData.experience,
      metaData.experience
    ]);

    const education = this.mergeEducations([
      jsonLdData.education,
      rscData.education,
      codeBlobData.education,
      domData.education,
      metaData.education
    ]);

    const skills = this.mergeUniqueStrings([
      jsonLdData.skills,
      rscData.skills,
      codeBlobData.skills,
      domData.skills
    ]);

    const certifications = this.mergeCertifications([
      jsonLdData.certifications,
      rscData.certifications,
      codeBlobData.certifications,
      domData.certifications
    ]);

    const languages = this.mergeLanguages([
      jsonLdData.languages,
      rscData.languages,
      codeBlobData.languages,
      domData.languages
    ]);

    const resolvedName = jsonLdData.name || rscData.name || codeBlobData.name || domData.name || metaData.name || null;
    const resolvedHeadline = jsonLdData.headline || rscData.headline || codeBlobData.headline || domData.headline || metaData.headline || null;
    const resolvedLocation = jsonLdData.location || rscData.location || codeBlobData.location || domData.location || metaData.location || null;
    const resolvedAbout = jsonLdData.about || rscData.about || codeBlobData.about || domData.about || metaData.about || null;
    const resolvedImage = jsonLdData.profileImage || rscData.profileImage || codeBlobData.profileImage || domData.profileImage || metaData.profileImage || null;

    // 7. Intelligent Fallbacks from Headline & Meta for Experience & Education
    if (experience.length === 0 && resolvedHeadline) {
      const parsedExp = this.parseExperienceFromHeadline(resolvedHeadline);
      if (parsedExp) {
        experience.push(parsedExp);
      }
    }

    if (education.length === 0 && (resolvedHeadline || resolvedAbout)) {
      const parsedEdu = this.parseEducationFromText(resolvedHeadline, resolvedAbout);
      if (parsedEdu) {
        education.push(parsedEdu);
      }
    }

    return {
      url: targetUrl || metaData.canonicalUrl || metaData.ogUrl || null,
      name: resolvedName,
      headline: resolvedHeadline,
      location: resolvedLocation,
      about: resolvedAbout,
      profileImage: resolvedImage,
      experience,
      education,
      skills,
      certifications,
      languages,
      additionalInfo: {
        ...metaData.additional,
        ...domData.additional,
        ...rscData.additional,
        ...codeBlobData.additional
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

        // Name from metadata title
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

        // Name from children array containing 2-3 capitalized words
        const nameRegex = /"children":\["([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})"\]/g;
        let nm;
        while ((nm = nameRegex.exec(chunk)) !== null) {
          const cand = nm[1].trim();
          const blacklist = ['Send profile', 'Save to', 'About this', 'Stop seeing', 'Top card', 'Main Feed', 'LinkedIn Member', 'For third Party', 'Experience', 'Education', 'Activity', 'Interests'];
          if (!blacklist.some(b => cand.includes(b)) && !result.name) {
            result.name = cand;
          }
        }

        // Profile Avatar Image from imageRenditions
        if (!result.profileImage && chunk.includes('renderPayload') && chunk.includes('rootUrl')) {
          const rootMatch = chunk.match(/"rootUrl":\s*"([^"]+)"/);
          const suffixMatch = chunk.match(/"suffixUrl":\s*"([^"]+)"/);
          if (rootMatch && suffixMatch) {
            result.profileImage = rootMatch[1] + suffixMatch[1];
          }
        }

        // Location
        const locRegex = /"children":\["([A-Za-z\s]+,\s*[A-Za-z\s]+(?:,\s*[A-Za-z\s]+)?)"\]/g;
        let lm;
        while ((lm = locRegex.exec(chunk)) !== null) {
          const cand = lm[1].trim();
          if (!result.location && !cand.includes('LinkedIn') && !cand.includes('Send') && !cand.includes('Save') && !cand.includes('Experience')) {
            result.location = cand;
          }
        }

        // Headline / Top card children
        const headlineRegex = /"children":\["([A-Z][^"]*(?:\bat\b|@|Engineer|Developer|CEO|Founder|Manager|Student|Lead|Director|Specialist|Consultant|Intern)[^"]*)"\]/g;
        let hm;
        while ((hm = headlineRegex.exec(chunk)) !== null) {
          const candidate = hm[1].trim();
          if (!candidate.includes('LinkedIn') && !candidate.includes('Unfollow') && !candidate.includes('Report') && !candidate.includes('Stop seeing')) {
            if (!result.headline) result.headline = candidate;
          }
        }

        // Summary
        const summaryMatch = chunk.match(/"summary":\s*"([^"]+)"/);
        if (summaryMatch && !result.about) {
          result.about = summaryMatch[1];
        }

        // Experience from RSC entities
        this.extractRscExperience(chunk, result.experience);

        // Education from RSC entities
        this.extractRscEducation(chunk, result.education);
      }
    } catch (e) {
      logger.debug(`Failed to parse RSC stream: ${e.message}`);
    }

    return result;
  }

  /**
   * Helper to parse Experience items embedded inside RSC text/JSON chunks
   */
  extractRscExperience(chunk, expList) {
    try {
      // Pattern 1: Title & Company inside position nodes
      const posRegex = /\{"title":\{"text":"([^"]+)"\},"subtitle":\{"text":"([^"]+)"\}(?:,"caption":\{"text":"([^"]*)"\})?/g;
      let pm;
      while ((pm = posRegex.exec(chunk)) !== null) {
        const title = pm[1].trim();
        const company = pm[2].trim();
        const dates = pm[3] ? pm[3].trim() : '';
        if (title && company && !company.includes('connections') && !title.includes('LinkedIn')) {
          const { startDate, endDate } = this.parseDateRange(dates);
          expList.push({
            title,
            company,
            location: '',
            startDate,
            endDate,
            description: ''
          });
        }
      }

      // Pattern 2: Position string tokens
      const posGroupRegex = /"companyName":"([^"]+)","title":"([^"]+)"/g;
      let gm;
      while ((gm = posGroupRegex.exec(chunk)) !== null) {
        const company = gm[1].trim();
        const title = gm[2].trim();
        if (title && company) {
          expList.push({
            title,
            company,
            location: '',
            startDate: '',
            endDate: '',
            description: ''
          });
        }
      }
    } catch (e) {}
  }

  /**
   * Helper to parse Education items embedded inside RSC text/JSON chunks
   */
  extractRscEducation(chunk, eduList) {
    try {
      // Pattern: School Name & Degree in rehydration chunks
      const schoolRegex = /"schoolName":"([^"]+)"(?:,"degreeName":"([^"]*)")?/g;
      let sm;
      while ((sm = schoolRegex.exec(chunk)) !== null) {
        const institution = sm[1].trim();
        const degree = sm[2] ? sm[2].trim() : '';
        if (institution && !institution.includes('LinkedIn')) {
          eduList.push({
            institution,
            degree,
            fieldOfStudy: '',
            startDate: '',
            endDate: '',
            description: ''
          });
        }
      }
    } catch (e) {}
  }

  /**
   * Extract from embedded <code> and <script> JSON blobs (Voyager/Dash payloads)
   */
  extractCodeBlobs($) {
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

    $('code, script[type="text/javascript"]').each((_, el) => {
      try {
        const content = $(el).html() || $(el).text();
        if (!content || !content.includes('{') || !content.includes('}')) return;

        const rawText = content;

        // Extract Position entities from Voyager included list
        if (rawText.includes('Position') || rawText.includes('companyName') || rawText.includes('miniCompany')) {
          const titleMatches = rawText.matchAll(/"title":\s*"([^"]+)"/g);
          const companyMatches = rawText.matchAll(/"companyName":\s*"([^"]+)"/g);
          const titles = Array.from(titleMatches, m => m[1]);
          const companies = Array.from(companyMatches, m => m[1]);

          for (let i = 0; i < Math.min(titles.length, companies.length); i++) {
            const t = titles[i].trim();
            const c = companies[i].trim();
            if (t && c && !t.includes('LinkedIn') && !c.includes('LinkedIn')) {
              result.experience.push({
                title: t,
                company: c,
                location: '',
                startDate: '',
                endDate: '',
                description: ''
              });
            }
          }
        }

        // Extract Education entities from Voyager included list
        if (rawText.includes('Education') || rawText.includes('schoolName') || rawText.includes('degreeName')) {
          const schoolMatches = rawText.matchAll(/"schoolName":\s*"([^"]+)"/g);
          const degreeMatches = rawText.matchAll(/"degreeName":\s*"([^"]+)"/g);
          const schools = Array.from(schoolMatches, m => m[1]);
          const degrees = Array.from(degreeMatches, m => m[1]);

          for (let i = 0; i < schools.length; i++) {
            const s = schools[i].trim();
            const d = degrees[i] ? degrees[i].trim() : '';
            if (s && !s.includes('LinkedIn')) {
              result.education.push({
                institution: s,
                degree: d,
                fieldOfStudy: '',
                startDate: '',
                endDate: '',
                description: ''
              });
            }
          }
        }

        // Extract Skills
        if (rawText.includes('Skill') || rawText.includes('skillName')) {
          const skillMatches = rawText.matchAll(/"name":\s*"([^"]{2,50})"/g);
          for (const sm of skillMatches) {
            const sk = sm[1].trim();
            if (sk && !sk.includes('LinkedIn') && !sk.includes('urn:li:')) {
              result.skills.push(sk);
            }
          }
        }
      } catch (err) {
        logger.debug(`Failed parsing code blob: ${err.message}`);
      }
    });

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
    const experience = [];
    const education = [];

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
      const descParts = ogDesc.split(/\s*·\s*|\s*•\s*|\s*\|\s*/);
      for (const part of descParts) {
        const p = part.trim();
        if (/^Experience:\s*/i.test(p)) {
          const comps = p.replace(/^Experience:\s*/i, '').split(/,\s*/);
          for (const c of comps) {
            if (c.trim()) {
              experience.push({
                title: parsedHeadline || '',
                company: c.trim(),
                location: '',
                startDate: '',
                endDate: '',
                description: ''
              });
            }
          }
        } else if (/^Education:\s*/i.test(p)) {
          const edus = p.replace(/^Education:\s*/i, '').split(/,\s*/);
          for (const e of edus) {
            if (e.trim()) {
              education.push({
                institution: e.trim(),
                degree: '',
                fieldOfStudy: '',
                startDate: '',
                endDate: '',
                description: ''
              });
            }
          }
        } else if (!parsedLocation && (p.includes('Area') || p.includes('India') || p.includes('United States') || p.includes(','))) {
          if (!p.includes('LinkedIn') && !p.includes('Experience') && !p.includes('Education')) {
            parsedLocation = p;
          }
        }
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
      experience,
      education,
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
    const nameEl = $('h1.top-card-layout__title, h1.top-card__title, .top-card__name, [data-anonymize="person-name"], h1.v-align-middle, .pv-top-card--list h1, [data-view-name="profile-top-card"] h1').first();
    if (nameEl.length) {
      result.name = nameEl.text().trim();
    }

    // Headline Selectors
    const headlineEl = $('.top-card-layout__headline, .top-card__subline, .pv-top-card--list-bullet h2, h2.top-card-layout__headline, [data-view-name="profile-top-card"] h2').first();
    if (headlineEl.length) {
      result.headline = headlineEl.text().trim();
    }

    // Location Selectors
    const locationEl = $('.top-card__subline-item, .top-card-layout__first-subline, .pv-top-card--list-bullet li, .profile-info-subheader, [data-view-name="profile-top-card"] .text-body-small').first();
    if (locationEl.length) {
      const locText = locationEl.text().trim().replace(/\s+/g, ' ');
      if (!locText.toLowerCase().includes('connections') && !locText.toLowerCase().includes('followers')) {
        result.location = locText;
      }
    }

    // About / Summary Selectors
    const aboutEl = $('.core-section-container__content p, .summary-section p, .about-section .pv-about__summary-text, [data-section="summary"] p, section[data-section="about"] .display-flex').first();
    if (aboutEl.length) {
      result.about = aboutEl.text().trim();
    }

    // Profile Image Selectors
    const imgEl = $('img.top-card-layout__entity-image, img.profile-image, img[data-anonymize="headshot-photo"], .pv-top-card__photo img, img.presence-entity__image').first();
    if (imgEl.length) {
      const src = imgEl.attr('src') || imgEl.attr('data-delayed-url') || imgEl.attr('data-ghost-url');
      if (src && !src.includes('data:image/gif') && !src.includes('ghost-person')) {
        result.profileImage = src.trim();
      }
    }

    // Experience Items
    $('section.experience-section li, ul.experience__list li, .experience-item, li.experience-group, section[data-section="experience"] li, div[data-view-name="profile-component-entity"]').each((_, el) => {
      const $item = $(el);
      const title = $item.find('h3, .experience-item__title, .profile-section-card__title, .mr1.t-bold span').first().text().trim();
      const company = $item.find('h4, .experience-item__subtitle, .profile-section-card__subtitle, .t-14.t-normal span').first().text().trim();
      const dateRange = $item.find('.date-range, .experience-item__duration, .profile-section-card__metadata, .t-14.t-normal.t-black--light span').first().text().trim();
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
    $('section.education-section li, ul.education__list li, .education-item, section[data-section="educationsDetails"] li').each((_, el) => {
      const $item = $(el);
      const inst = $item.find('h3, .education__school-name, .profile-section-card__title, .mr1.hoverable-link-text span').first().text().trim();
      const degree = $item.find('h4, .education__degree-name, .profile-section-card__subtitle, .t-14.t-normal span').first().text().trim();
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

  /**
   * Helper: Parse Experience from Headline (e.g. "Software Engineer at Google")
   */
  parseExperienceFromHeadline(headline) {
    if (!headline || typeof headline !== 'string') return null;
    const clean = headline.trim();
    const match = clean.match(/^([A-Za-z0-9\s/&,.-]+?)\s+(?:at|@)\s+([A-Za-z0-9\s/&,.-]+)$/i);
    if (match) {
      const role = match[1].trim();
      const company = match[2].trim();
      if (role.length > 2 && company.length > 1 && !company.toLowerCase().includes('student')) {
        return {
          title: role,
          company: company,
          location: '',
          startDate: 'Present',
          endDate: 'Present',
          description: 'Current role extracted from profile headline.'
        };
      }
    }
    return null;
  }

  /**
   * Helper: Parse Education from Text / Headline / About
   */
  parseEducationFromText(headline = '', about = '') {
    const combined = `${headline} ${about}`;
    const studentMatch = combined.match(/(?:Student|Studying|B\.?E\.?|B\.?Tech|BCA|MCA|Degree|BS|MS)\s+(?:in\s+([A-Za-z\s]+)\s+)?(?:at|from)\s+([A-Za-z0-9\s.,&-]+?)(?:\s*[·|.,\n]|$)/i);
    if (studentMatch) {
      const field = (studentMatch[1] || '').trim();
      const school = (studentMatch[2] || '').trim();
      if (school.length > 2 && !school.toLowerCase().includes('experience')) {
        return {
          institution: school,
          degree: 'Student',
          fieldOfStudy: field,
          startDate: '',
          endDate: '',
          description: 'Extracted from profile summary.'
        };
      }
    }
    return null;
  }

  /**
   * Date range string normalizer
   */
  parseDateRange(raw) {
    if (!raw) return { startDate: '', endDate: '' };
    const cleaned = raw.replace(/\s+/g, ' ').trim();
    const parts = cleaned.split(/\s*[-–—to]\s*/i);
    return {
      startDate: (parts[0] || '').trim(),
      endDate: (parts[1] || '').trim()
    };
  }

  /**
   * Merge and deduplicate experience items
   */
  mergeExperiences(sources) {
    const list = [];
    const seen = new Set();

    for (const src of sources) {
      if (!Array.isArray(src)) continue;
      for (const item of src) {
        if (!item || (!item.title && !item.company)) continue;
        const key = `${(item.title || '').toLowerCase()}|${(item.company || '').toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push(item);
        }
      }
    }
    return list;
  }

  /**
   * Merge and deduplicate education items
   */
  mergeEducations(sources) {
    const list = [];
    const seen = new Set();

    for (const src of sources) {
      if (!Array.isArray(src)) continue;
      for (const item of src) {
        if (!item || !item.institution) continue;
        const key = (item.institution || '').toLowerCase().trim();
        if (!seen.has(key)) {
          seen.add(key);
          list.push(item);
        }
      }
    }
    return list;
  }

  /**
   * Merge and deduplicate string lists (skills)
   */
  mergeUniqueStrings(sources) {
    const seen = new Set();
    for (const src of sources) {
      if (!Array.isArray(src)) continue;
      for (const item of src) {
        const str = typeof item === 'string' ? item.trim() : (item && item.name ? item.name.trim() : null);
        if (str && str.length > 1 && str.length < 100 && !str.includes('urn:li:')) {
          seen.add(str);
        }
      }
    }
    return Array.from(seen);
  }

  /**
   * Merge and deduplicate certifications
   */
  mergeCertifications(sources) {
    const list = [];
    const seen = new Set();

    for (const src of sources) {
      if (!Array.isArray(src)) continue;
      for (const item of src) {
        if (!item || !item.name) continue;
        const key = `${(item.name || '').toLowerCase()}|${(item.issuer || '').toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push(item);
        }
      }
    }
    return list;
  }

  /**
   * Merge and deduplicate languages
   */
  mergeLanguages(sources) {
    const list = [];
    const seen = new Set();

    for (const src of sources) {
      if (!Array.isArray(src)) continue;
      for (const item of src) {
        if (!item || !item.name) continue;
        const key = (item.name || '').toLowerCase().trim();
        if (!seen.has(key)) {
          seen.add(key);
          list.push(item);
        }
      }
    }
    return list;
  }
}

module.exports = new LinkedInParser();
