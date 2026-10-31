const AppError = require('../utils/AppError');

const notFound = (req, res, next) => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, 'NOT_FOUND'));
};

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  let statusCode = err.statusCode || 500;
  let message = err.message || 'Server error';
  let code = err.code;
  let errors = err.details;

  if (err.name === 'ValidationError') {
    statusCode = 422;
    code = 'VALIDATION_ERROR';
    message = 'Please check the submitted data and try again.';
    errors = Object.values(err.errors).map((item) => ({
      field: item.path,
      message: item.message,
    }));
  }

  if (err.name === 'CastError') {
    statusCode = 400;
    code = 'INVALID_ID';
    message = 'Invalid resource identifier.';
  }

  if (err.code === 11000) {
    statusCode = 409;
    code = 'DUPLICATE_VALUE';
    const field = Object.keys(err.keyValue || {}).join(', ') || 'field';
    message = `An account with that ${field} already exists.`;
  }

  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Invalid authentication token.';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Your session has expired. Please sign in again.';
  }

  if (err.type === 'entity.too.large') {
    statusCode = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request payload is too large.';
  }

  if (statusCode >= 500 && process.env.NODE_ENV === 'production') {
    console.error(err);
    message = 'Something went wrong. Please try again later.';
  }

  const payload = { message };
  if (code) payload.code = code;
  if (errors) payload.errors = errors;
  if (process.env.NODE_ENV !== 'production' && statusCode >= 500) {
    payload.stack = err.stack;
  }

  return res.status(statusCode).json(payload);
};

module.exports = { notFound, errorHandler };
