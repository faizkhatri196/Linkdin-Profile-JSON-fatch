const fs = require('fs');
const path = require('path');
const parser = require('../../src/services/linkedin/parser');

describe('LinkedIn HTML Parser', () => {
  const fullFixturePath = path.join(__dirname, '../fixtures/samplePublicProfile.html');
  const minimalFixturePath = path.join(__dirname, '../fixtures/sampleMinimalProfile.html');

  test('should extract rich structured profile from Schema.org JSON-LD & DOM', () => {
    const html = fs.readFileSync(fullFixturePath, 'utf8');
    const result = parser.parse(html, 'https://www.linkedin.com/in/alex-rivera-engineer/');

    expect(result.name).toBe('Alex Rivera');
    expect(result.headline).toContain('Senior Software Engineer');
    expect(result.location).toContain('San Francisco');
    expect(result.about).toContain('Passionate backend engineer');
    expect(result.profileImage).toContain('profile-displayphoto');
    expect(result.experience.length).toBeGreaterThanOrEqual(1);
    expect(result.education.length).toBeGreaterThanOrEqual(1);
    expect(result.skills.length).toBeGreaterThan(0);
    expect(result.skills).toContain('Node.js');
    expect(result.certifications.length).toBeGreaterThanOrEqual(1);
    expect(result.languages.length).toBe(2);
  });

  test('should handle minimal profile without errors and return null for missing fields', () => {
    const html = fs.readFileSync(minimalFixturePath, 'utf8');
    const result = parser.parse(html, 'https://www.linkedin.com/in/jane-doe/');

    expect(result.name).toBe('Jane Doe');
    expect(result.headline).toBeNull();
    expect(result.location).toBeNull();
    expect(result.about).toBeNull();
    expect(result.profileImage).toBeNull();
    expect(result.experience).toEqual([]);
    expect(result.education).toEqual([]);
    expect(result.skills).toEqual([]);
  });

  test('should handle empty or invalid HTML gracefully', () => {
    const result = parser.parse('', 'https://www.linkedin.com/in/empty/');
    expect(result.name).toBeNull();
    expect(result.experience).toEqual([]);
  });
});
