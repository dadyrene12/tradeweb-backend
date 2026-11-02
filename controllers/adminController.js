const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const SiteSettings = require('../models/SiteSettings');
const Category = require('../models/Category');
const HomepageSettings = require('../models/HomepageSettings');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toPositiveInt = (value, fallback, max = 100) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
};

const productFields = [
  'name',
  'description',
  'price',
  'oldPrice',
  'category',
  'subcategory',
  'images',
  'stock',
  'brand',
  'rating',
  'numReviews',
  'featured',
  'isBestseller',
  'isHot',
  'isNewArrival',
  'dealOfTheDay',
  'dealSold',
  'dealAvailable',
  'homepageOrder',
  'showOnHomepage',
];

const pickProductFields = (body = {}) => {
  const payload = {};
  productFields.forEach((field) => {
    if (body[field] !== undefined) payload[field] = body[field];
  });
  if (typeof payload.category === 'string') payload.category = payload.category.trim().toLowerCase();
  if (typeof payload.images === 'string') {
    payload.images = payload.images
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (Array.isArray(payload.images)) {
    payload.images = payload.images.map((item) => String(item).trim()).filter(Boolean);
  }
  return payload;
};

const getStats = asyncHandler(async (req, res) => {
  const [users, products, orders, pendingOrders, revenueResult, recentOrders, lowStock, recentUsers] =
    await Promise.all([
      User.countDocuments(),
      Product.countDocuments(),
      Order.countDocuments(),
      Order.countDocuments({ status: 'pending' }),
      Order.aggregate([
        { $match: { status: { $ne: 'cancelled' } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      Order.find()
        .populate('user', 'name email')
        .sort({ createdAt: -1 })
        .limit(6),
      Product.find({ stock: { $lte: 5 } })
        .sort({ stock: 1 })
        .limit(6),
      User.find().sort({ createdAt: -1 }).limit(5).select('name email role createdAt isEmailVerified'),
    ]);

  const revenue = revenueResult[0]?.total || 0;

  const since = new Date();
  since.setMonth(since.getMonth() - 5);
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const monthlySales = await Order.aggregate([
    { $match: { createdAt: { $gte: since }, status: { $ne: 'cancelled' } } },
    {
      $group: {
        _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
        revenue: { $sum: '$totalAmount' },
        orders: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]);

  res.json({
    totals: {
      users,
      products,
      orders,
      pendingOrders,
      revenue,
    },
    recentOrders,
    lowStock,
    recentUsers,
    monthlySales,
  });
});

const listProducts = asyncHandler(async (req, res) => {
  const page = toPositiveInt(req.query.page, 1, 100000);
  const limit = toPositiveInt(req.query.limit, 20);
  const search = String(req.query.search || '').trim();
  const category = String(req.query.category || '').trim();

  const query = {};
  if (category) query.category = category;
  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    query.$or = [{ name: regex }, { description: regex }, { brand: regex }];
  }

  const [products, total] = await Promise.all([
    Product.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Product.countDocuments(query),
  ]);

  res.json({
    products,
    total,
    page,
    pageSize: limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

const createProduct = asyncHandler(async (req, res) => {
  const product = await Product.create(pickProductFields(req.body));
  res.status(201).json({ message: 'Product created successfully.', product });
});

const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw new AppError('Product not found.', 404, 'PRODUCT_NOT_FOUND');

  Object.assign(product, pickProductFields(req.body));
  await product.save();

  res.json({ message: 'Product updated successfully.', product });
});

const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) throw new AppError('Product not found.', 404, 'PRODUCT_NOT_FOUND');

  res.json({ message: 'Product deleted successfully.' });
});

const listOrders = asyncHandler(async (req, res) => {
  const page = toPositiveInt(req.query.page, 1, 100000);
  const limit = toPositiveInt(req.query.limit, 20);
  const status = String(req.query.status || '').trim();
  const search = String(req.query.search || '').trim();

  const query = {};
  if (status) query.status = status;

  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    const matchingUsers = await User.find({
      $or: [{ name: regex }, { email: regex }],
    }).select('_id');

    const or = [
      { 'shippingAddress.fullName': regex },
      { 'shippingAddress.phone': regex },
      { contactEmail: regex },
      { orderRef: regex },
    ];
    if (matchingUsers.length) or.push({ user: { $in: matchingUsers.map((user) => user._id) } });
    if (/^[a-f0-9]{24}$/i.test(search)) or.push({ _id: search });

    query.$or = or;
  }

  const [orders, total] = await Promise.all([
    Order.find(query)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Order.countDocuments(query),
  ]);

  res.json({
    orders,
    total,
    page,
    pageSize: limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

const getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('user', 'name email phone role')
    .populate('items.product', 'name images price');

  if (!order) throw new AppError('Order not found.', 404, 'ORDER_NOT_FOUND');
  res.json({ order });
});

const updateOrderStatus = asyncHandler(async (req, res) => {
  const allowed = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
  const { status } = req.body;

  if (!allowed.includes(status)) {
    throw new AppError('Invalid order status.', 422, 'INVALID_STATUS');
  }

  const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true, runValidators: true });
  if (!order) throw new AppError('Order not found.', 404, 'ORDER_NOT_FOUND');

  res.json({ message: 'Order status updated.', order });
});

const deleteOrder = asyncHandler(async (req, res) => {
  const order = await Order.findByIdAndDelete(req.params.id);
  if (!order) throw new AppError('Order not found.', 404, 'ORDER_NOT_FOUND');

  res.json({ message: 'Order deleted successfully.' });
});

const listUsers = asyncHandler(async (req, res) => {
  const page = toPositiveInt(req.query.page, 1, 100000);
  const limit = toPositiveInt(req.query.limit, 20);
  const search = String(req.query.search || '').trim();
  const role = String(req.query.role || '').trim();

  const query = {};
  if (role) query.role = role;
  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    query.$or = [{ name: regex }, { email: regex }];
  }

  const [users, total] = await Promise.all([
    User.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(query),
  ]);

  const orderCounts = await Order.aggregate([
    { $match: { user: { $in: users.map((user) => user._id) } } },
    { $group: { _id: '$user', orders: { $sum: 1 }, spent: { $sum: '$totalAmount' } } },
  ]);

  const totalsByUser = orderCounts.reduce((acc, item) => {
    acc[String(item._id)] = { orders: item.orders, spent: item.spent };
    return acc;
  }, {});

  res.json({
    users: users.map((user) => ({
      ...user.toJSON(),
      orderCount: totalsByUser[String(user._id)]?.orders || 0,
      totalSpent: totalsByUser[String(user._id)]?.spent || 0,
    })),
    total,
    page,
    pageSize: limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('+refreshTokens');
  if (!user) throw new AppError('User not found.', 404, 'USER_NOT_FOUND');

  const { name, role, isEmailVerified } = req.body;

  if (typeof name === 'string' && name.trim()) user.name = name.trim();

  if (role && role !== user.role) {
    if (!['user', 'admin'].includes(role)) {
      throw new AppError('Invalid user role.', 422, 'INVALID_ROLE');
    }
    if (String(user._id) === String(req.user._id) && role !== 'admin') {
      throw new AppError('You cannot remove your own administrator access.', 400, 'CANNOT_DEMOTE_SELF');
    }
    user.role = role;
    if (role !== 'admin') user.refreshTokens = [];
  }

  if (typeof isEmailVerified === 'boolean') user.isEmailVerified = isEmailVerified;

  await user.save({ validateBeforeSave: false });
  res.json({ message: 'User updated successfully.', user: user.toJSON() });
});

const deleteUser = asyncHandler(async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) {
    throw new AppError('You cannot delete your own account.', 400, 'CANNOT_DELETE_SELF');
  }

  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('User not found.', 404, 'USER_NOT_FOUND');

  if (user.role === 'admin') {
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount <= 1) {
      throw new AppError('At least one administrator must remain.', 400, 'LAST_ADMIN');
    }
  }

  await User.findByIdAndDelete(user._id);
  res.json({ message: 'User deleted successfully.' });
});

const getSettings = asyncHandler(async (req, res) => {
  const settings = await SiteSettings.getSettings();
  res.json({ settings });
});

const updateSettings = asyncHandler(async (req, res) => {
  const settings = await SiteSettings.getSettings();

  const scalarFields = [
    'storeName',
    'tagline',
    'supportEmail',
    'supportPhone',
    'whatsappNumber',
    'address',
    'currency',
    'shippingFee',
    'freeShippingThreshold',
  ];

  scalarFields.forEach((field) => {
    if (req.body[field] !== undefined) settings[field] = req.body[field];
  });

  const nestedFields = ['social', 'branding', 'announcement', 'maintenance', 'seo', 'features', 'payments'];

  nestedFields.forEach((field) => {
    if (req.body[field] && typeof req.body[field] === 'object') {
      const base = settings[field]?.toObject ? settings[field].toObject() : settings[field] || {};
      settings[field] = { ...base, ...req.body[field] };
    }
  });

  await settings.save();
  res.json({ message: 'Settings saved successfully.', settings });
});

const slugify = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const listCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find().sort({ order: 1, name: 1 });
  res.json({ categories });
});

const createCategory = asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) throw new AppError('Category name is required.', 422, 'CATEGORY_NAME_REQUIRED');

  const slug = slugify(req.body.slug || name);
  if (!slug) throw new AppError('Invalid category slug.', 422, 'INVALID_SLUG');

  const exists = await Category.findOne({ slug });
  if (exists) throw new AppError('A category with this slug already exists.', 409, 'CATEGORY_EXISTS');

  const category = await Category.create({
    name,
    slug,
    description: String(req.body.description || '').trim(),
    icon: String(req.body.icon || '').trim(),
    image: String(req.body.image || '').trim(),
    order: Number(req.body.order) || 0,
    active: req.body.active !== undefined ? Boolean(req.body.active) : true,
  });

  res.status(201).json({ message: 'Category created successfully.', category });
});

const updateCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw new AppError('Category not found.', 404, 'CATEGORY_NOT_FOUND');

  if (req.body.name) category.name = String(req.body.name).trim();
  if (req.body.slug) {
    const slug = slugify(req.body.slug);
    if (!slug) throw new AppError('Invalid category slug.', 422, 'INVALID_SLUG');
    const exists = await Category.findOne({ slug, _id: { $ne: category._id } });
    if (exists) throw new AppError('A category with this slug already exists.', 409, 'CATEGORY_EXISTS');
    category.slug = slug;
  }
  if (req.body.description !== undefined) category.description = String(req.body.description).trim();
  if (req.body.icon !== undefined) category.icon = String(req.body.icon).trim();
  if (req.body.image !== undefined) category.image = String(req.body.image).trim();
  if (req.body.order !== undefined) category.order = Number(req.body.order) || 0;
  if (req.body.active !== undefined) category.active = Boolean(req.body.active);

  await category.save();
  res.json({ message: 'Category updated successfully.', category });
});

const deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw new AppError('Category not found.', 404, 'CATEGORY_NOT_FOUND');

  const inUse = await Product.countDocuments({ category: category.slug });
  if (inUse) {
    throw new AppError('This category has products assigned. Reassign or delete those products first.', 400, 'CATEGORY_IN_USE');
  }

  await category.deleteOne();
  res.json({ message: 'Category deleted successfully.' });
});

const getHomepageSettings = asyncHandler(async (req, res) => {
  const settings = await HomepageSettings.getSettings();
  res.json({ settings });
});

const updateHomepageSettings = asyncHandler(async (req, res) => {
  const settings = await HomepageSettings.getSettings();
  const fields = ['dealOfTheDayEnabled', 'flashSaleEnabled', 'featuredEnabled', 'newArrivalsEnabled', 'categoriesEnabled'];

  fields.forEach((field) => {
    if (req.body[field] !== undefined) settings[field] = Boolean(req.body[field]);
  });

  await settings.save();
  res.json({ message: 'Homepage settings saved.', settings });
});

module.exports = {
  getStats,
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  listOrders,
  getOrder,
  updateOrderStatus,
  deleteOrder,
  listUsers,
  updateUser,
  deleteUser,
  getSettings,
  updateSettings,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getHomepageSettings,
  updateHomepageSettings,
};
