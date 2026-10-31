const { validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const result = validationResult(req);

  if (result.isEmpty()) return next();

  const errors = result.array().map((error) => ({
    field: error.path,
    message: error.msg,
  }));

  return res.status(422).json({
    message: 'Please check the highlighted fields and try again.',
    code: 'VALIDATION_ERROR',
    errors,
  });
};

module.exports = validate;
