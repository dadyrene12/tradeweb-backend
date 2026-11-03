const AppError = require('./AppError');

const clean = (value) => String(value || '').trim();

const graphVersion = clean(process.env.INSTAGRAM_GRAPH_VERSION) || 'v21.0';
const instagramUserId = clean(process.env.INSTAGRAM_USER_ID);
const accessToken = clean(process.env.INSTAGRAM_ACCESS_TOKEN);

const instagramConfigured = Boolean(instagramUserId && accessToken);

const formatRwf = (value) => `RWF ${Math.round(Number(value) || 0).toLocaleString('en-US')}`;

const absoluteImageUrl = (product, { clientBase, serverBase }) => {
  const rawImage = clean(product.images?.[0]) || '/images/products/product-26.jpg';

  if (/^https?:\/\//i.test(rawImage)) return rawImage;
  if (rawImage.startsWith('/uploads/')) return `${serverBase}${rawImage}`;

  return `${clientBase}${rawImage.startsWith('/') ? rawImage : `/${rawImage}`}`;
};

const buildCaption = (product, productUrl) => {
  const price = Number(product.price) || 0;
  const oldPrice = Number(product.oldPrice) || 0;
  const hasDiscount = oldPrice > price && price > 0;
  const discount = hasDiscount ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;
  const brand = product.brand ? ` by ${product.brand}` : '';
  const category = String(product.category || 'electronics').replace(/[-_]/g, ' ');
  const description = String(product.description || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 190);

  const brandTag = String(product.brand || '').replace(/[^a-z0-9]/gi, '');
  const categoryTag = category.replace(/[^a-z0-9]/gi, '');

  return [
    '🔥 NEW ARRIVAL AT RN SMART ELECTRONICS 🔥',
    '',
    `✨ ${product.name || 'This product'}${brand}`,
    description ? `${description}${description.length >= 190 ? '…' : ''}` : '',
    '',
    hasDiscount
      ? `💰 Was ${formatRwf(oldPrice)} — NOW ${formatRwf(price)} (save ${discount}%)!`
      : `💰 Special price: ${formatRwf(price)}`,
    '✅ Genuine product with warranty.',
    '🚚 Fast delivery in Kigali & across Rwanda.',
    '💬 Order now on WhatsApp: +250 722 189 516',
    `🛒 Shop now: ${productUrl}`,
    '',
    `#RNSmartElectronics #${categoryTag || 'Electronics'} ${brandTag ? `#${brandTag} ` : ''}#Kigali #Rwanda #HomeAppliances #Electronics #Deals #ShopLocal`,
  ]
    .filter((line) => line !== '')
    .join('\n');
};

const graphRequest = async (path, params = {}) => {
  const body = new URLSearchParams({ ...params, access_token: accessToken });
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    data = {};
  }

  if (!response.ok || data.error) {
    const message =
      data.error?.error_user_msg ||
      data.error?.message ||
      `Instagram API request failed with status ${response.status}.`;
    throw new AppError(message, 502, 'INSTAGRAM_API_ERROR');
  }

  return data;
};

const waitForContainer = async (creationId) => {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const response = await fetch(
      `https://graph.facebook.com/${graphVersion}/${creationId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`
    );

    let data = {};
    try {
      data = await response.json();
    } catch (error) {
      data = {};
    }

    if (data.status_code === 'FINISHED') return;
    if (data.status_code === 'ERROR') {
      throw new AppError('Instagram could not process the product image.', 502, 'INSTAGRAM_MEDIA_ERROR');
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new AppError('Instagram is still processing the image. Try again in a moment.', 504, 'INSTAGRAM_TIMEOUT');
};

const publishProductToInstagram = async (product, { clientBase, serverBase, caption: customCaption }) => {
  if (!instagramConfigured) {
    throw new AppError(
      'Instagram auto-post is not configured. Add INSTAGRAM_USER_ID and INSTAGRAM_ACCESS_TOKEN on the server.',
      503,
      'INSTAGRAM_NOT_CONFIGURED'
    );
  }

  const productUrl = `${clientBase}/product/${product._id}`;
  const imageUrl = absoluteImageUrl(product, { clientBase, serverBase });

  if (!/^https:\/\//i.test(imageUrl)) {
    throw new AppError(
      'Instagram requires a public HTTPS product image. Set CLIENT_URL or PUBLIC_SERVER_URL to your live domain.',
      400,
      'INSTAGRAM_IMAGE_URL'
    );
  }

  const caption = clean(customCaption).slice(0, 2200) || buildCaption(product, productUrl);

  const container = await graphRequest(`${instagramUserId}/media`, {
    image_url: imageUrl,
    caption,
  });

  await waitForContainer(container.id);

  const published = await graphRequest(`${instagramUserId}/media_publish`, {
    creation_id: container.id,
  });

  return {
    mediaId: published.id,
    creationId: container.id,
    imageUrl,
    caption,
  };
};

module.exports = {
  instagramConfigured,
  buildCaption,
  publishProductToInstagram,
};
