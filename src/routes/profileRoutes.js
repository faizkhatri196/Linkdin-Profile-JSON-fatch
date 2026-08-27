const express = require('express');
const { getProfile } = require('../controllers/profileController');
const { profileRateLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// POST /api/linkedin/profile with in-memory IP rate limiting
router.post('/profile', profileRateLimiter, getProfile);

module.exports = router;
