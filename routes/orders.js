const express = require('express');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { auth, optionalAuth } = require('../middleware/auth');
const router = express.Router();

const isObjectId = (value) => /^[a-f0-9]{24}$/i.test(String(value || ''));

const cleanText = (value, maxLength = 300) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);

const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const makeOrderRef = () =>
  `ORD-${Date.now().toString(36).toUpperCase().slice(-6)}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;

// Get user orders
router.get('/', auth, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id }).populate('items.product').sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Public order request created from the WhatsApp/email checkout buttons
router.post('/quick', optionalAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const channel = ['whatsapp', 'email'].includes(body.channel) ? body.channel : 'web';
    const rawItems = Array.isArray(body.items) ? body.items.slice(0, 50) : [];

    if (rawItems.length === 0) {
      return res.status(422).json({
        message: 'Your order needs at least one item.',
        code: 'EMPTY_ORDER',
      });
    }

    const items = rawItems.map((item) => ({
      product: isObjectId(item?.product ?? item?.id) ? item.product ?? item.id : null,
      name: cleanText(item?.name, 200),
      price: Math.max(0, toNumber(item?.price)),
      quantity: Math.min(99, Math.max(1, parseInt(item?.quantity, 10) || 1)),
      image: cleanText(item?.image, 500),
    }));

    const productIds = items.map((item) => item.product).filter(Boolean);
    const dbProducts = productIds.length
      ? await Product.find({ _id: { $in: productIds } }).select('name price images')
      : [];
    const productsById = new Map(dbProducts.map((product) => [String(product._id), product]));

    for (const item of items) {
      const dbProduct = item.product ? productsById.get(String(item.product)) : null;

      if (dbProduct) {
        item.name = dbProduct.name || item.name;
        item.price = Math.max(0, toNumber(dbProduct.price, item.price));
        if (!item.image && dbProduct.images?.length) item.image = dbProduct.images[0];
      }

      if (!item.name) {
        return res.status(422).json({
          message: 'Every order item needs a product name.',
          code: 'INVALID_ITEM',
        });
      }
    }

    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const discount = Math.min(subtotal, Math.max(0, toNumber(body.discount)));
    const shippingFee = Math.max(0, toNumber(body.shippingFee));
    const totalAmount = Math.max(0, subtotal - discount + shippingFee);

    const customer = body.customer || {};
    const order = await Order.create({
      user: req.user?._id,
      items,
      shippingAddress: {
        fullName: cleanText(customer.name, 120) || 'Guest customer',
        address: cleanText(customer.address, 300) || 'To be confirmed',
        city: cleanText(customer.city, 80) || 'Kigali',
        postalCode: cleanText(customer.postalCode, 20) || '00000',
        country: cleanText(customer.country, 80) || 'Rwanda',
        phone: cleanText(customer.phone, 40) || 'Not provided',
      },
      contactEmail: cleanText(customer.email, 160) || cleanText(req.user?.email, 160),
      source: channel,
      orderRef: cleanText(body.orderRef, 40).toUpperCase() || makeOrderRef(),
      note: cleanText(body.note, 1000),
      couponCode: cleanText(body.couponCode, 40),
      discount,
      shippingFee,
      paymentMethod:
        channel === 'whatsapp'
          ? 'WhatsApp order'
          : channel === 'email'
            ? 'Email order'
            : 'Web order',
      totalAmount,
      status: 'pending',
    });

    res.status(201).json({
      message: 'Order received. Our team will contact you shortly.',
      order: {
        _id: order._id,
        orderRef: order.orderRef,
        status: order.status,
        totalAmount: order.totalAmount,
        source: order.source,
        createdAt: order.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not save your order.', error: error.message });
  }
});

// Create order
router.post('/', auth, async (req, res) => {
  try {
    const order = new Order({
      user: req.user._id,
      ...req.body
    });
    await order.save();
    res.status(201).json(order);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
