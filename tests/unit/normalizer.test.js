const normalizer = require('../../src/services/linkedin/normalizer');

describe('LinkedIn Data Normalizer', () => {
  test('should normalize raw parsed data into standard response schema', () => {
    const raw = {
      name: '  John Doe  ',
      headline: 'Full Stack Engineer at Acme',
      location: 'New York, NY',
      about: 'Building cool things.',
      profileImage: 'https://example.com/photo.jpg',
      experience: [
        {
          title: 'Lead Engineer',
          company: 'Acme Corp',
          location: 'NYC',
          startDate: '2020',
          endDate: 'Present',
          description: 'Leading team'
        }
      ],
      education: [
        {
          institution: 'MIT',
          degree: 'BS CS',
          fieldOfStudy: 'Computer Science',
          startDate: '2016',
          endDate: '2020',
          description: ''
        }
      ],
      skills: ['JavaScript', 'Node.js', 'JavaScript'], // duplicates test
      certifications: [
        {
          name: 'Cert 1',
          issuer: 'Org 1',
          issueDate: '2021',
          expirationDate: '',
          credentialId: '123'
        }
      ],
      languages: [
        { name: 'English', proficiency: 'Native' }
      ]
    };

    const normalized = normalizer.normalize(raw, 'https://www.linkedin.com/in/johndoe/');

    expect(normalized.success).toBe(true);
    expect(normalized.source).toBe('linkedin');
    expect(normalized.profile.name).toBe('John Doe');
    expect(normalized.profile.skills).toEqual(['JavaScript', 'Node.js']);
    expect(normalized.metadata.fieldsAvailable).toContain('name');
    expect(normalized.metadata.fieldsAvailable).toContain('experience');
    expect(normalized.metadata.fieldsUnavailable).toHaveLength(0);
    expect(normalized.metadata.retrievedAt).toBeDefined();
  });

  test('should never fake missing fields and track fieldsUnavailable', () => {
    const raw = {
      name: 'Solo Developer'
    };

    const normalized = normalizer.normalize(raw, 'https://www.linkedin.com/in/solodev/');
    expect(normalized.profile.name).toBe('Solo Developer');
    expect(normalized.profile.headline).toBeNull();
    expect(normalized.profile.location).toBeNull();
    expect(normalized.profile.about).toBeNull();
    expect(normalized.profile.profileImage).toBeNull();
    expect(normalized.profile.experience).toEqual([]);
    expect(normalized.profile.education).toEqual([]);
    expect(normalized.metadata.fieldsUnavailable).toContain('headline');
    expect(normalized.metadata.fieldsUnavailable).toContain('experience');
  });
});
