// deno-lint-ignore-file
// @ts-nocheck — Supabase Edge (Deno)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const SITE_URL = 'https://www.bzead.com';
const LOGO_URL = `${SITE_URL}/images/logo/bzead-logo.png`;
const MAX_EDGE = 1200;
const JPEG_QUALITY = 82;

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
  'https://localhost',
  'capacitor://localhost',
  'ionic://localhost',
];

function getCorsHeaders(req?: Request) {
  const origin = req?.headers.get('origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function pickImageUrl(product: { image_url?: string | null; images?: string[] | null } | null): string {
  if (!product) return '';
  const primary = String(product.image_url || '').trim();
  if (primary) return primary;
  const images = Array.isArray(product.images) ? product.images : [];
  return String(images[0] || '').trim();
}

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function toSocialJpeg(sourceUrl: string): Promise<Uint8Array | null> {
  const bytes = await fetchBytes(sourceUrl);
  if (!bytes || bytes.length === 0) return null;

  try {
    const decoded = await Image.decode(bytes);
    if (!decoded || decoded.width <= 0 || decoded.height <= 0) return null;

    const scale = Math.min(MAX_EDGE / decoded.width, MAX_EDGE / decoded.height, 1);
    const targetW = Math.max(1, Math.round(decoded.width * scale));
    const targetH = Math.max(1, Math.round(decoded.height * scale));
    const resized = decoded.width === targetW && decoded.height === targetH
      ? decoded
      : decoded.resize(targetW, targetH);

    return await resized.encodeJPEG(JPEG_QUALITY);
  } catch (err) {
    console.error('product-og-image encode error:', err);
    return null;
  }
}

async function logoFallback(req?: Request): Promise<Response> {
  const bytes = await fetchBytes(LOGO_URL);
  if (!bytes) return new Response('Image unavailable', { status: 404, headers: getCorsHeaders(req) });
  return new Response(bytes, {
    status: 200,
    headers: {
      ...getCorsHeaders(req),
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }

  try {
    const slug = (new URL(req.url).searchParams.get('slug') || '').replace(/\/+$/, '').trim();
    if (!slug) return new Response('Missing slug', { status: 400, headers: getCorsHeaders(req) });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: product } = await supabase
      .from('products')
      .select('image_url, images')
      .eq('slug', slug)
      .maybeSingle();

    const imageUrl = pickImageUrl(product);
    if (!imageUrl) return logoFallback(req);

    const jpeg = await toSocialJpeg(imageUrl);
    if (!jpeg) return logoFallback(req);

    return new Response(jpeg, {
      status: 200,
      headers: {
        ...getCorsHeaders(req),
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, s-maxage=604800',
      },
    });
  } catch (err) {
    console.error('product-og-image error:', err);
    return logoFallback(req);
  }
});
