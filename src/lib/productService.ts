import { supabase } from './supabase';
import { cachedQuery, clearQueryCache, QUERY_TTL } from './queryCache';
import { notifyAccountEvent, notifyAdminsOfEvent } from './notificationService';
import type { Product } from '../types';

// Detects RLS / auth.uid()-mismatch failures on inserts/updates. When this
// fires it usually means the access token the browser sent was expired, so the
// database saw auth.uid() as NULL and rejected the row. The common cause is a
// long product-listing flow where the short-lived JWT lapsed before save (the
// SDK normally auto-refreshes, but a backgrounded/throttled tab can miss it).
function isRlsAuthError(message: string | undefined | null): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return m.includes('row-level security') || m.includes('row level security');
}

// Attempt to silently recover from an expired-token RLS failure by forcing a
// single token refresh. Returns true when a fresh access token was obtained,
// in which case the caller should retry the write. We deliberately DO NOT call
// the GLOBAL supabase.auth.signOut() here: that revokes the refresh token on
// the server and orphans the session ("zombie session"), which is exactly the
// failure mode we are fixing and would also sign the user out of other devices.
async function tryRecoverAuthSession(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    return !error && Boolean(data?.session?.access_token);
  } catch {
    return false;
  }
}

// Runs a Supabase write (insert/update). If it fails with an RLS/auth error
// caused by an expired token, refreshes the session ONCE and retries the write
// a single time. For a healthy session the first attempt succeeds and this is a
// transparent pass-through with no extra calls and no behavioural change.
async function writeWithAuthRetry<R extends { error: { message?: string | null } | null }>(
  run: () => PromiseLike<R>,
): Promise<R> {
  let res = await run();
  if (res.error && isRlsAuthError(res.error.message)) {
    const recovered = await tryRecoverAuthSession();
    if (recovered) {
      res = await run();
    }
  }
  return res;
}

// Called only when recovery genuinely failed (the refresh token is dead). We
// clear ONLY this browser's session (scope: 'local') so the route guard sends
// the seller to /login. Local scope does not revoke the server-side refresh
// token, so other tabs/devices and concurrent sessions are left untouched.
async function handleRlsAuthFailure(): Promise<string> {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch { /* best-effort */ }
  return 'Your session expired. Please log in again to continue listing this product.';
}

/**
 * Returns true when the URL is a browser-only blob: reference that
 * cannot be used outside the session that created it.
 */
export function isBlobUrl(url: string | null | undefined): boolean {
  return typeof url === 'string' && url.startsWith('blob:');
}

/**
 * Resolve a product image URL.
 * If the value is already a full URL (starts with http), return as-is.
 * Blob URLs are rejected (they are session-only browser previews).
 * If it's a storage path, construct the Supabase public URL.
 * Returns empty string for falsy inputs.
 */
export function resolveProductImageUrl(value: string | null | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (isBlobUrl(trimmed)) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  // It's a storage path — construct the public URL
  const { data } = supabase.storage.from('product-images').getPublicUrl(trimmed);
  return data.publicUrl;
}

/**
 * Pick the first usable image URL from a product, falling back to
 * the images array when image_url is empty or a blob reference.
 */
export function resolveProductDisplayImage(product: { image_url?: string | null; images?: string[] }): string {
  const primary = resolveProductImageUrl(product.image_url);
  if (primary) return primary;
  // Fall back to first valid entry in images array
  for (const img of product.images || []) {
    const resolved = resolveProductImageUrl(img);
    if (resolved) return resolved;
  }
  return '';
}

const PUBLIC_PRODUCT_ID_COLUMN = 'public_product_id';

function isMissingPublicProductIdColumn(error: any) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  return (
    (message.includes(PUBLIC_PRODUCT_ID_COLUMN) && message.includes('does not exist')) ||
    code === '42703'
  );
}

function stripPublicProductIdField(selectFields: string) {
  return selectFields
    .split(',')
    .map((field) => field.trim())
    .filter((field) => field !== PUBLIC_PRODUCT_ID_COLUMN)
    .join(', ');
}

function buildProductSlug(rawValue: string, fallbackPrefix = 'product') {
  const normalized = String(rawValue || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const base = normalized ? normalized.slice(0, 160) : fallbackPrefix;
  const uniqueSuffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  return `${base}-${uniqueSuffix}`;
}

// ============================================================
// PRODUCT SERVICE — Supabase CRUD for products & related tables
// ============================================================

// ---------- FETCH ----------

export function fetchProducts(...args: Parameters<typeof fetchProductsUncached>) {
  const filters = args[0];
  // Only public storefront listings are cached; seller/admin/search views stay live.
  const isPublicListing = !!filters && filters.approvalStatus === 'approved' && filters.isActive === true
    && !filters.sellerId && !filters.search;
  if (!isPublicListing) return fetchProductsUncached(...args);
  return cachedQuery(`products:${JSON.stringify(filters)}`, QUERY_TTL.products, () => fetchProductsUncached(...args), (r) => !r.error);
}

async function fetchProductsUncached(filters?: {
  sellerId?: string;
  category?: string;
  categoryIds?: string[];
  approvalStatus?: string;
  isActive?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
  excludeDrafts?: boolean;
  resolveCategoryNames?: boolean;
  includeCount?: boolean;
  subcategoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStock?: boolean;
  sortBy?: 'featured' | 'price-low-high' | 'price-high-low' | 'rating' | 'newest';
  stableOrder?: boolean;
}) {
  let query = supabase.from('products').select(
    '*',
    filters?.includeCount === false ? undefined : { count: 'exact' },
  );

  if (filters?.sellerId) query = query.eq('seller_id', filters.sellerId);

  // Exclude incomplete drafts: products missing images or package dimensions
  if (filters?.excludeDrafts) {
    query = query
      .neq('image_url', '')
      .not('image_url', 'is', null)
      .gt('package_weight', 0);
  }
  if (filters?.categoryIds && filters.categoryIds.length > 0) {
    // Match products whose category hierarchy fields map to any category node.
    query = query.or(
      `category.in.(${filters.categoryIds.join(',')}),sub_category.in.(${filters.categoryIds.join(',')}),product_type.in.(${filters.categoryIds.join(',')})`
    );
  } else if (filters?.category) {
    query = query.eq('category', filters.category);
  }
  if (filters?.approvalStatus) query = query.eq('approval_status', filters.approvalStatus);
  if (filters?.isActive !== undefined) query = query.eq('is_active', filters.isActive);
  if (filters?.subcategoryId) {
    query = query.or(
      `category.eq.${filters.subcategoryId},sub_category.eq.${filters.subcategoryId},product_type.eq.${filters.subcategoryId}`
    );
  }
  if (filters?.minPrice !== undefined) query = query.gte('price', filters.minPrice);
  if (filters?.maxPrice !== undefined) query = query.lte('price', filters.maxPrice);
  if (filters?.minRating !== undefined) query = query.gte('rating', filters.minRating);
  if (filters?.inStock) query = query.gt('stock', 0);
  if (filters?.search) {
    const safe = filters.search.replace(/[\\%_(),.*]/g, '').trim().substring(0, 200);
    if (safe) {
      query = query.or(
        [
          `name.ilike.%${safe}%`,
          `description.ilike.%${safe}%`,
          `sku.ilike.%${safe}%`,
          `public_product_id.ilike.%${safe}%`,
          `hsn_code.ilike.%${safe}%`,
          `brand.ilike.%${safe}%`,
        ].join(',')
      );
    }
  }

  if (filters?.sortBy === 'price-low-high') {
    query = query.order('price', { ascending: true });
  } else if (filters?.sortBy === 'price-high-low') {
    query = query.order('price', { ascending: false });
  } else if (filters?.sortBy === 'rating') {
    query = query.order('rating', { ascending: false, nullsFirst: false });
  }
  query = query.order('created_at', { ascending: false });
  if (filters?.stableOrder) query = query.order('id', { ascending: false });

  const limit = filters?.limit || 100;
  const offset = filters?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  // Resolve category names from UUIDs
  const products = data || [];
  if (products.length > 0) {
    const catIds = [...new Set(products.flatMap((p: any) => [p.category, p.sub_category, p.product_type]).filter(Boolean))];
    if (catIds.length > 0 && filters?.resolveCategoryNames !== false) {
      const { data: cats } = await supabase
        .from('categories')
        .select('id, name')
        .in('id', catIds);
      if (cats) {
        const catMap = new Map(cats.map((c: any) => [c.id, c.name]));
        for (const p of products) {
          (p as any).category_name = catMap.get(p.category) || null;
          (p as any).sub_category_name = catMap.get(p.sub_category) || null;
          (p as any).product_type_name = catMap.get(p.product_type) || null;
        }
      }
    }
    await attachHasVariants(products);
  }

  return { data: products, error: error?.message || null, count: count || 0 };
}

export function fetchCategoryMaxPrice(...args: Parameters<typeof fetchCategoryMaxPriceUncached>) {
  return cachedQuery(`maxprice:${[...args[0]].sort().join(',')}`, QUERY_TTL.categories, () => fetchCategoryMaxPriceUncached(...args), (r) => !r.error);
}

async function fetchCategoryMaxPriceUncached(categoryIds: string[]) {
  const { data, error } = await supabase
    .from('products')
    .select('price')
    .or(`category.in.(${categoryIds.join(',')}),sub_category.in.(${categoryIds.join(',')}),product_type.in.(${categoryIds.join(',')})`)
    .eq('approval_status', 'approved')
    .eq('is_active', true)
    .order('price', { ascending: false })
    .limit(1);
  return { maxPrice: Number(data?.[0]?.price || 0), error: error?.message || null };
}

export async function searchPublicProductsByKeywords(
  queryText: string,
  limit = 8,
  offset = 0,
  hydrateProducts = false,
) {
  const query = (queryText || '').trim().replace(/\s+/g, ' ').slice(0, 200);
  if (!query) {
    return { data: [] as any[], totalCount: 0, error: null as string | null };
  }

  const { data, error } = await supabase.rpc('search_products_catalog', {
    p_query_text: query,
    p_result_limit: limit,
    p_result_offset: offset,
  });

  if (error) {
    return { data: [] as any[], totalCount: 0, error: error.message || null };
  }

  const rankedRows = (data || []) as Array<Record<string, any>>;
  const totalCount = Number(rankedRows[0]?.total_count || 0);
  if (!hydrateProducts || rankedRows.length === 0) {
    return { data: rankedRows, totalCount, error: null as string | null };
  }

  const orderedIds = rankedRows.map((row) => String(row.id));
  const { data: products, error: productError } = await supabase
    .from('products')
    .select('*, product_variants(*), offer_rules(*)')
    .in('id', orderedIds)
    .eq('approval_status', 'approved')
    .eq('is_active', true);

  if (productError) {
    return { data: [] as any[], totalCount, error: productError.message || null };
  }

  const productById = new Map((products || []).map((product: any) => [
    String(product.id),
    {
      ...product,
      has_variants: Array.isArray(product.product_variants) && product.product_variants.length > 0,
    },
  ]));
  const categoryIds = [...new Set((products || []).flatMap((product: any) => [
    product.category,
    product.sub_category,
    product.product_type,
  ]).filter(Boolean))];
  if (categoryIds.length > 0) {
    const { data: categories, error: categoryError } = await supabase
      .from('categories')
      .select('id, name')
      .in('id', categoryIds);

    if (categoryError) {
      return { data: [] as any[], totalCount, error: categoryError.message || null };
    }

    const categoryNames = new Map((categories || []).map((category: any) => [category.id, category.name]));
    productById.forEach((product: any) => {
      product.category_name = categoryNames.get(product.category) || null;
      product.sub_category_name = categoryNames.get(product.sub_category) || null;
      product.product_type_name = categoryNames.get(product.product_type) || null;
    });
  }

  return {
    data: orderedIds.map((id) => productById.get(id)).filter(Boolean),
    totalCount,
    error: null as string | null,
  };
}

export function fetchProductById(...args: Parameters<typeof fetchProductByIdUncached>) {
  if (args[1]?.includeUnapproved) return fetchProductByIdUncached(...args);
  return cachedQuery(`product:${(args[0] || '').trim()}`, QUERY_TTL.product, () => fetchProductByIdUncached(...args), (r) => !r.error && !!r.data);
}

async function fetchProductByIdUncached(id: string, options?: { includeUnapproved?: boolean }) {
  const ref = (id || '').trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ref);
  const isPublicProductId = /^BZD\d{9}$/i.test(ref);

  const buildQuery = (column: 'id' | 'slug' | 'public_product_id') => {
    let query = supabase
      .from('products')
      .select('*, product_variants(*), offer_rules(*)')
      .eq(column, ref);

    if (!options?.includeUnapproved) {
      query = query.eq('approval_status', 'approved').eq('is_active', true);
    }

    return query;
  };

  const targetColumn = isUuid ? 'id' : isPublicProductId ? 'public_product_id' : 'slug';
  let { data, error } = await buildQuery(targetColumn).maybeSingle();

  if (error && isMissingPublicProductIdColumn(error) && targetColumn === 'public_product_id') {
    const fallback = await buildQuery('slug').maybeSingle();
    data = (fallback.data as any) || null;
    error = fallback.error;
  }

  // Slug lookup returned nothing — do NOT fall back to `id` column
  // because a slug string will trigger a Postgres 22P02 UUID cast error.

  // Resolve category, subcategory & product type names from the categories table
  if (data) {
    const catIds = [data.category, data.sub_category, data.product_type].filter(Boolean);
    if (catIds.length > 0) {
      const { data: cats } = await supabase
        .from('categories')
        .select('id, name, slug, parent_id')
        .in('id', catIds);
      if (cats) {
        const catMap = new Map(cats.map((c: any) => [c.id, c]));
        const cat = catMap.get(data.category);
        const subCat = catMap.get(data.sub_category);
        const productType = catMap.get(data.product_type);
        data.category_name = cat?.name || null;
        data.category_slug = cat?.slug || null;
        data.sub_category_name = subCat?.name || null;
        data.sub_category_slug = subCat?.slug || null;
        data.product_type_name = productType?.name || null;
        data.product_type_slug = productType?.slug || null;
        // If subcategory exists but no direct category, try to get parent
        if (!cat && subCat?.parent_id) {
          const { data: parent } = await supabase
            .from('categories')
            .select('id, name, slug')
            .eq('id', subCat.parent_id)
            .single();
          if (parent) {
            data.category_name = parent.name;
            data.category_slug = parent.slug;
          }
        }
      }
    }
  }

  return { data, error: error?.message || null };
}

export function fetchProductReviews(...args: Parameters<typeof fetchProductReviewsUncached>) {
  return cachedQuery(`reviews:${args[0]}`, QUERY_TTL.product, () => fetchProductReviewsUncached(...args), (r) => !r.error);
}

async function fetchProductReviewsUncached(productId: string) {
  const { data: reviewRows, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('product_id', productId)
    .eq('is_flagged', false)
    .order('created_at', { ascending: false });

  if (error) {
    return { data: [] as any[], error: error.message || null };
  }

  const reviews = reviewRows || [];
  const userIds = Array.from(new Set(reviews.map((row: any) => row.user_id).filter(Boolean)));

  let profileMap = new Map<string, { full_name?: string | null }>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds);

    profileMap = new Map((profiles || []).map((profile: any) => [profile.id, profile]));
  }

  const enriched = reviews.map((row: any) => ({
    ...row,
    profiles: {
      full_name: profileMap.get(row.user_id)?.full_name || null,
    },
  }));

  return { data: enriched, error: null as string | null };
}

function shuffleWithSeed<T>(items: T[], seed: string): T[] {
  const copy = [...items];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  for (let i = copy.length - 1; i > 0; i -= 1) {
    hash = (hash * 1103515245 + 12345) | 0;
    const j = Math.abs(hash) % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function fetchSimilarProducts(...args: Parameters<typeof fetchSimilarProductsUncached>) {
  return cachedQuery(`similar:${JSON.stringify(args)}`, QUERY_TTL.products, () => fetchSimilarProductsUncached(...args), (r: any) => !r?.error);
}

async function fetchSimilarProductsUncached(
  category: string,
  excludeId: string,
  limit = 8,
  filters?: { subCategory?: string | null; productType?: string | null },
) {
  const selectFields = 'id, public_product_id, name, slug, image_url, brand, price, currency, discount_price, rating';
  const poolSize = Math.max(limit * 4, 32);

  const runQuery = async (column: 'product_type' | 'sub_category' | 'category', value: string) => {
    let { data, error } = await supabase
      .from('products')
      .select(selectFields)
      .eq(column, value)
      .eq('approval_status', 'approved')
      .eq('is_active', true)
      .neq('id', excludeId)
      .limit(poolSize);

    if (error && isMissingPublicProductIdColumn(error)) {
      const fallback = await supabase
        .from('products')
        .select(stripPublicProductIdField(selectFields))
        .eq(column, value)
        .eq('approval_status', 'approved')
        .eq('is_active', true)
        .neq('id', excludeId)
        .limit(poolSize);
      data = (fallback.data as any) || null;
      error = fallback.error;
    }

    return { data: (data || []) as any[], error: error?.message || null };
  };

  const merged: any[] = [];
  const seen = new Set<string>();
  const appendUnique = (rows: any[]) => {
    for (const row of rows) {
      if (!row?.id || seen.has(row.id)) continue;
      seen.add(row.id);
      merged.push(row);
    }
  };

  if (filters?.productType) {
    appendUnique((await runQuery('product_type', filters.productType)).data);
  }
  if (merged.length < limit && filters?.subCategory) {
    appendUnique((await runQuery('sub_category', filters.subCategory)).data);
  }
  if (merged.length < limit && category) {
    appendUnique((await runQuery('category', category)).data);
  }

  const data = shuffleWithSeed(merged, excludeId).slice(0, limit);
  return { data, error: null as string | null };
}

// ---------- HOME PAGE SECTIONS ----------

/**
 * Given a list of products, batch-queries product_variants and sets has_variants
 * on each product in-place. One extra round-trip per page load.
 */
async function attachHasVariants(products: any[]): Promise<void> {
  if (!products.length) return;
  const ids = products.map((p) => p.id).filter(Boolean);
  const { data } = await supabase
    .from('product_variants')
    .select('product_id')
    .in('product_id', ids);
  const withVariants = new Set((data || []).map((r: any) => r.product_id));
  for (const p of products) {
    p.has_variants = withVariants.has(p.id);
  }
}

const HOME_PRODUCT_FIELDS =
  'id, public_product_id, name, slug, description, price, mrp, discount_price, currency, image_url, images, seller_id, category, brand, stock, rating, review_count, is_featured, tags, item_condition, created_at';

async function fetchHomeProductsWithPublicIdFallback(baseQuery: any) {
  let response = await baseQuery(HOME_PRODUCT_FIELDS);
  if (response.error && isMissingPublicProductIdColumn(response.error)) {
    response = await baseQuery(stripPublicProductIdField(HOME_PRODUCT_FIELDS));
  }
  if (!response.error && response.data) {
    await attachHasVariants(response.data);
  }
  return response;
}

/** Featured products — admin-marked is_featured = true */
export async function fetchFeaturedProducts(limit = 10) {
  const { data, error } = await fetchHomeProductsWithPublicIdFallback((fields: string) =>
    supabase
      .from('products')
      .select(fields)
      .eq('approval_status', 'approved')
      .eq('is_active', true)
      .eq('is_featured', true)
      .order('created_at', { ascending: false })
      .limit(limit)
  );
  return { data: data || [], error: error?.message || null };
}

/** Hot deals — products with the highest discount percentage ((mrp - price) / mrp) */
export async function fetchHotDeals(limit = 10) {
  // Supabase doesn't support computed-column ORDER, so fetch all approved
  // products that have an MRP > price and sort client-side.
  const { data, error } = await fetchHomeProductsWithPublicIdFallback((fields: string) =>
    supabase
      .from('products')
      .select(fields)
      .eq('approval_status', 'approved')
      .eq('is_active', true)
      .not('mrp', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200)
  );

  if (error) return { data: [], error: error.message };

  const sorted = (data || [])
    .filter((p: any) => p.mrp && p.mrp > p.price)
    .sort((a: any, b: any) => {
      const discA = ((a.mrp! - a.price) / a.mrp!) * 100;
      const discB = ((b.mrp! - b.price) / b.price) * 100;
      return discB - discA;
    })
    .slice(0, limit);

  return { data: sorted, error: null };
}

/** Trending now — newest approved products */
export async function fetchTrendingProducts(limit = 10) {
  const { data, error } = await fetchHomeProductsWithPublicIdFallback((fields: string) =>
    supabase
      .from('products')
      .select(fields)
      .eq('approval_status', 'approved')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(limit)
  );
  return { data: data || [], error: error?.message || null };
}

export type ProductSection = 'featured' | 'hot-deals' | 'trending';

export interface HomepageProductPage {
  data: Product[];
  count: number;
  error: string | null;
}

/**
 * Fetch one database-paginated page for a homepage section.
 * Hot Deals candidates are filtered and ranked as pages are accumulated.
 */
export async function fetchHomepageProductsPage(
  section: ProductSection,
  limit: number,
  offset: number,
): Promise<HomepageProductPage> {
  const isFeatured = section === 'featured';
  const buildQuery = (fields: string) => {
    let query = supabase
      .from('products')
      .select(fields, { count: 'exact' })
      .eq('approval_status', 'approved')
      .eq('is_active', true);

    if (isFeatured) query = query.eq('is_featured', true);
    if (section === 'hot-deals') query = query.not('mrp', 'is', null);

    return query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1);
  };

  let response = await buildQuery(HOME_PRODUCT_FIELDS);
  if (response.error && isMissingPublicProductIdColumn(response.error)) {
    response = await buildQuery(stripPublicProductIdField(HOME_PRODUCT_FIELDS));
  }

  return {
    data: (response.data || []) as unknown as Product[],
    count: response.count || 0,
    error: response.error?.message || null,
  };
}

export const sectionMeta: Record<ProductSection, { title: string; subtitle: string; icon: string }> = {
  featured: {
    title: 'Featured Products',
    subtitle: 'Hand-picked by our team — the best products across all categories',
    icon: '⭐',
  },
  'hot-deals': {
    title: 'Hot Deals',
    subtitle: 'Massive discounts on top products — limited time offers',
    icon: '🔥',
  },
  trending: {
    title: 'Trending Now',
    subtitle: 'What everyone is buying right now — most popular picks',
    icon: '📈',
  },
};

export async function fetchProductsBySection(section: ProductSection, limit = 10) {
  switch (section) {
    case 'featured':
      return fetchFeaturedProducts(limit);
    case 'hot-deals':
      return fetchHotDeals(limit);
    case 'trending':
      return fetchTrendingProducts(limit);
    default:
      return { data: [], error: 'Invalid section' };
  }
}

// ---------- CATEGORIES (3-level hierarchy) ----------

// Types
export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  level: number;
  display_order: number;
  is_active: boolean;
  children?: CategoryNode[];
}

export function fetchCategoriesFlat(...args: Parameters<typeof fetchCategoriesFlatUncached>) {
  return cachedQuery(`categories:${args[0] ?? true}:${args[1] ?? 'all'}`, QUERY_TTL.categories, () => fetchCategoriesFlatUncached(...args), (r) => !r.error);
}

/**
 * Fetch all active categories as a flat list.
 * Frontend builds the tree from parent_id relationships.
 */
async function fetchCategoriesFlatUncached(activeOnly = true, level?: number) {
  // PostgREST caps a single response at 1000 rows. The category tree has more
  // than that, so page through with .range() until we've pulled every row —
  // otherwise sub-categories/product types past row 1000 silently disappear.
  const pageSize = 1000;
  const all: any[] = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let query = supabase
      .from('categories')
      .select('id, name, slug, parent_id, level, display_order, is_active')
      .order('level')
      .order('display_order')
      .range(from, from + pageSize - 1);
    if (activeOnly) query = query.eq('is_active', true);
    if (level !== undefined) query = query.eq('level', level);
    const { data, error } = await query;
    if (error) return { data: all, error: error.message };
    const batch = data || [];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return { data: all, error: null };
}

/**
 * Build a 3-level tree from a flat list of categories.
 */
export function buildCategoryTree(flat: CategoryNode[]): CategoryNode[] {
  const map = new Map<string, CategoryNode>();
  const roots: CategoryNode[] = [];

  // Index all nodes
  for (const cat of flat) {
    map.set(cat.id, { ...cat, children: [] });
  }

  // Build tree
  for (const cat of flat) {
    const node = map.get(cat.id)!;
    if (cat.parent_id && map.has(cat.parent_id)) {
      map.get(cat.parent_id)!.children!.push(node);
    } else if (!cat.parent_id) {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Fetch the full category tree (3-level) — convenience wrapper.
 */
export async function fetchCategoryTree() {
  const { data, error } = await fetchCategoriesFlat(true);
  if (error) return { data: [], error };
  return { data: buildCategoryTree(data as CategoryNode[]), error: null };
}

/**
 * Legacy compatibility: fetchCategories returns level-1 categories only.
 */
export async function fetchCategories(activeOnly = true) {
  const { data, error } = await fetchCategoriesFlat(activeOnly, 1);
  if (error) return { data: [], error };
  const level1 = (data as CategoryNode[]).filter(c => c.level === 1);
  return { data: level1, error: null };
}

export async function fetchCategoryById(id: string) {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, slug, parent_id, level, display_order, is_active')
    .eq('id', id)
    .single();
  return { data, error: error?.message || null };
}

export async function fetchCategoryBySlug(slug: string) {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, slug, parent_id, level, display_order, is_active')
    .eq('slug', slug)
    .single();
  return { data, error: error?.message || null };
}

export function fetchCategoryContext(...args: Parameters<typeof fetchCategoryContextUncached>) {
  return cachedQuery(`catctx:${args[0]}`, QUERY_TTL.categories, () => fetchCategoryContextUncached(...args), (r) => !!r.category);
}

/**
 * Fetch full category context: the category itself, its parent (breadcrumb), and its children (subcategory nav).
 * Also collects all descendant IDs for product fetching.
 */
async function fetchCategoryContextUncached(slugOrId: string) {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);

  // The target may be inactive, so resolve it separately from the active tree.
  const [categoryResult, categoriesResult] = await Promise.all([
    supabase
      .from('categories')
      .select('id, name, slug, parent_id, level, display_order, is_active')
      .eq(isUUID ? 'id' : 'slug', slugOrId)
      .maybeSingle(),
    fetchCategoriesFlat(),
  ]);
  if (categoryResult.error) throw new Error(categoryResult.error.message);
  if (categoriesResult.error) throw new Error(categoriesResult.error);
  const catData = categoryResult.data;
  if (!catData) return { category: null, parent: null, children: [], allCategoryIds: [], parentById: {} };
  const flatCats = categoriesResult.data;

  // 3. Find parent for breadcrumb
  let parent: any = null;
  if (catData.parent_id) {
    parent = flatCats.find((c: any) => c.id === catData.parent_id) || null;
  }

  // 4. Find direct children for subcategory navigation
  const children = flatCats
    .filter((c: any) => c.parent_id === catData.id)
    .sort((a: any, b: any) => a.display_order - b.display_order);

  // 5. Collect all descendant IDs (children + grandchildren) for product fetching
  const childIds = children.map((c: any) => c.id);
  const grandchildIds = flatCats
    .filter((c: any) => childIds.includes(c.parent_id))
    .map((c: any) => c.id);
  const allCategoryIds = [catData.id, ...childIds, ...grandchildIds];

  // 6. Build category-name lookup for enriching products
  const categoryNames: Record<string, string> = {};
  flatCats.forEach((c: any) => { categoryNames[c.id] = c.name; });

  const parentById: Record<string, string | null> = {};
  flatCats.forEach((c: any) => {
    parentById[c.id] = c.parent_id || null;
  });

  return { category: catData, parent, children, allCategoryIds, categoryNames, parentById };
}

export async function createCategory(cat: { name: string; slug: string; parent_id?: string | null; level?: number; display_order?: number }) {
  clearQueryCache();
  const { data, error } = await supabase
    .from('categories')
    .insert({
      name: cat.name,
      slug: cat.slug,
      parent_id: cat.parent_id || null,
      level: cat.level || 1,
      display_order: cat.display_order || 0,
    })
    .select()
    .single();
  return { data, error: error?.message || null };
}

export async function updateCategory(id: string, updates: { name?: string; slug?: string; is_active?: boolean; display_order?: number }) {
  clearQueryCache();
  const { data, error } = await supabase
    .from('categories')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  return { data, error: error?.message || null };
}

export async function deleteCategory(id: string) {
  clearQueryCache();
  const { error } = await supabase.from('categories').delete().eq('id', id);
  return { success: !error, error: error?.message || null };
}

// ---------- COUNTRIES ----------

export async function fetchCountries() {
  const { data, error } = await supabase
    .from('countries')
    .select('id, country_name, country_code, currency_code')
    .order('country_name');
  return { data: data || [], error: error?.message || null };
}

// ---------- CREATE ----------

export async function createProduct(productData: Record<string, unknown>) {
  clearQueryCache();
  const sizeVariants = (productData.sizeVariants || productData.size_variants || []) as Record<string, unknown>[];
  const colorVariants = (productData.colorVariants || productData.color_variants || []) as Record<string, unknown>[];
  const variantCombinations = (productData.variantCombinations || productData.variant_combinations || []) as Record<string, unknown>[];
  const offerRules = (productData.offerRules || productData.offer_rules || []) as Record<string, unknown>[];

  const dims = (productData.packageDimensions || {}) as Record<string, number>;

  // Strip any blob: preview URLs that may have leaked through
  const cleanImages = ((productData.images || []) as string[]).filter(u => !isBlobUrl(u));
  const cleanVideos = ((productData.videos || []) as string[]).filter(u => !isBlobUrl(u));
  const rawImageUrl = (productData.image_url || cleanImages[0] || '') as string;

  const product = {
    seller_id: productData.seller_id as string,
    name: productData.name as string,
    slug: buildProductSlug(String(productData.slug || productData.name || ''), 'product'),
    description: (productData.description || '') as string,
    short_description: (productData.short_description || productData.shortDescription || '') as string,
    category: (productData.category || productData.categoryId || '') as string,
    sub_category: (productData.sub_category ?? productData.subCategoryId ?? null) as string | null,
    brand: (productData.brand || productData.brandName || productData.brand_name || '') as string,
    ingredients: (productData.ingredients || '') as string,
    directions: (productData.directions || '') as string,
    model_number: (productData.model_number || productData.modelNumber || '') as string,
    sku: (productData.sku || '') as string,
    price: Number(productData.price || productData.sellingPrice || 0),
    default_selling_price: Number(productData.price || productData.sellingPrice || 0),
    mrp: Number(productData.mrp || 0),
    discount_price: productData.discount_price ? Number(productData.discount_price) : null,
    currency: (productData.currency || 'INR') as string,
    origin_country: (productData.origin_country || '') as string,
    origin_country_id: (productData.origin_country_id || null) as string | null,
    stock: Number(productData.stock || productData.stockQuantity || 0),
    image_url: isBlobUrl(rawImageUrl) ? (cleanImages[0] || '') : rawImageUrl,
    images: cleanImages,
    videos: cleanVideos,
    highlights: (productData.highlights || []) as string[],
    specifications: productData.specifications || [],
    seller_notes: (productData.sellerNotes || productData.seller_notes || []) as string[],
    platform_fee: Number(productData.platform_fee || productData.platformFee || 8.5),
    commission: Number(productData.commission || 3),
    package_weight: Number(productData.package_weight || productData.packageWeight || 0),
    package_weight_unit_id: (productData.package_weight_unit_id || productData.packageWeightUnitId || null) as string | null,
    package_length: Number(productData.package_length || dims.length || 0),
    package_length_unit_id: (productData.package_length_unit_id || productData.packageLengthUnitId || null) as string | null,
    package_width: Number(productData.package_width || dims.width || 0),
    package_width_unit_id: (productData.package_width_unit_id || productData.packageWidthUnitId || null) as string | null,
    package_height: Number(productData.package_height || dims.height || 0),
    package_height_unit_id: (productData.package_height_unit_id || productData.packageHeightUnitId || null) as string | null,
    packing_type_id: (productData.packing_type_id || productData.packingTypeId || null) as string | null,
    is_cod_available: Boolean(productData.is_cod_available ?? productData.isCodAvailable ?? true),
    shipping_type: (productData.shipping_type || productData.shippingType || 'self') as string,
    manufacturer_name: (productData.manufacturer_name || productData.manufacturerName || '') as string,
    manufacturer_country: (productData.manufacturer_country || productData.manufacturerCountry || '') as string,
    manufacturer_address: (productData.manufacturer_address || productData.manufacturerAddress || '') as string,
    important_note: (productData.important_note || productData.importantNote || '') as string,
    packing_details: (productData.packing_details || productData.packingDetails || '') as string,
    courier_partner: (productData.courier_partner || productData.courierPartner || '') as string,
    cancellation_policy_days: Number(productData.cancellation_policy_days || productData.cancellationPolicyDays || 7),
    return_policy_days: Number(productData.return_policy_days || productData.returnPolicyDays || 7),
    approval_status: (productData.approval_status || productData.approvalStatus || 'pending') as string,
    is_active: Boolean(productData.is_active ?? productData.isActive ?? false),
    is_featured: Boolean(productData.is_featured ?? false),
    tags: (productData.tags || []) as string[],
    item_condition: (productData.item_condition || productData.itemCondition || 'brand_new') as string,
  };

  const { data, error } = await writeWithAuthRetry(() =>
    supabase.from('products').insert(product).select().single(),
  );
  if (error) {
    if (isRlsAuthError(error.message)) {
      return { data: null, error: await handleRlsAuthFailure() };
    }
    return { data: null, error: error.message };
  }

  const productId = data.id;

  // Fire admin alert (non-blocking) when the new product needs review.
  if (product.approval_status === 'pending') {
    notifyAdminsOfEvent({
      type: 'product_pending',
      title: 'New Product Pending Review',
      message: `"${product.name}" was submitted by a seller and needs approval.`,
      metadata: {
        product_id: productId,
        product_name: product.name,
        seller_id: product.seller_id,
        category: product.category,
      },
      email: {
        eventType: 'product_pending',
        data: { order_id: productId, entity_name: product.name },
      },
    }).catch((err: unknown) => console.error('[createProduct] admin notify failed:', err));
  }

  // Insert combination variants when provided
  if (variantCombinations.length > 0) {
    const normalizedSkus = variantCombinations
      .map((variant) => String(variant.sku || '').trim().toUpperCase())
      .filter(Boolean);

    const hasDuplicateSku = new Set(normalizedSkus).size !== normalizedSkus.length;
    if (hasDuplicateSku) {
      await supabase.from('products').delete().eq('id', productId);
      return { data: null, error: 'Duplicate variant SKU detected. Please ensure each SKU is unique.' };
    }

    const { error: comboError } = await supabase.from('product_variants').insert(
      variantCombinations.map(v => {
        const sizeValue = String(v.size_value || v.sizeValue || '').trim();
        const sizeUnit = String(v.size_unit || v.sizeUnit || '').trim();
        const formattedSize = sizeUnit && sizeUnit !== 'NONE' ? `${sizeValue} ${sizeUnit}` : sizeValue;
        return {
          product_id: productId,
          variant_type: 'combination',
          size: formattedSize,
          size_system: String(v.size_system || v.sizeSystem || '').trim() || null,
          size_value: sizeValue || null,
          color: String(v.color || '').trim() || null,
          color_hex: String(v.color_hex || v.colorHex || '').trim() || null,
          sku: String(v.sku || '').trim() || null,
          price: Number(v.price || 0),
          mrp: Number((v as any).mrp || 0) || Number(v.price || 0),
          stock: Number(v.stock || 0),
          quantity: Number(v.stock || 0),
          images: Array.isArray(v.images) ? v.images : [],
        };
      })
    );
    if (comboError) {
      await supabase.from('products').delete().eq('id', productId);
      return { data: null, error: `Failed to save variant combinations: ${comboError.message}` };
    }
  }

  // Backward compatible insert: size variants
  if (variantCombinations.length === 0 && sizeVariants.length > 0) {
    const { error: sizeError } = await supabase.from('product_variants').insert(
      sizeVariants.map(v => ({
        product_id: productId,
        variant_type: 'size',
        size: v.size as string,
        price: Number(v.price || 0),
        mrp: Number((v as any).mrp || 0) || Number(v.price || 0) || Number(productData.mrp || 0),
        stock: Number(v.stock || 0),
        quantity: Number(v.quantity || 0),
      }))
    );
    if (sizeError) {
      await supabase.from('products').delete().eq('id', productId);
      return { data: null, error: `Failed to save size variants: ${sizeError.message}` };
    }
  }

  // Backward compatible insert: color variants
  if (variantCombinations.length === 0 && colorVariants.length > 0) {
    const { error: colorError } = await supabase.from('product_variants').insert(
      colorVariants.map(v => ({
        product_id: productId,
        variant_type: 'color',
        color: v.color as string,
        color_hex: (v.hex || v.color_hex || '') as string,
        sku: (v.sku || '') as string,
        price: Number(v.price || 0),
        mrp: Number((v as any).mrp || 0) || Number(v.price || 0) || Number(productData.mrp || 0),
        stock: Number(v.stock || 0),
      }))
    );
    if (colorError) {
      await supabase.from('products').delete().eq('id', productId);
      return { data: null, error: `Failed to save color variants: ${colorError.message}` };
    }
  }

  // Insert offer rules
  if (offerRules.length > 0) {
    const { error: offerError } = await supabase.from('offer_rules').insert(
      offerRules.map(or => ({
        product_id: productId,
        offer_type: (or.type || or.offer_type || '') as string,
        buy_quantity: or.buyQuantity != null ? Number(or.buyQuantity) : null,
        get_quantity: or.getQuantity != null ? Number(or.getQuantity) : null,
        special_day_name: (or.specialDayName || or.special_day_name || or.specialDay || null) as string | null,
        discount_percent: or.discountPercent != null ? Number(or.discountPercent) : null,
        start_time: (or.startTime || or.start_time || null) as string | null,
        end_time: (or.endTime || or.end_time || null) as string | null,
        bundle_min_qty: or.bundleMinQty != null ? Number(or.bundleMinQty) : null,
        bundle_discount: or.bundleDiscount != null ? Number(or.bundleDiscount) : null,
        is_active: Boolean(or.isActive ?? or.is_active ?? or.active ?? true),
      }))
    );
    if (offerError) {
      await supabase.from('products').delete().eq('id', productId);
      return { data: null, error: `Failed to save offer rules: ${offerError.message}` };
    }
  }

  return { data, error: null };
}

export async function upsertProductDraftBasic(input: {
  draftId?: string;
  seller_id: string;
  name: string;
  sku?: string;
  category: string;
  sub_category?: string;
  product_type?: string | null;
  hsn_code?: string | null;
  brand: string;
  ingredients?: string;
  directions?: string;
  manufacturer_name?: string;
  manufacturer_country?: string;
  important_note?: string;
  short_description: string;
  description: string;
  origin_country_id: string;
  origin_country: string;
  currency: string;
  mrp: number;
  price: number;
  stock: number;
  is_cod_available?: boolean;
  item_condition?: string;
}) {
  // Auto-generate SKU when seller doesn't provide one
  const sellerSku = (input.sku || '').trim().toUpperCase();
  const finalSku = sellerSku || await generateNextSku();

  const payload = {
    seller_id: input.seller_id,
    name: input.name,
    sku: finalSku,
    category: input.category,
    sub_category: input.sub_category || null,
    product_type: input.product_type || null,
    hsn_code: input.hsn_code || null,
    brand: input.brand,
    ingredients: input.ingredients || '',
    directions: input.directions || '',
    manufacturer_name: input.manufacturer_name || '',
    manufacturer_country: input.manufacturer_country || '',
    important_note: input.important_note || '',
    short_description: input.short_description,
    description: input.description,
    origin_country_id: input.origin_country_id || null,
    origin_country: input.origin_country || '',
    currency: input.currency || 'INR',
    mrp: Number(input.mrp || 0),
    price: Number(input.price || 0),
    default_selling_price: Number(input.price || 0),
    stock: Number(input.stock || 0),
    is_cod_available: input.is_cod_available !== false,
    item_condition: input.item_condition || 'brand_new',
    approval_status: 'pending',
    is_active: false,
  };

  if (input.draftId) {
    // When updating a draft, only overwrite SKU if the seller explicitly provided one
    // or if the existing row has no SKU yet
    const updatePayload = { ...payload };
    if (!sellerSku) {
      const { data: existing } = await supabase
        .from('products')
        .select('sku')
        .eq('id', input.draftId)
        .single();
      if (existing?.sku) {
        updatePayload.sku = existing.sku;
      }
    }

    let { data, error } = await writeWithAuthRetry(() =>
      supabase
        .from('products')
        .update(updatePayload)
        .eq('id', input.draftId as string)
        .select('id, public_product_id')
        .single(),
    );

    if (error && isMissingPublicProductIdColumn(error)) {
      const fallback = await supabase
        .from('products')
        .update(payload)
        .eq('id', input.draftId)
        .select('id')
        .single();
      data = fallback.data ? { ...fallback.data, public_product_id: null } : null;
      error = fallback.error;
    }

    if (error && isRlsAuthError(error.message)) {
      return { data: null, error: await handleRlsAuthFailure() };
    }

    return { data, error: error?.message || null };
  }

  const draftSlug = buildProductSlug(input.name, 'draft-product');
  let { data, error } = await writeWithAuthRetry(() =>
    supabase
      .from('products')
      .insert({
        ...payload,
        slug: draftSlug,
      })
      .select('id, public_product_id')
      .single(),
  );

  if (error && isMissingPublicProductIdColumn(error)) {
    const fallback = await supabase
      .from('products')
      .insert({
        ...payload,
        slug: draftSlug,
      })
      .select('id')
      .single();
    data = fallback.data ? { ...fallback.data, public_product_id: null } : null;
    error = fallback.error;
  }

  if (error && isRlsAuthError(error.message)) {
    return { data: null, error: await handleRlsAuthFailure() };
  }

  // Fire admin alert (non-blocking) on initial draft insert — update path
  // above intentionally skipped to avoid spamming admins on every save.
  if (!error && data?.id) {
    notifyAdminsOfEvent({
      type: 'product_pending',
      title: 'New Product Pending Review',
      message: `"${input.name}" was submitted by a seller and needs approval.`,
      metadata: {
        product_id: data.id,
        product_name: input.name,
        seller_id: input.seller_id,
        category: input.category,
      },
      email: {
        eventType: 'product_pending',
        data: { order_id: data.id, entity_name: input.name },
      },
    }).catch((err: unknown) => console.error('[upsertProductDraftBasic] admin notify failed:', err));
  }

  return { data, error: error?.message || null };
}

export interface VariantCombinationDraftInput {
  size_system: string;
  size_value: string;
  size_unit?: string;
  color: string;
  color_hex?: string;
  sku: string;
  price: number;
  mrp?: number;
  stock: number;
  images?: string[];
}

export async function saveProductDraftDetails(input: {
  productId: string;
  highlights: string[];
  specifications: Record<string, string>;
  packing_type_id: string;
  package_weight: number;
  package_weight_unit_id: string;
  package_length: number;
  package_length_unit_id: string;
  package_width: number;
  package_width_unit_id: string;
  package_height: number;
  package_height_unit_id: string;
  variantCombinations: VariantCombinationDraftInput[];
}) {
  const normalizedSkus = input.variantCombinations
    .map((variant) => String(variant.sku || '').trim().toUpperCase())
    .filter(Boolean);

  if (normalizedSkus.length === 0) {
    return { success: false, error: 'At least one variant SKU is required.' };
  }

  if (new Set(normalizedSkus).size !== normalizedSkus.length) {
    return { success: false, error: 'Duplicate variant SKU detected.' };
  }

  // Build variant rows before any destructive operations so we can
  // bail out early on validation errors without touching existing data.
  const variantRows = input.variantCombinations.map((variant) => {
    const sizeValue = String(variant.size_value || '').trim();
    const sizeUnit = String(variant.size_unit || '').trim();
    const formattedSize = sizeUnit && sizeUnit !== 'NONE' ? `${sizeValue} ${sizeUnit}` : sizeValue;
    return {
      product_id: input.productId,
      variant_type: 'combination',
      size: formattedSize,
      size_system: String(variant.size_system || '').trim() || null,
      size_value: sizeValue || null,
      color: String(variant.color || '').trim() || null,
      color_hex: String(variant.color_hex || '').trim() || null,
      sku: String(variant.sku || '').trim().toUpperCase(),
      price: Number(variant.price || 0),
      mrp: Number(variant.mrp || 0) || Number(variant.price || 0),
      stock: Number(variant.stock || 0),
      quantity: Number(variant.stock || 0),
      images: Array.isArray(variant.images) ? variant.images : [],
    };
  });

  const { error: updateError } = await supabase
    .from('products')
    .update({
      highlights: input.highlights,
      specifications: input.specifications,
      packing_type_id: input.packing_type_id,
      package_weight: input.package_weight,
      package_weight_unit_id: input.package_weight_unit_id,
      package_length: input.package_length,
      package_length_unit_id: input.package_length_unit_id,
      package_width: input.package_width,
      package_width_unit_id: input.package_width_unit_id,
      package_height: input.package_height,
      package_height_unit_id: input.package_height_unit_id,
      // Sync product-level price / mrp / stock from the cheapest variant row
      // so legacy columns + RPC card pricing stay accurate.
      ...(() => {
        const rows = variantRows;
        const cheapest = rows.reduce((min, r) => (!min || (r.price > 0 && (min.price <= 0 || r.price < min.price)) ? r : min), rows[0]);
        const derivedPrice = Number(cheapest?.price || 0);
        const derivedMrp = Number(cheapest?.mrp || 0) || derivedPrice;
        const derivedStock = rows.reduce((s, r) => s + (Number(r.stock) || 0), 0);
        return {
          price: derivedPrice,
          mrp: derivedMrp,
          default_selling_price: derivedPrice,
          stock: derivedStock,
        };
      })(),
    })
    .eq('id', input.productId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  const { error: deleteError } = await supabase
    .from('product_variants')
    .delete()
    .eq('product_id', input.productId);

  if (deleteError) {
    return { success: false, error: deleteError.message };
  }

  const { error: insertError } = await supabase
    .from('product_variants')
    .insert(variantRows);

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  return { success: true, error: null as string | null };
}

export interface ProductInputSnapshotPayload {
  product_id: string;
  seller_id: string;
  basic_info: Record<string, unknown>;
  media: Record<string, unknown>;
  product_details: Record<string, unknown>;
  domestic_shipping: Record<string, unknown>;
  international_shipping: Record<string, unknown>;
  offers: Record<string, unknown>;
}

export async function saveProductInputSnapshot(payload: ProductInputSnapshotPayload) {
  const { error } = await supabase
    .from('product_input_snapshots')
    .upsert(payload, { onConflict: 'product_id' });

  return { success: !error, error: error?.message || null };
}

// ---------- SKU GENERATION ----------

const SKU_PREFIX = 'BZD032610';

/**
 * Generate the next sequential SKU by querying the highest existing one.
 * Pattern: BZD032610XXX where XXX increments.
 */
export async function generateNextSku(): Promise<string> {
  const { data } = await supabase
    .from('products')
    .select('sku')
    .like('sku', `${SKU_PREFIX}%`)
    .order('sku', { ascending: false })
    .limit(1);

  let nextSeq = 1;
  if (data && data.length > 0 && data[0].sku) {
    const numPart = data[0].sku.replace(SKU_PREFIX, '');
    const parsed = parseInt(numPart, 10);
    if (!isNaN(parsed)) nextSeq = parsed + 1;
  }
  return `${SKU_PREFIX}${String(nextSeq).padStart(3, '0')}`;
}

// ---------- ADMIN ACTIONS ----------

/** Fields required before a product can be approved. */
export interface ProductMissingFields {
  hsn_code?: boolean;
  sku?: boolean;
  package_weight?: boolean;
  package_length?: boolean;
  package_width?: boolean;
  package_height?: boolean;
}

/**
 * Check a product for missing mandatory fields.
 * Returns null if all fields present, otherwise an object listing missing fields.
 */
export function checkProductMissingFields(product: {
  hsn_code?: string | null;
  sku?: string | null;
  package_weight?: number | null;
  package_length?: number | null;
  package_width?: number | null;
  package_height?: number | null;
}): ProductMissingFields | null {
  const missing: ProductMissingFields = {};
  if (!product.hsn_code) missing.hsn_code = true;
  if (!product.sku) missing.sku = true;
  if (!product.package_weight || product.package_weight <= 0) missing.package_weight = true;
  if (!product.package_length || product.package_length <= 0) missing.package_length = true;
  if (!product.package_width || product.package_width <= 0) missing.package_width = true;
  if (!product.package_height || product.package_height <= 0) missing.package_height = true;

  return Object.keys(missing).length > 0 ? missing : null;
}

export async function approveProduct(id: string) {
  clearQueryCache();
  // Fetch the product first and validate required fields
  const { data: product, error: fetchErr } = await supabase
    .from('products')
    .select('hsn_code, sku, package_weight, package_length, package_width, package_height, seller_id, name')
    .eq('id', id)
    .single();

  if (fetchErr || !product) {
    return { success: false, error: fetchErr?.message || 'Product not found' };
  }

  const missing = checkProductMissingFields(product);
  if (missing) {
    const labels: Record<string, string> = {
      hsn_code: 'HSN Code',
      sku: 'SKU',
      package_weight: 'Package Weight',
      package_length: 'Package Length',
      package_width: 'Package Width',
      package_height: 'Package Height',
    };
    const missingList = Object.keys(missing).map(k => labels[k] || k).join(', ');
    return { success: false, error: `Cannot approve: missing ${missingList}. Seller must re-edit and resubmit.` };
  }

  const { error } = await supabase
    .from('products')
    .update({ approval_status: 'approved', is_active: true })
    .eq('id', id);
  if (error) return { success: false, error: error.message };

  // Notify the seller (non-blocking)
  const sellerId = (product as { seller_id?: string | null }).seller_id || '';
  const productName = (product as { name?: string | null }).name || 'Your product';
  if (sellerId) {
    notifyAccountEvent({
      type: 'product_approved',
      recipientUserIds: [sellerId],
      title: 'Product Approved',
      message: `"${productName}" has been approved and is now live on Bzead.`,
      metadata: { product_id: id, product_name: productName },
      email: {
        eventType: 'product_approved',
        recipientType: 'seller',
        data: { order_id: id, entity_name: productName },
      },
    }).catch((err: unknown) => console.error('[approveProduct] notify failed:', err));
  }

  return { success: true, error: null };
}

export async function rejectProduct(id: string, reason?: string) {
  clearQueryCache();
  const { data: product } = await supabase
    .from('products')
    .select('seller_id, name')
    .eq('id', id)
    .single();

  const { error } = await supabase
    .from('products')
    .update({ approval_status: 'rejected', is_active: false })
    .eq('id', id);
  if (error) return { success: false, error: error.message };

  const sellerId = (product as { seller_id?: string | null } | null)?.seller_id || '';
  const productName = (product as { name?: string | null } | null)?.name || 'Your product';
  if (sellerId) {
    const safeReason = (reason || '').trim();
    notifyAccountEvent({
      type: 'product_rejected',
      recipientUserIds: [sellerId],
      title: 'Product Rejected',
      message: safeReason
        ? `"${productName}" was rejected: ${safeReason}`
        : `"${productName}" was rejected. Please review the listing and resubmit.`,
      metadata: { product_id: id, product_name: productName, reason: safeReason },
      email: {
        eventType: 'product_rejected',
        recipientType: 'seller',
        data: { order_id: id, entity_name: productName, reason: safeReason },
      },
    }).catch((err: unknown) => console.error('[rejectProduct] notify failed:', err));
  }

  return { success: true, error: null };
}

export async function toggleProductStatus(id: string, sellerId?: string) {
  clearQueryCache();
  let fetchQuery = supabase.from('products').select('is_active, seller_id').eq('id', id);
  if (sellerId) fetchQuery = fetchQuery.eq('seller_id', sellerId);
  const { data } = await fetchQuery.single();
  if (!data) return { success: false, error: 'Product not found' };

  let updateQuery = supabase
    .from('products')
    .update({ is_active: !data.is_active })
    .eq('id', id);
  if (sellerId) updateQuery = updateQuery.eq('seller_id', sellerId);
  const { error } = await updateQuery;
  return { success: !error, error: error?.message || null };
}

export async function deleteProduct(id: string, sellerId?: string) {
  clearQueryCache();
  let query = supabase.from('products').delete().eq('id', id);
  if (sellerId) query = query.eq('seller_id', sellerId);
  const { error } = await query;
  return { success: !error, error: error?.message || null };
}

export async function updateProduct(
  id: string,
  updates: {
    seller_id?: string;
    name?: string;
    category?: string;
    mrp?: number;
    price?: number;
    default_selling_price?: number;
    stock?: number;
    brand?: string;
    ingredients?: string;
    directions?: string;
    important_note?: string;
    image_url?: string;
    images?: string[];
    videos?: string[];
    shipping_type?: string;
    courier_partner?: string;
    package_weight?: number;
    package_weight_unit_id?: string;
    package_length?: number;
    package_length_unit_id?: string;
    package_width?: number;
    package_width_unit_id?: string;
    package_height?: number;
    package_height_unit_id?: string;
    packing_type_id?: string;
    manufacturer_name?: string;
    manufacturer_country?: string;
    manufacturer_address?: string;
    highlights?: string[];
    specifications?: Record<string, string>;
    approval_status?: string;
    is_active?: boolean;
    short_description?: string;
    description?: string;
  }
) {
  clearQueryCache();
  // Sanitise blob: URLs that may have leaked from browser previews
  const sanitised = { ...updates };
  if (sanitised.images) sanitised.images = sanitised.images.filter(u => !isBlobUrl(u));
  if (sanitised.videos) sanitised.videos = sanitised.videos.filter(u => !isBlobUrl(u));
  if (isBlobUrl(sanitised.image_url)) {
    sanitised.image_url = sanitised.images?.[0] || '';
  }

  if (typeof sanitised.price === 'number' && Number.isFinite(sanitised.price)) {
    sanitised.default_selling_price = sanitised.price;
  }

  // If seller_id is provided in updates, use it as a security filter then strip from payload
  const securitySellerId = sanitised.seller_id;
  delete sanitised.seller_id;

  const runUpdate = () => {
    let query = supabase
      .from('products')
      .update(sanitised)
      .eq('id', id);
    if (securitySellerId) query = query.eq('seller_id', securitySellerId);
    return query
      .select('id, name, category, mrp, price, stock, brand, image_url, images, videos, updated_at')
      .single();
  };
  const { data, error } = await writeWithAuthRetry(runUpdate);

  if (error && isRlsAuthError(error.message)) {
    return { data: null, success: false, error: await handleRlsAuthFailure() };
  }

  return { data, success: !error, error: error?.message || null };
}

/**
 * Replace all offer rules for a product.
 * Deletes existing rules and inserts new ones.
 * When sellerId is provided, verifies product ownership first.
 */
export async function updateProductOfferRules(
  productId: string,
  offerRules: Record<string, unknown>[],
  sellerId?: string
) {
  clearQueryCache();
  // Verify ownership if sellerId provided
  if (sellerId) {
    const { data: product } = await supabase.from('products').select('id').eq('id', productId).eq('seller_id', sellerId).maybeSingle();
    if (!product) return { success: false, error: 'Product not found or access denied.' };
  }

  // Delete existing offer rules
  await supabase.from('offer_rules').delete().eq('product_id', productId);

  // Insert new ones if any
  if (offerRules.length > 0) {
    const { error } = await supabase.from('offer_rules').insert(
      offerRules.map(or => ({
        product_id: productId,
        offer_type: (or.type || or.offer_type || '') as string,
        buy_quantity: or.buyQuantity != null ? Number(or.buyQuantity) : null,
        get_quantity: or.getQuantity != null ? Number(or.getQuantity) : null,
        special_day_name: (or.specialDayName || or.special_day_name || or.specialDay || null) as string | null,
        discount_percent: or.discountPercent != null ? Number(or.discountPercent) : null,
        start_time: (or.startTime || or.start_time || null) as string | null,
        end_time: (or.endTime || or.end_time || null) as string | null,
        bundle_min_qty: or.bundleMinQty != null ? Number(or.bundleMinQty) : null,
        bundle_discount: or.bundleDiscount != null ? Number(or.bundleDiscount) : null,
        is_active: Boolean(or.isActive ?? or.is_active ?? or.active ?? true),
      }))
    );
    if (error) return { success: false, error: error.message };
  }

  return { success: true, error: null };
}

// ---------- REVIEWS ----------

export async function submitReview(review: {
  product_id: string;
  user_id: string;
  rating: number;
  heading: string;
  comment: string;
}) {
  clearQueryCache();
  const { data, error } = await supabase.from('reviews').insert(review).select().single();
  if (!error && data) {
    // Recalculate product rating
    const { data: allReviews } = await supabase
      .from('reviews')
      .select('rating')
      .eq('product_id', review.product_id);
    if (allReviews && allReviews.length > 0) {
      const avg = allReviews.reduce((s, r) => s + r.rating, 0) / allReviews.length;
      await supabase
        .from('products')
        .update({ rating: Math.round(avg * 10) / 10, review_count: allReviews.length })
        .eq('id', review.product_id);
    }
  }
  return { data, error: error?.message || null };
}

// ---------- UPLOAD ----------

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50 MB

export async function uploadProductImage(file: File, sellerId: string): Promise<string> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Invalid image type. Allowed: JPEG, PNG, WebP, GIF');
  }
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max: 10MB`);
  }
  const ext = file.name.split('.').pop();
  const path = `${sellerId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from('product-images')
    .upload(path, file, { contentType: file.type });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from('product-images').getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadProductVideo(file: File, sellerId: string): Promise<string> {
  if (!ALLOWED_VIDEO_TYPES.has(file.type)) {
    throw new Error('Invalid video type. Allowed: MP4, WebM, QuickTime');
  }
  if (file.size > MAX_VIDEO_SIZE) {
    throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max: 50MB`);
  }
  const ext = file.name.split('.').pop();
  const path = `${sellerId}/videos/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from('product-images')
    .upload(path, file, { contentType: file.type });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from('product-images').getPublicUrl(path);
  return data.publicUrl;
}

// ---------- SECTION DISPLAY RULES ----------

export interface SectionDisplayRule {
  min_products: number;
  max_products: number;
  display_rows: number;
}

export async function fetchSectionDisplayRules(): Promise<SectionDisplayRule[]> {
  const { data, error } = await supabase
    .from('section_display_rules')
    .select('min_products, max_products, display_rows')
    .order('min_products');
  if (error) return [];
  return (data || []) as SectionDisplayRule[];
}

export function getDisplayRowsForCount(rules: SectionDisplayRule[], count: number): number {
  for (const rule of rules) {
    if (count >= rule.min_products && count <= rule.max_products) {
      return rule.display_rows;
    }
  }
  return 2; // fallback
}

// ---------- PRODUCT CONDITION DETAILS ----------

export async function saveConditionDetails(productId: string, details: Record<string, unknown>) {
  clearQueryCache();
  const payload = {
    product_id: productId,
    usage_duration: details.usage_duration as string,
    working_condition: details.working_condition as string,
    working_condition_notes: (details.working_condition_notes || '') as string,
    original_packaging: Boolean(details.original_packaging),
    original_invoice: Boolean(details.original_invoice),
    accessories_included: (details.accessories_included || '') as string,
    ownership_type: details.ownership_type as string,
    has_scratches: Boolean(details.has_scratches),
    scratch_description: (details.scratch_description || '') as string,
    scratch_images: (details.scratch_images || []) as string[],
    refurbished_by: (details.refurbished_by || null) as string | null,
    repair_details: (details.repair_details || '') as string,
  };

  const { data, error } = await supabase
    .from('product_condition_details')
    .upsert(payload, { onConflict: 'product_id' })
    .select()
    .single();
  return { data, error: error?.message || null };
}

export async function fetchConditionDetails(productId: string) {
  const { data, error } = await supabase
    .from('product_condition_details')
    .select('*')
    .eq('product_id', productId)
    .maybeSingle();
  return { data, error: error?.message || null };
}

// ---------- PRODUCT RETURN POLICIES ----------

export async function saveReturnPolicy(productId: string, policy: Record<string, unknown>) {
  clearQueryCache();
  const payload = {
    product_id: productId,
    accepts_returns: Boolean(policy.accepts_returns),
    return_window: (policy.return_window || null) as string | null,
    accepted_return_reasons: (policy.accepted_return_reasons || []) as string[],
    return_shipping_by: (policy.return_shipping_by || null) as string | null,
    refund_type: (policy.refund_type || null) as string | null,
    proof_requirement: (policy.proof_requirement || null) as string | null,
    return_condition_agreed: Boolean(policy.return_condition_agreed),
    seller_responsibility_agreed: Boolean(policy.seller_responsibility_agreed),
  };

  const { data, error } = await supabase
    .from('product_return_policies')
    .upsert(payload, { onConflict: 'product_id' })
    .select()
    .single();
  return { data, error: error?.message || null };
}

export async function fetchReturnPolicy(productId: string) {
  const { data, error } = await supabase
    .from('product_return_policies')
    .select('*')
    .eq('product_id', productId)
    .maybeSingle();
  return { data, error: error?.message || null };
}
