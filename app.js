const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

const { notFound, errorHandler } = require('./middleware/error');

const app = express();

const OFFICIAL_SITE_URL = 'https://www.rnsmartelectronic.rw';

const defaultOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://www.rnsmartelectronic.rw',
  'https://rnsmartelectronic.rw',
  'https://rn-smartelectronic-campany-ltdrw.vercel.app',
];

const wildcardAllowedOrigins = [
  /^https:\/\/.*\.vercel\.app$/i,
  /^https:\/\/.*\.netlify\.app$/i,
  /^https:\/\/.*\.onrender\.com$/i,
  /^https:\/\/.*\.render\.com$/i,
  /^https:\/\/.*\.github\.dev$/i,
];

const allowedOrigins = [...defaultOrigins, ...(process.env.CLIENT_URL || '').split(',')]
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        'img-src': ["'self'", 'data:', 'https:'],
      },
    },
  })
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);

      const normalized = origin.replace(/\/+$/, '');
      if (allowedOrigins.includes(normalized)) return callback(null, true);
      if (wildcardAllowedOrigins.some((pattern) => pattern.test(normalized))) {
        return callback(null, true);
      }
      if (process.env.NODE_ENV !== 'production') return callback(null, true);
      return callback(new Error('Origin not allowed by CORS'));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(mongoSanitize());
app.use(compression());
app.use('/uploads', express.static(require('path').join(__dirname, 'uploads')));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please slow down.', code: 'TOO_MANY_REQUESTS' },
});

app.use('/api', globalLimiter);

app.get('/api/health', (req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    database: states[mongoose.connection.readyState] || 'unknown',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/cart', require('./routes/cart'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/upload', require('./routes/upload'));

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatRwf = (value) => `RWF ${Math.round(Number(value) || 0).toLocaleString('en-US')}`;

app.get('/share/product/:id', async (req, res) => {
  try {
    const Product = require('./models/Product');
    const product = await Product.findById(req.params.id).lean();
    if (!product) return res.status(404).type('html').send('<h1>Product not found</h1>');

    const clientBase = (process.env.CLIENT_URL || OFFICIAL_SITE_URL)
      .split(',')[0]
      .trim()
      .replace(/\/+$/, '');
    const apiBase = `${req.protocol}://${req.get('host')}`;
    const shareUrl = `${clientBase}/share/product/${product._id}`;
    const productUrl = `${clientBase}/product/${product._id}`;

    const rawImage = product.images?.[0] || '/images/products/product-26.jpg';
    const imageUrl = /^https?:\/\//i.test(rawImage)
      ? rawImage
      : rawImage.startsWith('/uploads/')
        ? `${apiBase}${rawImage}`
        : `${clientBase}${rawImage.startsWith('/') ? rawImage : `/${rawImage}`}`;

    const title = `${product.name} | ${formatRwf(product.price)} | RN Smart Electronics`;
    const description = String(product.description || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 190);
    const whatsappText = [
      `Hello RN Smart Electronics, I am interested in ${product.name} (${formatRwf(product.price)}).`,
      productUrl,
    ].join('\n');

    const productJsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      description,
      image: [imageUrl],
      sku: String(product._id),
      mpn: String(product._id),
      brand: {
        '@type': 'Brand',
        name: product.brand || 'RN Smart Electronics',
      },
      category: product.category,
      url: productUrl,
      offers: {
        '@type': 'Offer',
        url: productUrl,
        priceCurrency: 'RWF',
        price: Number(product.price) || 0,
        availability:
          Number(product.stock) > 0
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
        itemCondition: 'https://schema.org/NewCondition',
        seller: { '@type': 'Organization', name: 'RN Smart Electronics' },
      },
    }).replace(/</g, '\\u003c');

    const html = `<!DOCTYPE html>
<html lang="en-RW">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<meta name="robots" content="noindex, follow, max-image-preview:large" />
<link rel="canonical" href="${escapeHtml(productUrl)}" />
<meta property="og:type" content="product" />
<meta property="og:site_name" content="RN Smart Electronics" />
<meta property="og:title" content="${escapeHtml(product.name)}" />
<meta property="og:description" content="${escapeHtml(`${formatRwf(product.price)} — ${description}`)}" />
<meta property="og:url" content="${escapeHtml(shareUrl)}" />
<meta property="og:image" content="${escapeHtml(imageUrl)}" />
<meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}" />
<meta property="og:image:alt" content="${escapeHtml(product.name)}" />
<meta property="og:locale" content="en_RW" />
<meta property="product:price:amount" content="${Number(product.price) || 0}" />
<meta property="product:price:currency" content="RWF" />
<meta property="product:availability" content="${Number(product.stock) > 0 ? 'in stock' : 'out of stock'}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(product.name)}" />
<meta name="twitter:description" content="${escapeHtml(`${formatRwf(product.price)} — ${description}`)}" />
<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
<meta name="twitter:image:alt" content="${escapeHtml(product.name)}" />
<script type="application/ld+json">${productJsonLd}</script>
<style>
  body { margin:0; background:#f6f7f9; color:#0B1B33; font-family:Arial,Helvetica,sans-serif; }
  .wrap { max-width:640px; margin:0 auto; padding:20px; }
  .card { background:#fff; border-radius:20px; overflow:hidden; box-shadow:0 12px 40px rgba(11,27,51,.12); }
  .hero { width:100%; height:320px; object-fit:contain; background:#fff; display:block; }
  .body { padding:24px; }
  .brand { color:#E65A00; font-weight:800; letter-spacing:.08em; text-transform:uppercase; font-size:12px; }
  h1 { margin:8px 0 12px; font-size:26px; line-height:1.2; }
  .price { color:#E65A00; font-size:28px; font-weight:900; margin-bottom:12px; }
  .desc { color:#4b5563; line-height:1.6; font-size:15px; }
  .actions { display:flex; flex-direction:column; gap:10px; margin-top:22px; }
  .btn { display:block; text-align:center; text-decoration:none; padding:14px 18px; border-radius:12px; font-weight:800; font-size:15px; }
  .wa { background:#25D366; color:#fff; }
  .shop { background:#0B1B33; color:#fff; }
  .note { margin-top:14px; font-size:12px; color:#6b7280; text-align:center; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <img class="hero" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(product.name)}" />
      <div class="body">
        <div class="brand">RN Smart Electronics</div>
        <h1>${escapeHtml(product.name)}</h1>
        <div class="price">${escapeHtml(formatRwf(product.price))}</div>
        <p class="desc">${escapeHtml(description || 'Genuine product with warranty. Fast delivery in Kigali and across Rwanda.')}</p>
        <div class="actions">
          <a class="wa" href="https://wa.me/250789015289?text=${encodeURIComponent(whatsappText)}">Order on WhatsApp</a>
          <a class="shop" href="${escapeHtml(productUrl)}">View product on our store</a>
        </div>
        <p class="note">Genuine product • Warranty • Fast delivery in Rwanda</p>
      </div>
    </div>
  </div>
</body>
</html>`;

    res.type('html').send(html);
  } catch (error) {
    res.status(404).type('html').send('<h1>Product not found</h1>');
  }
});

app.get('/sitemap.xml', async (req, res) => {
  const clientBase = OFFICIAL_SITE_URL;
  const apiBase = (process.env.PUBLIC_SERVER_URL || `${req.protocol}://${req.get('host')}`)
    .replace(/\/+$/, '')
    .replace(/^http:/i, 'https:');

  const escapeXml = (value) =>
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  const absoluteImage = (image) => {
    if (!image) return '';
    if (/^https?:\/\//i.test(image)) return image.replace(/^http:/i, 'https:');
    if (image.startsWith('/uploads/')) return `${apiBase}${image}`;
    return `${clientBase}${image.startsWith('/') ? image : `/${image}`}`;
  };

  const today = new Date().toISOString().slice(0, 10);
  const staticPages = [
    { loc: '/', priority: '1.0', changefreq: 'daily' },
    { loc: '/shop', priority: '0.9', changefreq: 'daily' },
    { loc: '/about', priority: '0.7', changefreq: 'monthly' },
    { loc: '/blog', priority: '0.8', changefreq: 'weekly' },
    { loc: '/contact', priority: '0.7', changefreq: 'monthly' },
    { loc: '/privacy', priority: '0.4', changefreq: 'yearly' },
    { loc: '/terms', priority: '0.4', changefreq: 'yearly' },
  ];

  let products = [];
  let categories = [];

  try {
    if (mongoose.connection.readyState === 1) {
      const Product = require('./models/Product');
      const Category = require('./models/Category');
      [products, categories] = await Promise.all([
        Product.find({}).select('_id name images category updatedAt').sort({ updatedAt: -1 }).lean(),
        Category.find({ active: { $ne: false } })
          .select('slug updatedAt')
          .sort({ order: 1, name: 1 })
          .lean(),
      ]);
    }
  } catch (error) {
    products = [];
    categories = [];
  }

  const urlEntries = [];

  staticPages.forEach((page) => {
    urlEntries.push(`  <url>
    <loc>${escapeXml(`${clientBase}${page.loc}`)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`);
  });

  const productCategories = [...new Set([
    ...categories.map((category) => category.slug),
    ...products.map((product) => product.category),
  ].filter(Boolean))];

  productCategories.forEach((slug) => {
    urlEntries.push(`  <url>
    <loc>${escapeXml(`${clientBase}/shop?category=${encodeURIComponent(slug)}`)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);
  });

  products.forEach((product) => {
    const lastmod = (product.updatedAt ? new Date(product.updatedAt) : new Date())
      .toISOString()
      .slice(0, 10);
    const image = absoluteImage((product.images || [])[0]);
    urlEntries.push(`  <url>
    <loc>${escapeXml(`${clientBase}/product/${product._id}`)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>${image ? `
    <image:image>
      <image:loc>${escapeXml(image)}</image:loc>
      <image:title>${escapeXml(product.name)}</image:title>
    </image:image>` : ''}
  </url>`);
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urlEntries.join('\n')}
</urlset>`;

  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  res.send(xml);
});

app.get('/', (req, res) => {
  res.json({ message: 'Glectron API is running', version: '1.0.0' });
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
