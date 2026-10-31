const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { auth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  loginLimiter,
  registerLimiter,
  emailLimiter,
} = require('../middleware/rateLimiter');

const router = express.Router();

const emailRule = body('email')
  .trim()
  .isEmail()
  .withMessage('Enter a valid email address.')
  .normalizeEmail();

const passwordRule = (field = 'password') =>
  body(field)
    .isString()
    .withMessage('Password is required.')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be between 8 and 128 characters.')
    .matches(/^(?=.*[A-Za-z])(?=.*\d)/)
    .withMessage('Password must contain at least one letter and one number.');

const tokenRule = body('token')
  .isString()
  .withMessage('Verification token is required.')
  .matches(/^[a-f0-9]{64}$/i)
  .withMessage('Invalid verification token.');

router.post(
  '/register',
  registerLimiter,
  body('name')
    .trim()
    .isLength({ min: 2, max: 60 })
    .withMessage('Name must be between 2 and 60 characters.'),
  emailRule,
  passwordRule(),
  body('acceptTerms')
    .custom((value) => value === true || value === 'true')
    .withMessage('You must accept the terms and privacy policy.'),
  validate,
  authController.register
);

router.post('/verify-email', emailLimiter, tokenRule, validate, authController.verifyEmail);

router.post(
  '/resend-verification',
  emailLimiter,
  emailRule,
  validate,
  authController.resendVerification
);

router.post(
  '/login',
  loginLimiter,
  emailRule,
  body('password').isString().notEmpty().withMessage('Password is required.'),
  body('rememberMe').optional().isBoolean().toBoolean(),
  validate,
  authController.login
);

router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', auth, authController.me);

router.post('/forgot-password', emailLimiter, emailRule, validate, authController.forgotPassword);

router.post(
  '/reset-password',
  emailLimiter,
  tokenRule,
  passwordRule(),
  validate,
  authController.resetPassword
);

module.exports = router;
