const request = require('supertest');
const express = require('express');
const { profileRateLimiter } = require('../../src/middleware/rateLimiter');
const errorHandler = require('../../src/middleware/errorHandler');

describe('Rate Limiter Middleware', () => {
  let testApp;

  beforeAll(() => {
    testApp = express();
    testApp.use(express.json());
    testApp.post('/test-limit', profileRateLimiter, (req, res) => {
      res.json({ ok: true });
    });
    testApp.use(errorHandler);
  });

  test('should include RateLimit headers in responses', async () => {
    const res = await request(testApp).post('/test-limit').send({});
    expect(res.headers).toHaveProperty('ratelimit-limit');
    expect(res.headers).toHaveProperty('ratelimit-remaining');
  });
});
