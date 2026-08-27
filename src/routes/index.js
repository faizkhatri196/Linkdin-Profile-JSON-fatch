const express = require('express');
const profileRoutes = require('./profileRoutes');
const healthRoutes = require('./healthRoutes');

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/api/linkedin', profileRoutes);

module.exports = router;
