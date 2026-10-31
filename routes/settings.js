const express = require('express');
const SiteSettings = require('../models/SiteSettings');
const Category = require('../models/Category');
const HomepageSettings = require('../models/HomepageSettings');
const Product = require('../models/Product');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get('/categories', asyncHandler(async (req, res) => {
  const categories = await Category.find({ active: { $ne: false } }).sort({ order: 1, name: 1 });
  res.json({ categories });
}));

router.get('/homepage', asyncHandler(async (req, res) => {
  const [settings, deal, featured, flash, newArrivals] = await Promise.all([
    HomepageSettings.getSettings(),
    Product.findOne({ dealOfTheDay: true, showOnHomepage: { $ne: false } }).sort({ homepageOrder: 1, updatedAt: -1 }),
    Product.find({ featured: true, showOnHomepage: { $ne: false } }).sort({ homepageOrder: 1, createdAt: -1 }).limit(20),
    Product.find({ oldPrice: { $gt: 0 }, showOnHomepage: { $ne: false } }).sort({ homepageOrder: 1, createdAt: -1 }).limit(12),
    Product.find({ showOnHomepage: { $ne: false } }).sort({ createdAt: -1 }).limit(12),
  ]);

  res.json({ settings, deal, featured, flash, newArrivals });
}));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const settings = await SiteSettings.getSettings();

    res.json({
      settings: {
        storeName: settings.storeName,
        tagline: settings.tagline,
        supportEmail: settings.supportEmail,
        supportPhone: settings.supportPhone,
        whatsappNumber: settings.whatsappNumber,
        address: settings.address,
        currency: settings.currency,
        shippingFee: settings.shippingFee,
        freeShippingThreshold: settings.freeShippingThreshold,
        social: settings.social,
        branding: settings.branding,
        announcement: settings.announcement,
        maintenance: settings.maintenance,
        seo: settings.seo,
        features: settings.features,
        payments: settings.payments,
      },
    });
  })
);

module.exports = router;
