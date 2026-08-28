const request = require('supertest');
const app = require('../../src/app');
const extractor = require('../../src/services/linkedin/extractor');
const fs = require('fs');
const path = require('path');

describe('POST /api/linkedin/profile Endpoint', () => {
  const sampleHtml = fs.readFileSync(path.join(__dirname, '../fixtures/samplePublicProfile.html'), 'utf8');

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should return 400 Bad Request when request body is missing', async () => {
    const res = await request(app)
      .post('/api/linkedin/profile')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('should return 400 Bad Request on invalid URL syntax', async () => {
    const res = await request(app)
      .post('/api/linkedin/profile')
      .send({ url: 'not-a-url' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_URL');
  });

  test('should return 400 Bad Request on non-LinkedIn domain', async () => {
    const res = await request(app)
      .post('/api/linkedin/profile')
      .send({ url: 'https://github.com/faizkhatri196' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_URL');
  });

  test('should return 422 Unprocessable Entity on company/jobs URLs', async () => {
    const res = await request(app)
      .post('/api/linkedin/profile')
      .send({ url: 'https://www.linkedin.com/company/microsoft/' });
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNSUPPORTED_URL');
  });

  test('should successfully extract and return structured profile data', async () => {
    // Mock extractor network fetch to use fixture
    jest.spyOn(extractor, 'fetchProfileHtml').mockResolvedValue({
      html: sampleHtml,
      status: 200,
      statusCode: 200,
      finalUrl: 'https://www.linkedin.com/in/alex-rivera-engineer/',
      authenticated: false
    });

    const res = await request(app)
      .post('/api/linkedin/profile')
      .send({ url: 'https://www.linkedin.com/in/alex-rivera-engineer/' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.source).toBe('linkedin');
    expect(res.body.profile.name).toBe('Alex Rivera');
    expect(res.body.profile.headline).toContain('Senior Software Engineer');
    expect(res.body.profile.experience.length).toBeGreaterThan(0);
    expect(res.body.profile.skills).toEqual(expect.arrayContaining([{ name: 'Node.js' }]));
    expect(res.body.metadata.retrievedAt).toBeDefined();
  });

  test('should return 404 on unknown endpoints', async () => {
    const res = await request(app).get('/api/unknown-route');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
