const mongoose = require('mongoose');

const SiteSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: 'site',
      unique: true,
      immutable: true,
    },
    storeName: {
      type: String,
      default: 'RN Smart Electronics',
      trim: true,
      maxlength: 80,
    },
    tagline: {
      type: String,
      default: 'Smart choice, better life',
      trim: true,
      maxlength: 140,
    },
    supportEmail: {
      type: String,
      default: 'support@rnsmart.rw',
      trim: true,
      lowercase: true,
    },
    supportPhone: {
      type: String,
      default: '+250 787 015 289',
      trim: true,
    },
    whatsappNumber: {
      type: String,
      default: '250787015289',
      trim: true,
    },
    address: {
      type: String,
      default: 'Kigali, Rwanda',
      trim: true,
      maxlength: 200,
    },
    currency: {
      type: String,
      default: 'FRW',
      trim: true,
      maxlength: 8,
    },
    shippingFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    freeShippingThreshold: {
      type: Number,
      default: 100000,
      min: 0,
    },
    social: {
      facebook: { type: String, default: '' },
      twitter: { type: String, default: '' },
      instagram: { type: String, default: '' },
      youtube: { type: String, default: '' },
      tiktok: { type: String, default: '' },
    },
    branding: {
      logoUrl: { type: String, default: '' },
      primaryColor: { type: String, default: '#0B1B33' },
      accentColor: { type: String, default: '#FF6C00' },
    },
    announcement: {
      enabled: { type: Boolean, default: false },
      text: { type: String, default: 'Free delivery on orders over FRW 100,000', trim: true, maxlength: 200 },
    },
    maintenance: {
      enabled: { type: Boolean, default: false },
      message: { type: String, default: 'We are making improvements. Please check back shortly.', trim: true, maxlength: 300 },
    },
    seo: {
      metaTitle: { type: String, default: 'RN Smart Electronics', trim: true, maxlength: 70 },
      metaDescription: { type: String, default: 'Shop TVs, home appliances and audio at RN Smart Electronics.', trim: true, maxlength: 180 },
    },
    features: {
      allowRegistration: { type: Boolean, default: true },
      requireEmailVerification: { type: Boolean, default: true },
    },
    payments: {
      cashOnDelivery: { type: Boolean, default: true },
      mobileMoney: { type: Boolean, default: true },
      card: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

SiteSettingsSchema.statics.getSettings = async function getSettings() {
  return this.findOneAndUpdate(
    { key: 'site' },
    { $setOnInsert: { key: 'site' } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
};

module.exports = mongoose.model('SiteSettings', SiteSettingsSchema);
