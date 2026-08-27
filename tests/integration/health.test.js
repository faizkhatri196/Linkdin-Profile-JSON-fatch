const request = require('supertest');
const app = require('../../src/app');

describe('GET /health Endpoint', () => {
  test('should return 200 OK with service status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('linkedin-profile-api');
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
  });
});
