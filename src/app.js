const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const requestLogger = require('./middleware/requestLogger');
const { HTTP_STATUS, ERROR_CODES } = require('./config/constants');

const app = express();

// Security Headers & CORS
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser with 10kb limit to prevent payload abuse
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Safe Request Logging
app.use(requestLogger);

// Serve Web UI Static Assets from public/
app.use(express.static(path.join(__dirname, '../public')));

// Mount API routes
app.use(routes);

// 404 Handler for undefined API routes
app.use((req, res) => {
  res.status(HTTP_STATUS.NOT_FOUND).json({
    success: false,
    error: {
      code: ERROR_CODES.INVALID_URL,
      message: `Endpoint not found: ${req.method} ${req.originalUrl}`
    }
  });
});

// Centralized Error Handling Middleware
app.use(errorHandler);

module.exports = app;
