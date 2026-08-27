const { HTTP_STATUS, ERROR_CODES } = require('../config/constants');

class AppError extends Error {
  constructor(message, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, errorCode = ERROR_CODES.INTERNAL_SERVER_ERROR, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, details);
  }
}

class InvalidUrlError extends AppError {
  constructor(message = 'Invalid LinkedIn profile URL.', details = null) {
    super(message, HTTP_STATUS.BAD_REQUEST, ERROR_CODES.INVALID_URL, details);
  }
}

class UnsupportedUrlError extends AppError {
  constructor(message = 'Valid LinkedIn URL but unsupported format. Only individual profile URLs (/in/...) are supported.', details = null) {
    super(message, HTTP_STATUS.UNPROCESSABLE_ENTITY, ERROR_CODES.UNSUPPORTED_URL, details);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'The requested LinkedIn profile was not found.', details = null) {
    super(message, HTTP_STATUS.NOT_FOUND, ERROR_CODES.PROFILE_NOT_FOUND, details);
  }
}

class ProfileRestrictedError extends AppError {
  constructor(message = 'The LinkedIn profile is private, requires authentication, or is restricted.', details = null) {
    super(message, HTTP_STATUS.FORBIDDEN, ERROR_CODES.PROFILE_RESTRICTED, details);
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded. Please slow down your requests.', details = null) {
    super(message, HTTP_STATUS.TOO_MANY_REQUESTS, ERROR_CODES.RATE_LIMIT_EXCEEDED, details);
  }
}

class UpstreamRateLimitError extends AppError {
  constructor(message = 'LinkedIn upstream rate limit encountered. Please retry after a short delay.', details = null) {
    super(message, HTTP_STATUS.BAD_GATEWAY, ERROR_CODES.UPSTREAM_RATE_LIMITED, details);
  }
}

class ExtractionError extends AppError {
  constructor(message = 'Failed to extract profile information from LinkedIn.', details = null, statusCode = HTTP_STATUS.BAD_GATEWAY) {
    super(message, statusCode, ERROR_CODES.EXTRACTION_FAILED, details);
  }
}

module.exports = {
  AppError,
  ValidationError,
  InvalidUrlError,
  UnsupportedUrlError,
  NotFoundError,
  ProfileRestrictedError,
  RateLimitError,
  UpstreamRateLimitError,
  ExtractionError
};
