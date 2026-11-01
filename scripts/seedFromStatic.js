const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Product = require('../models/Product');
const Category = require('../models/Category');
const catalog = require('../../client/src/data/products');

const products = catalog.default || catalog.products || [];

const CATEGORY_META = {
  appliances: {
    name: 'Home Appliances',
    description: 'Refrigerators, freezers, washing machines, fans, coolers and other home essentials.',
    order: 1,
  },
  audio: {
    name: 'TVs & Audio',
    description: 'Smart TVs, speakers, sound systems and home entertainment.',
    order: 2,
  },
  video: {
    name: 'TVs & Video',
    description: 'Televisions, displays and video equipment.',
    order: 3,
  },
};

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

async function syncCategories() {
  const slugs = [...new Set(products.map((product) => slugify(product.category)).filter(Boolean))];

  for (const slug of slugs) {
    const meta = CATEGORY_META[slug] || {
      name: slug.replace(/-/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase()),
      description: '',
      order: 0,
    };

    const existing = await Category.findOne({ slug });

    if (!existing) {
      await Category.create({
        name: meta.name,
        slug,
        description: meta.description,
        order: meta.order,
        active: true,
      });
      continue;
    }

    if (existing.name === existing.slug) {
      existing.name = meta.name;
      existing.description = existing.description || meta.description;
      existing.order = existing.order || meta.order;
      await existing.save();
    }
  }

  return slugs.length;
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const categoryCount = await syncCategories();
  console.log(`Synced ${categoryCount} categories`);

  let inserted = 0;
  let skipped = 0;

  for (const [index, productData] of products.entries()) {
    const images =
      Array.isArray(productData.images) && productData.images.length
        ? productData.images
        : productData.image
          ? [productData.image]
          : [];

    const result = await Product.updateOne(
      { sourceId: productData.id },
      {
        $setOnInsert: {
          sourceId: productData.id,
          name: productData.name,
          slug: `${slugify(productData.name)}-${productData.id}`,
          description: productData.description || productData.name,
          price: Number(productData.price) || 0,
          oldPrice: productData.oldPrice ? Number(productData.oldPrice) : null,
          category: slugify(productData.category),
          subcategory: productData.subcategory || '',
          images,
          stock: Number(productData.stock) || 0,
          brand: productData.brand || '',
          rating: Number(productData.rating) || 0,
          numReviews: 0,
          featured: Boolean(productData.featured),
          isBestseller: productData.badge === 'BESTSELLER',
          isHot: productData.badge === 'HOT',
          isNewArrival: productData.badge === 'NEW',
          dealOfTheDay: false,
          dealSold: 0,
          dealAvailable: 0,
          homepageOrder: index,
          showOnHomepage: true,
        },
      },
      { upsert: true }
    );

    if (result.upsertedCount) inserted += 1;
    else skipped += 1;
  }

  console.log(`Inserted ${inserted} products, skipped ${skipped} existing products`);
  await mongoose.disconnect();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
