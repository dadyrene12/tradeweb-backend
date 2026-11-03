const express = require('express');
const { body } = require('express-validator');
const adminController = require('../controllers/adminController');
const { adminAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();

router.use(adminAuth);

router.get('/stats', adminController.getStats);

router.get('/products', adminController.listProducts);

router.post(
  '/products',
  body('name').trim().isLength({ min: 2, max: 160 }).withMessage('Product name is required.'),
  body('description').trim().isLength({ min: 5 }).withMessage('Description is required.'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number.').toFloat(),
  body('oldPrice').optional({ values: 'falsy' }).isFloat({ min: 0 }).toFloat(),
  body('category').trim().isLength({ min: 2, max: 40 }).withMessage('Category is required.'),
  body('stock').optional().isInt({ min: 0 }).withMessage('Stock must be zero or more.').toInt(),
  body('rating').optional().isFloat({ min: 0, max: 5 }).toFloat(),
  body('featured').optional().isBoolean().toBoolean(),
  body('isBestseller').optional().isBoolean().toBoolean(),
  body('isHot').optional().isBoolean().toBoolean(),
  body('isNewArrival').optional().isBoolean().toBoolean(),
  body('dealOfTheDay').optional().isBoolean().toBoolean(),
  body('showOnHomepage').optional().isBoolean().toBoolean(),
  body('dealSold').optional().isInt({ min: 0 }).toInt(),
  body('dealAvailable').optional().isInt({ min: 0 }).toInt(),
  body('homepageOrder').optional().isInt({ min: 0 }).toInt(),
  validate,
  adminController.createProduct
);

router.put(
  '/products/:id',
  body('name').optional().trim().isLength({ min: 2, max: 160 }),
  body('price').optional().isFloat({ min: 0 }).toFloat(),
  body('oldPrice').optional({ values: 'falsy' }).isFloat({ min: 0 }).toFloat(),
  body('category').optional().trim().isLength({ min: 2, max: 40 }),
  body('stock').optional().isInt({ min: 0 }).toInt(),
  body('rating').optional().isFloat({ min: 0, max: 5 }).toFloat(),
  body('featured').optional().isBoolean().toBoolean(),
  body('isBestseller').optional().isBoolean().toBoolean(),
  body('isHot').optional().isBoolean().toBoolean(),
  body('isNewArrival').optional().isBoolean().toBoolean(),
  body('dealOfTheDay').optional().isBoolean().toBoolean(),
  body('showOnHomepage').optional().isBoolean().toBoolean(),
  body('dealSold').optional().isInt({ min: 0 }).toInt(),
  body('dealAvailable').optional().isInt({ min: 0 }).toInt(),
  body('homepageOrder').optional().isInt({ min: 0 }).toInt(),
  validate,
  adminController.updateProduct
);

router.delete('/products/:id', adminController.deleteProduct);

router.post('/products/:id/instagram', adminController.publishProductToInstagram);

router.get('/orders', adminController.listOrders);
router.get('/orders/:id', adminController.getOrder);

router.patch(
  '/orders/:id/status',
  body('status')
    .isIn(['pending', 'processing', 'shipped', 'delivered', 'cancelled'])
    .withMessage('Invalid order status.'),
  validate,
  adminController.updateOrderStatus
);

router.delete('/orders/:id', adminController.deleteOrder);

router.get('/users', adminController.listUsers);

router.patch(
  '/users/:id',
  body('name').optional().trim().isLength({ min: 2, max: 60 }),
  body('role').optional().isIn(['user', 'admin']),
  body('isEmailVerified').optional().isBoolean().toBoolean(),
  validate,
  adminController.updateUser
);

router.delete('/users/:id', adminController.deleteUser);

router.get('/settings', adminController.getSettings);

router.put(
  '/settings',
  body('storeName').optional().trim().isLength({ min: 2, max: 80 }),
  body('supportEmail').optional().isEmail().normalizeEmail(),
  body('shippingFee').optional().isFloat({ min: 0 }).toFloat(),
  body('freeShippingThreshold').optional().isFloat({ min: 0 }).toFloat(),
  validate,
  adminController.updateSettings
);

router.get('/categories', adminController.listCategories);
router.post(
  '/categories',
  body('name').trim().isLength({ min: 2, max: 40 }).withMessage('Category name is required.'),
  validate,
  adminController.createCategory
);
router.put(
  '/categories/:id',
  body('name').optional().trim().isLength({ min: 2, max: 40 }),
  validate,
  adminController.updateCategory
);
router.delete('/categories/:id', adminController.deleteCategory);
router.get('/homepage', adminController.getHomepageSettings);
router.put('/homepage', adminController.updateHomepageSettings);

module.exports = router;
