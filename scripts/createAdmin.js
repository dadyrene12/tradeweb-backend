require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

const run = async () => {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  const name = String(process.env.ADMIN_NAME || 'Store Administrator').trim();

  if (!email) {
    throw new Error('Set ADMIN_EMAIL before running this script.');
  }

  await connectDB();

  let user = await User.findOne({ email }).select('+password');

  if (user) {
    user.role = 'admin';
    user.isEmailVerified = true;
    if (password) user.password = password;
    await user.save();
    console.log(`Updated existing account ${email} as administrator.`);
  } else {
    if (password.length < 8) {
      throw new Error('Set ADMIN_PASSWORD with at least 8 characters to create a new administrator.');
    }

    user = await User.create({
      name,
      email,
      password,
      role: 'admin',
      isEmailVerified: true,
    });
    console.log(`Created administrator ${email}.`);
  }

  await mongoose.connection.close();
};

run().catch(async (error) => {
  console.error('Administrator setup failed:', error.message);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
