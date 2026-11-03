const User = require('../models/User');
const SiteSettings = require('../models/SiteSettings');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  createRandomToken,
  hashToken,
  accessTokenMaxAge,
  refreshTokenMaxAge,
} = require('../utils/token');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const cookieOptions = (req, maxAge) => {
  const origin = (req?.headers?.origin || '').toLowerCase();
  const isLocalOrigin = /^(http:\/\/localhost|http:\/\/127\.0\.0\.1|http:\/\/\[::1\])/.test(origin);
  const isSecureCrossSite = /^(https:\/\/)/.test(origin) && !isLocalOrigin;

  return {
    httpOnly: true,
    secure: isSecureCrossSite || process.env.NODE_ENV === 'production',
    sameSite: isSecureCrossSite || process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
    ...(typeof maxAge === 'number' ? { maxAge } : {}),
  };
};

const setAuthCookies = (req, res, accessToken, refreshToken, rememberMe) => {
  res.cookie('accessToken', accessToken, cookieOptions(req, accessTokenMaxAge()));
  res.cookie('refreshToken', refreshToken, cookieOptions(req, refreshTokenMaxAge(rememberMe)));
  res.cookie('glectron_session', '1', {
    ...cookieOptions(req, refreshTokenMaxAge(rememberMe)),
    httpOnly: false,
  });
};

const clearAuthCookies = (req, res) => {
  res.clearCookie('accessToken', cookieOptions(req));
  res.clearCookie('refreshToken', cookieOptions(req));
  res.clearCookie('glectron_session', { ...cookieOptions(req), httpOnly: false });
};

const createSession = async (user, req, rememberMe = false) => {
  const accessToken = signAccessToken(user._id);
  const refreshToken = signRefreshToken(user._id, rememberMe);
  const now = Date.now();

  const activeTokens = (user.refreshTokens || []).filter(
    (item) => item.expiresAt && new Date(item.expiresAt).getTime() > now
  );

  activeTokens.push({
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(now + refreshTokenMaxAge(rememberMe)),
    rememberMe,
    userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
    ip: req.ip,
  });

  user.refreshTokens = activeTokens.slice(-5);
  await user.save({ validateBeforeSave: false });

  return { accessToken, refreshToken };
};

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  isEmailVerified: user.isEmailVerified,
  createdAt: user.createdAt,
});

const register = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { name, password } = req.body;

  const settings = await SiteSettings.getSettings();
  if (!settings.features.allowRegistration) {
    throw new AppError(
      'New registrations are currently closed. Please contact support for help.',
      403,
      'REGISTRATION_DISABLED'
    );
  }

  const requiresVerification = Boolean(settings.features.requireEmailVerification);

  const existing = await User.findOne({ email });
  if (existing) {
    throw new AppError(
      'An account with this email already exists. Sign in or resend the verification email.',
      409,
      'EMAIL_IN_USE'
    );
  }

  const token = requiresVerification ? createRandomToken() : null;

  const user = await User.create({
    name,
    email,
    password,
    isEmailVerified: !requiresVerification,
    ...(token
      ? {
          emailVerificationToken: token.hashed,
          emailVerificationExpires: new Date(Date.now() + VERIFICATION_TTL_MS),
        }
      : {}),
  });

  if (!requiresVerification) {
    return res.status(201).json({
      message: 'Account created. You can sign in now.',
      code: 'REGISTERED',
      emailSent: false,
      requiresVerification: false,
      user: publicUser(user),
    });
  }

  let emailSent = true;
  try {
    await sendVerificationEmail(user, token.raw);
  } catch (error) {
    emailSent = false;
    console.error(`Failed to send verification email to ${user.email}:`, error);
  }

  res.status(201).json({
    message: emailSent
      ? 'Account created. Check your inbox to verify your email address.'
      : 'Account created, but we could not send the verification email. Please use resend verification.',
    code: 'REGISTERED',
    emailSent,
    requiresVerification: true,
    user: publicUser(user),
  });
});

const verifyEmail = asyncHandler(async (req, res) => {
  const user = await User.findOne({
    emailVerificationToken: hashToken(req.body.token),
    emailVerificationExpires: { $gt: new Date() },
  }).select('+emailVerificationToken +emailVerificationExpires');

  if (!user) {
    throw new AppError(
      'This verification link is invalid or has expired. Request a new one.',
      400,
      'INVALID_VERIFICATION_TOKEN'
    );
  }

  const alreadyVerified = user.isEmailVerified;
  user.isEmailVerified = true;
  await user.save({ validateBeforeSave: false });

  res.json({
    message: alreadyVerified
      ? 'This email is already verified. You can sign in.'
      : 'Email verified successfully. You can now sign in.',
    user: publicUser(user),
  });
});

const resendVerification = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const user = await User.findOne({ email });

  if (user && !user.isEmailVerified) {
    const { raw, hashed } = createRandomToken();
    user.emailVerificationToken = hashed;
    user.emailVerificationExpires = new Date(Date.now() + VERIFICATION_TTL_MS);
    await user.save({ validateBeforeSave: false });

    try {
      await sendVerificationEmail(user, raw);
    } catch (error) {
      console.error(`Failed to resend verification email to ${user.email}:`, error);
    }
  }

  res.json({
    message: 'If an unverified account exists for that email, a new verification link has been sent.',
    code: 'VERIFICATION_EMAIL_SENT',
  });
});

const login = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password, rememberMe = false } = req.body;

  const user = await User.findOne({ email }).select(
    '+password +loginAttempts +lockUntil +refreshTokens'
  );

  if (!user) {
    throw new AppError('Invalid email or password.', 400, 'INVALID_CREDENTIALS');
  }

  if (user.isLocked()) {
    const retryAfter = Math.max(1, Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000));
    res.set('Retry-After', String(retryAfter * 60));
    throw new AppError(
      `Too many failed attempts. Try again in ${retryAfter} minute${retryAfter === 1 ? '' : 's'}.`,
      423,
      'ACCOUNT_LOCKED'
    );
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    await user.registerFailedLogin();
    throw new AppError('Invalid email or password.', 400, 'INVALID_CREDENTIALS');
  }

  const settings = await SiteSettings.getSettings();

  if (settings.features.requireEmailVerification && !user.isEmailVerified) {
    throw new AppError(
      'Please verify your email address before signing in.',
      403,
      'EMAIL_NOT_VERIFIED',
      { email: user.email }
    );
  }

  await user.resetLoginAttempts();

  const { accessToken, refreshToken } = await createSession(user, req, Boolean(rememberMe));
  setAuthCookies(req, res, accessToken, refreshToken, Boolean(rememberMe));

  res.json({
    message: 'Signed in successfully.',
    user: publicUser(user),
    accessToken,
  });
});

const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;

  if (!token) {
    throw new AppError('Session expired. Please sign in again.', 401, 'NO_REFRESH_TOKEN');
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch (error) {
    clearAuthCookies(req, res);
    throw new AppError('Session expired. Please sign in again.', 401, 'INVALID_REFRESH_TOKEN');
  }

  const user = await User.findById(decoded.sub).select('+refreshTokens');
  if (!user) {
    clearAuthCookies(req, res);
    throw new AppError('Session expired. Please sign in again.', 401, 'INVALID_REFRESH_TOKEN');
  }

  const now = Date.now();
  const tokenHash = hashToken(token);
  const stored = (user.refreshTokens || []).find(
    (item) => item.tokenHash === tokenHash && new Date(item.expiresAt).getTime() > now
  );

  if (!stored) {
    user.refreshTokens = (user.refreshTokens || []).filter(
      (item) => new Date(item.expiresAt).getTime() > now
    );
    await user.save({ validateBeforeSave: false });
    clearAuthCookies(req, res);
    throw new AppError('Session expired. Please sign in again.', 401, 'INVALID_REFRESH_TOKEN');
  }

  user.refreshTokens = (user.refreshTokens || []).filter(
    (item) => item.tokenHash !== tokenHash && new Date(item.expiresAt).getTime() > now
  );

  const rememberMe = Boolean(stored.rememberMe);
  const { accessToken, refreshToken } = await createSession(user, req, rememberMe);
  setAuthCookies(req, res, accessToken, refreshToken, rememberMe);

  res.json({
    message: 'Session refreshed.',
    user: publicUser(user),
    accessToken,
  });
});

const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;

  if (token) {
    try {
      const decoded = verifyRefreshToken(token);
      const tokenHash = hashToken(token);
      const user = await User.findById(decoded.sub).select('+refreshTokens');

      if (user) {
        user.refreshTokens = (user.refreshTokens || []).filter(
          (item) => item.tokenHash !== tokenHash
        );
        await user.save({ validateBeforeSave: false });
      }
    } catch (error) {
      // An invalid refresh token still results in a signed-out client.
    }
  }

  clearAuthCookies(req, res);
  res.json({ message: 'Signed out successfully.' });
});

const me = asyncHandler(async (req, res) => {
  res.json({ user: publicUser(req.user) });
});

const forgotPassword = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const user = await User.findOne({ email });

  if (user) {
    const { raw, hashed } = createRandomToken();
    user.passwordResetToken = hashed;
    user.passwordResetExpires = new Date(Date.now() + RESET_TTL_MS);
    await user.save({ validateBeforeSave: false });

    try {
      await sendPasswordResetEmail(user, raw);
    } catch (error) {
      console.error(`Failed to send password reset email to ${user.email}:`, error);
    }
  }

  res.json({
    message: 'If an account with that email exists, a password reset link has been sent.',
    code: 'RESET_EMAIL_SENT',
  });
});

const resetPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({
    passwordResetToken: hashToken(req.body.token),
    passwordResetExpires: { $gt: new Date() },
  }).select('+passwordResetToken +passwordResetExpires +refreshTokens');

  if (!user) {
    throw new AppError(
      'This password reset link is invalid or has expired. Request a new one.',
      400,
      'INVALID_RESET_TOKEN'
    );
  }

  user.password = req.body.password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.refreshTokens = [];
  user.loginAttempts = 0;
  user.lockUntil = undefined;
  await user.save();

  clearAuthCookies(req, res);
  res.json({ message: 'Password updated successfully. Please sign in with your new password.' });
});

module.exports = {
  register,
  verifyEmail,
  resendVerification,
  login,
  refresh,
  logout,
  me,
  forgotPassword,
  resetPassword,
};
