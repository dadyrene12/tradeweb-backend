const rateLimit = require('express-rate-limit');

const handler = (message) => (req, res) => {
  res.status(429).json({ message, code: 'TOO_MANY_REQUESTS' });
};

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler('Too many attempts. Please try again in 15 minutes.'),
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: handler('Too many login attempts. Please try again in 15 minutes.'),
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler('Too many accounts created from this address. Please try again later.'),
});

const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler('Too many email requests. Please try again later.'),
});

module.exports = {
  authLimiter,
  loginLimiter,
  registerLimiter,
  emailLimiter,
};
