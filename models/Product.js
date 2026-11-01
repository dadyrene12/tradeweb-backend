const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    trim: true,
    lowercase: true,
    index: true,
  },
  sourceId: {
    type: Number,
    unique: true,
    sparse: true,
  },
  description: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  oldPrice: {
    type: Number,
    min: 0
  },
  category: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  subcategory: {
    type: String
  },
  images: [{
    type: String
  }],
  stock: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  brand: {
    type: String
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  numReviews: {
    type: Number,
    default: 0
  },
  featured: {
    type: Boolean,
    default: false
  },
  isBestseller: {
    type: Boolean,
    default: false
  },
  isHot: {
    type: Boolean,
    default: false
  },
  isNewArrival: {
    type: Boolean,
    default: false
  },
  dealOfTheDay: {
    type: Boolean,
    default: false
  },
  dealSold: {
    type: Number,
    default: 0,
    min: 0
  },
  dealAvailable: {
    type: Number,
    default: 0,
    min: 0
  },
  homepageOrder: {
    type: Number,
    default: 0
  },
  showOnHomepage: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Product', ProductSchema);
