const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    index: true
  },
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: false
    },
    name: String,
    price: Number,
    quantity: Number,
    image: String
  }],
  shippingAddress: {
    fullName: { type: String, required: true, default: 'Guest customer' },
    address: { type: String, required: true, default: 'To be confirmed' },
    city: { type: String, required: true, default: 'Kigali' },
    postalCode: { type: String, required: true, default: '00000' },
    country: { type: String, required: true, default: 'Rwanda' },
    phone: { type: String, required: true, default: 'Not provided' }
  },
  contactEmail: {
    type: String,
    trim: true,
    lowercase: true,
    default: ''
  },
  source: {
    type: String,
    enum: ['whatsapp', 'email', 'web'],
    default: 'web'
  },
  orderRef: {
    type: String,
    trim: true,
    uppercase: true,
    default: ''
  },
  note: {
    type: String,
    trim: true,
    default: ''
  },
  couponCode: {
    type: String,
    trim: true,
    uppercase: true,
    default: ''
  },
  discount: {
    type: Number,
    default: 0
  },
  shippingFee: {
    type: Number,
    default: 0
  },
  paymentMethod: {
    type: String,
    required: true
  },
  totalAmount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Order', OrderSchema);
