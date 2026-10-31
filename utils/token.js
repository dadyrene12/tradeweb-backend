const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const accessSecret = () => process.env.JWT_SECRET || 'dev-only-insecure-secret';
const refreshSecret = () => process.env.JWT_REFRESH_SECRET || `${accessSecret()}:refresh`;

const durationToMs = (value, fallbackMs) => {
  if (typeof value === 'number') return value;
  const match = /^(\d+)([smhd])$/.exec(String(value || '').trim());
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  const factor = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]];
  return amount * factor;
};

const accessExpiresIn = () => process.env.JWT_EXPIRES_IN || '15m';
const refreshExpiresIn = (rememberMe = false) => {
  if (rememberMe) return process.env.JWT_REFRESH_REMEMBER_EXPIRES_IN || '30d';
  return process.env.JWT_REFRESH_EXPIRES_IN || '7d';
};

const signAccessToken = (userId) =>
  jwt.sign({ sub: String(userId), type: 'access' }, accessSecret(), {
    expiresIn: accessExpiresIn(),
  });

const signRefreshToken = (userId, rememberMe = false) =>
  jwt.sign({ sub: String(userId), type: 'refresh' }, refreshSecret(), {
    expiresIn: refreshExpiresIn(rememberMe),
  });

const verifyAccessToken = (token) => jwt.verify(token, accessSecret());
const verifyRefreshToken = (token) => jwt.verify(token, refreshSecret());

const createRandomToken = () => {
  const raw = crypto.randomBytes(32).toString('hex');
  return { raw, hashed: hashToken(raw) };
};

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

const accessTokenMaxAge = () => durationToMs(accessExpiresIn(), 15 * 60 * 1000);
const refreshTokenMaxAge = (rememberMe = false) =>
  durationToMs(refreshExpiresIn(rememberMe), rememberMe ? 30 * 86400000 : 7 * 86400000);

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  createRandomToken,
  hashToken,
  accessTokenMaxAge,
  refreshTokenMaxAge,
  durationToMs,
};
