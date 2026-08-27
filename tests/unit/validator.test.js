const { validateAndNormalizeUrl, validateProfileRequest } = require('../../src/validators/profileValidator');
const { InvalidUrlError, UnsupportedUrlError, ValidationError } = require('../../src/utils/customErrors');

describe('Profile URL Validator', () => {
  test('should validate and canonicalize standard LinkedIn profile URL', () => {
    const raw = 'https://www.linkedin.com/in/faiz-khatri-12345/';
    const result = validateAndNormalizeUrl(raw);
    expect(result.canonicalUrl).toBe('https://www.linkedin.com/in/faiz-khatri-12345/');
    expect(result.vanityName).toBe('faiz-khatri-12345');
  });

  test('should support country-code subdomains (e.g., in.linkedin.com)', () => {
    const raw = 'https://in.linkedin.com/in/example-profile';
    const result = validateAndNormalizeUrl(raw);
    expect(result.canonicalUrl).toBe('https://www.linkedin.com/in/example-profile/');
  });

  test('should strip tracking parameters and query strings', () => {
    const raw = 'https://www.linkedin.com/in/sample-user?miniProfileUrn=urn%3Ali%3Afsd_profile&utm_source=share';
    const result = validateAndNormalizeUrl(raw);
    expect(result.canonicalUrl).toBe('https://www.linkedin.com/in/sample-user/');
  });

  test('should reject non-LinkedIn domains', () => {
    expect(() => validateAndNormalizeUrl('https://www.google.com/in/example'))
      .toThrow(InvalidUrlError);
  });

  test('should reject company URLs with 422 UnsupportedUrlError', () => {
    expect(() => validateAndNormalizeUrl('https://www.linkedin.com/company/google/'))
      .toThrow(UnsupportedUrlError);
  });

  test('should reject jobs and school URLs', () => {
    expect(() => validateAndNormalizeUrl('https://www.linkedin.com/jobs/view/12345/'))
      .toThrow(UnsupportedUrlError);
    expect(() => validateAndNormalizeUrl('https://www.linkedin.com/school/stanford/'))
      .toThrow(UnsupportedUrlError);
  });

  test('should reject malicious schemes (javascript:, data:)', () => {
    expect(() => validateAndNormalizeUrl('javascript:alert(1)'))
      .toThrow(InvalidUrlError);
    expect(() => validateAndNormalizeUrl('data:text/html,<script>alert(1)</script>'))
      .toThrow(InvalidUrlError);
  });

  test('should validate request body with validateProfileRequest', () => {
    const result = validateProfileRequest({ url: 'https://linkedin.com/in/test-dev' });
    expect(result.canonicalUrl).toBe('https://www.linkedin.com/in/test-dev/');
  });

  test('should throw ValidationError on missing body or empty url', () => {
    expect(() => validateProfileRequest({})).toThrow(ValidationError);
    expect(() => validateProfileRequest(null)).toThrow(ValidationError);
    expect(() => validateProfileRequest({ url: '' })).toThrow(ValidationError);
  });
});
