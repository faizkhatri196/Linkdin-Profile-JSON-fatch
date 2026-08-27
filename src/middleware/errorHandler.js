const { HTTP_STATUS, ERROR_CODES } = require('../config/constants');
const logger = require('../utils/logger');
const env = require('../config/env');

function errorHandler(err, req, res, next) {
  // Handle JSON parsing syntax error from express.json()
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: {
        code: ERROR_CODES.MALFORMED_JSON,
        message: 'Invalid JSON payload in request body.'
      }
    });
  }

  const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  const errorCode = err.errorCode || ERROR_CODES.INTERNAL_SERVER_ERROR;
  const message = err.message || 'An unexpected internal server error occurred.';

  // Log error (with stack trace internally, but masked from user response)
  if (statusCode >= 500) {
    logger.error(`Server Error [${errorCode}]: ${message}`, {
      stack: err.stack,
      url: req.originalUrl,
      method: req.method
    });
  } else {
    logger.warn(`Client/Extraction Error [${errorCode}]: ${message}`, {
      url: req.originalUrl
    });
  }

  const errorResponse = {
    success: false,
    error: {
      code: errorCode,
      message: message
    }
  };

  if (err.details) {
    errorResponse.error.details = err.details;
  }

  return res.status(statusCode).json(errorResponse);
}

module.exports = errorHandler;
