const app = require('./app');
const env = require('./config/env');
const logger = require('./utils/logger');

// Optional DB connection if MONGODB_URI is provided
if (env.MONGODB_URI) {
  const mongoose = require('mongoose');
  mongoose.connection.on('error', (err) => {
    logger.warn(`MongoDB runtime error: ${err.message}`);
  });
  mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 3000 })
    .then(() => logger.info('Connected to MongoDB database.'))
    .catch((err) => logger.warn(`MongoDB initial connection failed, continuing with in-memory storage: ${err.message}`));
}

const server = app.listen(env.PORT, () => {
  logger.info(`LinkedIn Profile JSON API running on port ${env.PORT} [Environment: ${env.NODE_ENV}]`);
  logger.info(`Health check available at http://localhost:${env.PORT}/health`);
  logger.info(`Profile endpoint available at http://localhost:${env.PORT}/api/linkedin/profile`);
});

// Graceful shutdown handling
function gracefulShutdown(signal) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown due to timeout.');
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = server;
