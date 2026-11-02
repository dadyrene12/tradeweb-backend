const User = require('../models/User');
const { verifyAccessToken } = require('../utils/token');

const getToken = (req) => {
  const header = req.header('Authorization');
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
  return req.cookies?.accessToken || null;
};

const resolveUser = async (req) => {
  const token = getToken(req);
  if (!token) return null;

  const decoded = verifyAccessToken(token);
  if (decoded.type && decoded.type !== 'access') return null;

  return User.findById(decoded.sub);
};

const auth = async (req, res, next) => {
  try {
    const user = await resolveUser(req);

    if (!user) {
      return res.status(401).json({
        message: 'Authentication required. Please sign in.',
        code: 'UNAUTHENTICATED',
      });
    }

    req.user = user;
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        message: 'Your session has expired. Please sign in again.',
        code: 'TOKEN_EXPIRED',
      });
    }

    return res.status(401).json({
      message: 'Invalid authentication token.',
      code: 'INVALID_TOKEN',
    });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const user = await resolveUser(req);
    if (user) req.user = user;
  } catch (error) {
    /* ignore invalid/expired tokens for public endpoints */
  }

  return next();
};

const adminAuth = async (req, res, next) => {
  auth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        message: 'Access denied. Administrator privileges are required.',
        code: 'FORBIDDEN',
      });
    }
    return next();
  });
};

module.exports = { auth, optionalAuth, adminAuth };
