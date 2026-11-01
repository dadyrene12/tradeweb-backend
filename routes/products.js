const express = require('express');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const { auth, adminAuth } = require('../middleware/auth');
const router = express.Router();

// Get all products
router.get('/', async (req, res) => {
  try {
    const { category, search, featured, limit = 100, page = 1 } = req.query;
    const limitNumber = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200);
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const query = {};

    if (category) query.category = String(category).trim().toLowerCase();
    if (featured) query.featured = featured === 'true';
    if (search) {
      const regex = new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { name: regex },
        { description: regex },
        { brand: regex }
      ];
    }

    const products = await Product.find(query)
      .limit(limitNumber)
      .skip((pageNumber - 1) * limitNumber)
      .sort({ createdAt: -1 });

    const count = await Product.countDocuments(query);

    res.json({
      products,
      totalPages: Math.ceil(count / limitNumber),
      currentPage: pageNumber
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get single product
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const filter = mongoose.Types.ObjectId.isValid(id)
      ? { $or: [{ _id: id }, { slug: id }] }
      : { slug: id };
    const product = await Product.findOne(filter);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create product (admin only)
router.post('/', adminAuth, async (req, res) => {
  try {
    const product = new Product(req.body);
    await product.save();
    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
