const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '../.env') });
if (!process.env.MONGO_URI && process.env.MONGODB_URI) process.env.MONGO_URI = process.env.MONGODB_URI;

const Product = require('../models/Product');
const Category = require('../models/Category');
const products = require('../../client/src/data/products').default || require('../../client/src/data/products');

const slugify = (value) =>
  value
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected');

  const cats = [...new Set(products.map((p) => p.category).filter(Boolean))];
  for (const c of cats) {
    const slug = slugify(c);
    await Category.findOneAndUpdate(
      { slug },
      { name: c, slug, active: true, order: 0 },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  console.log('Categories synced');

  for (const p of products) {
    const slug = slugify(p.name);
    await Product.findOneAndUpdate(
      { $or: [{ slug }, { name: p.name }] },
      {
        name: p.name,
        slug,
        description: p.description || p.name,
        price: p.price,
        oldPrice: p.oldPrice || null,
        category: slugify(p.category),
        images: p.image ? [p.image] : [],
        stock: p.stock || 100,
        rating: p.rating || 0,
        numReviews: 0,
        featured: Boolean(p.featured || p.badge),
        isBestseller: p.badge === 'BESTSELLER',
        isHot: p.badge === 'HOT',
        isNewArrival: p.badge === 'NEW',
        dealOfTheDay: false,
        showOnHomepage: true,
        homepageOrder: 0,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  console.log(`Seeded ${products.length} products`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
