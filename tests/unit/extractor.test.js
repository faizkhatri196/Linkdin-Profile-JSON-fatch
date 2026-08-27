const extractor = require('../../src/services/linkedin/extractor');
const {
  NotFoundError,
  ProfileRestrictedError,
  UpstreamRateLimitError,
  ExtractionError
} = require('../../src/utils/customErrors');

describe('LinkedIn Extractor Unit Tests', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should generate headers with User-Agent and Sec-Ch-Ua', () => {
    const headers = extractor.getHeaders();
    expect(headers).toHaveProperty('User-Agent');
    expect(headers).toHaveProperty('Accept');
    expect(headers['Sec-Fetch-Mode']).toBe('navigate');
  });

  test('should throw NotFoundError when upstream returns 404', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 404,
      ok: false,
      url: 'https://www.linkedin.com/in/not-found'
    });

    await expect(extractor.fetchProfileHtml('https://www.linkedin.com/in/not-found'))
      .rejects.toThrow(NotFoundError);
  });

  test('should throw UpstreamRateLimitError on 429 or 999 status', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 999,
      ok: false,
      url: 'https://www.linkedin.com/in/test'
    });

    await expect(extractor.fetchProfileHtml('https://www.linkedin.com/in/test'))
      .rejects.toThrow(UpstreamRateLimitError);
  });

  test('should throw ProfileRestrictedError on authwall redirect', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      url: 'https://www.linkedin.com/authwall?trk=...'
    });

    await expect(extractor.fetchProfileHtml('https://www.linkedin.com/in/test'))
      .rejects.toThrow(ProfileRestrictedError);
  });

  test('should return HTML content when upstream request succeeds', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      url: 'https://www.linkedin.com/in/test',
      text: jest.fn().mockResolvedValue('<html><body><h1>Test</h1></body></html>')
    });

    const result = await extractor.fetchProfileHtml('https://www.linkedin.com/in/test');
    expect(result.html).toContain('Test');
    expect(result.status).toBe(200);
  });
});
