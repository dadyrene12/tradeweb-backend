const mongoose = require('mongoose');

const HomepageSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: 'home',
      unique: true,
      immutable: true,
    },
    dealOfTheDayEnabled: {
      type: Boolean,
      default: true,
    },
    flashSaleEnabled: {
      type: Boolean,
      default: true,
    },
    featuredEnabled: {
      type: Boolean,
      default: true,
    },
    newArrivalsEnabled: {
      type: Boolean,
      default: true,
    },
    categoriesEnabled: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

HomepageSettingsSchema.statics.getSettings = async function getSettings() {
  return this.findOneAndUpdate(
    { key: 'home' },
    { $setOnInsert: { key: 'home' } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
};

module.exports = mongoose.model('HomepageSettings', HomepageSettingsSchema);
