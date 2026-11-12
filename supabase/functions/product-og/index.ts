// deno-lint-ignore-file
// @ts-nocheck — This runs on Supabase Edge (Deno), not Node.js
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const SITE_URL = 'https://www.bzead.com';

const ALLOWED_ORIGINS = [
  'https://bzead.uk',
  'https://www.bzead.uk',
  'https://bzead.in',
  'https://www.bzead.in',
  'https://bzead.asia',
  'https://www.bzead.asia',
  'https://bzead.eu',
  'https://www.bzead.eu',
  'https://www.bzead.com',
  'https://bzead.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  // Capacitor / Ionic mobile WebView origins (Android uses https://localhost when androidScheme is 'https')
  'https://localhost',
  'capacitor://localhost',
  'ionic://localhost',
];

/* ---------- index.html cache for SSR mode ---------- */
let cachedIndexHtml = '';
let cacheTimestamp = 0;
const INDEX_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getIndexHtml(): Promise<string> {
  const now = Date.now();
  if (cachedIndexHtml && (now - cacheTimestamp) < INDEX_CACHE_TTL) {
    return cachedIndexHtml;
  }
  // Fetch the SPA shell from the site's static origin.
  const res = await fetch(`${SITE_URL}/index.html`);
  if (!res.ok) throw new Error(`Failed to fetch index.html: ${res.status}`);
  cachedIndexHtml = await res.text();
  cacheTimestamp = now;
  return cachedIndexHtml;
}

serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  const corsHeaders = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const rawSlug = url.searchParams.get('slug') || '';
    const slug = rawSlug.replace(/\/+$/, ''); // strip trailing slashes
    const mode = url.searchParams.get('mode') || 'share'; // 'share' or 'ssr'

    if (!slug) {
      return new Response('Missing slug', { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch product by slug
    const { data: product } = await supabase
      .from('products')
      .select('id, name, slug, short_description, description, price, mrp, currency, image_url, images, brand, origin_country')
      .eq('slug', slug)
      .maybeSingle();

    // Fallback: try matching by public_product_id
    let p = product;
    if (!p) {
      const { data: byId } = await supabase
        .from('products')
        .select('id, name, slug, short_description, description, price, mrp, currency, image_url, images, brand, origin_country')
        .eq('public_product_id', slug.toUpperCase())
        .maybeSingle();
      p = byId;
    }

    /* -------- SSR mode: inject OG tags into the SPA shell -------- */
    if (mode === 'ssr') {
      return await handleSsr(p, slug, corsHeaders);
    }

    const resolvedSlug = p?.slug || slug;
    const productUrl = `${SITE_URL}/products/${resolvedSlug}`;

    /* -------- Share mode: standalone OG HTML + meta-refresh redirect -------- */
    if (!p) {
      const html = buildShareHtml({
        title: 'BZEAD - Premium Global Marketplace',
        description: 'Discover premium products from verified sellers worldwide.',
        image: `${SITE_URL}/images/logo/bzead-logo.png`,
        ogUrl: `${SITE_URL}`,
        redirectUrl: `${SITE_URL}`,
        price: '',
        currency: '',
        brand: '',
      });
      return new Response(html, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=60',
        },
      });
    }

    const shareUrl = `${SITE_URL}/share/${resolvedSlug}`;
    const title = p.name || 'BZEAD Product';
    const description = (p.short_description || p.description || '').slice(0, 200);
    const imageUrl = resolveSocialImageUrl(resolvedSlug, resolveImageUrl(p.image_url, p.images));

    const html = buildShareHtml({
      title,
      description: description || title,
      image: imageUrl,
      ogUrl: shareUrl,
      redirectUrl: productUrl,
      price: String(p.price),
      currency: p.currency || 'INR',
      brand: p.brand || '',
    });

    return new Response(html, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300, s-maxage=600',
      },
    });
  } catch (err) {
    console.error('product-og error:', err);
    return new Response('Internal error', { status: 500, headers: corsHeaders });
  }
});

/* ---------- SSR handler: inject OG meta into SPA index.html ---------- */
async function handleSsr(
  p: any | null,
  slug: string,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  let indexHtml: string;
  try {
    indexHtml = await getIndexHtml();
  } catch {
    // If we can't fetch index.html, fall back to share-mode HTML
    const productUrl = p ? `${SITE_URL}/products/${p.slug || slug}` : SITE_URL;
    const html = buildShareHtml({
      title: p?.name || 'BZEAD - Premium Global Marketplace',
      description: p ? (p.short_description || p.description || '').slice(0, 200) : 'Discover premium products from verified sellers worldwide.',
      image: p ? resolveSocialImageUrl(p.slug || slug, resolveImageUrl(p.image_url, p.images)) : `${SITE_URL}/images/logo/bzead-logo.png`,
      ogUrl: productUrl,
      redirectUrl: productUrl,
      price: p ? String(p.price) : '',
      currency: p?.currency || '',
      brand: p?.brand || '',
    });
    return new Response(html, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // If product not found, return plain index.html — SPA will show its own 404
  if (!p) {
    return new Response(indexHtml, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60' },
    });
  }

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const title = p.name || 'BZEAD Product';
  const description = (p.short_description || p.description || '').slice(0, 200) || title;
  const imageUrl = resolveSocialImageUrl(p.slug || slug, resolveImageUrl(p.image_url, p.images));
  const productUrl = `${SITE_URL}/products/${p.slug || slug}`;

  const ogBlock = `
  <!-- Injected OG meta tags -->
  <meta property="og:type" content="product" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:image" content="${esc(imageUrl)}" />
  ${ogImageMeta(imageUrl, esc)}
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content="${esc(productUrl)}" />
  <meta property="og:site_name" content="BZEAD" />
  ${p.price ? `<meta property="product:price:amount" content="${esc(String(p.price))}" />` : ''}
  ${p.currency ? `<meta property="product:price:currency" content="${esc(p.currency)}" />` : ''}
  ${p.brand ? `<meta property="product:brand" content="${esc(p.brand)}" />` : ''}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${esc(imageUrl)}" />
  <meta name="twitter:image:src" content="${esc(imageUrl)}" />
  <link rel="image_src" href="${esc(imageUrl)}" />
  <meta property="og:image:alt" content="${esc(title)}" />
  <link rel="canonical" href="${esc(productUrl)}" />`;

  // Replace generic <title> and <meta description>, inject OG block before </head>
  let html = indexHtml;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)} - BZEAD</title>`);
  html = html.replace(
    /<meta name="description" content="[^"]*" \/>/,
    `<meta name="description" content="${esc(description)}" />`,
  );
  html = html.replace('</head>', `${ogBlock}\n</head>`);

  return new Response(html, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=600',
    },
  });
}

function inferImageMime(url: string): string {
  if (url.includes('product-og-image')) return 'image/jpeg';
  const lower = url.toLowerCase();
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.webp')) return 'image/webp';
  if (lower.includes('.gif')) return 'image/gif';
  return 'image/jpeg';
}

/** Use the Supabase edge function URL directly for social previews instead of a host proxy. */
function resolveSocialImageUrl(slug: string, fallbackImageUrl: string): string {
  const s = String(slug || '').trim();
  if (s && SUPABASE_URL) {
    const base = SUPABASE_URL.replace(/\/+$/, '');
    return `${base}/functions/v1/product-og-image?slug=${encodeURIComponent(s)}`;
  }
  return fallbackImageUrl || `${SITE_URL}/images/logo/bzead-logo.png`;
}

function ogImageMeta(imageUrl: string, esc: (s: string) => string): string {
  const secure = imageUrl.startsWith('https://')
    ? `<meta property="og:image:secure_url" content="${esc(imageUrl)}" />\n  `
    : '';
  return `${secure}<meta property="og:image:type" content="${inferImageMime(imageUrl)}" />`;
}

function resolveImageUrl(imageUrl: string | null, images: string[] | null): string {
  const img = imageUrl || (images && images.length > 0 ? images[0] : '');
  if (!img) return `${SITE_URL}/images/logo/bzead-logo.png`;
  // If it's already an absolute URL, use as-is
  if (img.startsWith('http')) return img;
  return `${SITE_URL}${img.startsWith('/') ? '' : '/'}${img}`;
}

interface OgData {
  title: string;
  description: string;
  image: string;
  ogUrl: string;
  redirectUrl: string;
  price: string;
  currency: string;
  brand: string;
}

function buildShareHtml(og: OgData): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(og.title)} - BZEAD</title>
  <meta name="description" content="${esc(og.description)}" />

  <!-- Open Graph -->
  <meta property="og:type" content="product" />
  <meta property="og:title" content="${esc(og.title)}" />
  <meta property="og:description" content="${esc(og.description)}" />
  <meta property="og:image" content="${esc(og.image)}" />
  ${ogImageMeta(og.image, esc)}
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content="${esc(og.ogUrl)}" />
  <meta property="og:site_name" content="BZEAD" />
  ${og.price ? `<meta property="product:price:amount" content="${esc(og.price)}" />` : ''}
  ${og.currency ? `<meta property="product:price:currency" content="${esc(og.currency)}" />` : ''}
  ${og.brand ? `<meta property="product:brand" content="${esc(og.brand)}" />` : ''}

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(og.title)}" />
  <meta name="twitter:description" content="${esc(og.description)}" />
  <meta name="twitter:image" content="${esc(og.image)}" />
  <meta name="twitter:image:src" content="${esc(og.image)}" />
  <link rel="image_src" href="${esc(og.image)}" />
  <meta property="og:image:alt" content="${esc(og.title)}" />

  <!-- Redirect real users — meta refresh is CSP-immune, works everywhere -->
  <meta http-equiv="refresh" content="0;url=${esc(og.redirectUrl)}" />
  <link rel="canonical" href="${esc(og.redirectUrl)}" />
</head>
<body>
  <p>Redirecting to <a href="${esc(og.redirectUrl)}">${esc(og.title)}</a>...</p>
</body>
</html>`;
}
