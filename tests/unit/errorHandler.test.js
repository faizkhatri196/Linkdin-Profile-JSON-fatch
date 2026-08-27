const errorHandler = require('../../src/middleware/errorHandler');
const { AppError, InvalidUrlError } = require('../../src/utils/customErrors');
const { HTTP_STATUS, ERROR_CODES } = require('../../src/config/constants');

describe('Centralized Error Handler Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { originalUrl: '/test', method: 'GET' };
    res = {
      statusCode: null,
      status: function(code) {
        this.statusCode = code;
        return this;
      },
      json: jest.fn().mockImplementation(function(data) {
        this.data = data;
        return this;
      })
    };
    next = jest.fn();
  });

  test('should handle AppError and set correct statusCode and errorCode', () => {
    const error = new InvalidUrlError('Invalid profile URL', { field: 'url' });
    errorHandler(error, req, res, next);

    expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: ERROR_CODES.INVALID_URL,
        message: 'Invalid profile URL',
        details: { field: 'url' }
      }
    });
  });

  test('should handle generic 500 error gracefully without leaking stack', () => {
    const error = new Error('Database unexpected failure');
    errorHandler(error, req, res, next);

    expect(res.statusCode).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_SERVER_ERROR,
        message: 'Database unexpected failure'
      }
    });
  });

  test('should handle JSON syntax error from express body parser', () => {
    const syntaxErr = new SyntaxError('Unexpected token in JSON at position 5');
    syntaxErr.status = 400;
    syntaxErr.body = '{"bad}';

    errorHandler(syntaxErr, req, res, next);

    expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: ERROR_CODES.MALFORMED_JSON,
        message: 'Invalid JSON payload in request body.'
      }
    });
  });
});
