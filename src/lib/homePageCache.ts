import type { Product } from '../types';

export interface HomePageSections {
  featured: Product[];
  deals: Product[];
  trending: Product[];
  hasSponsored: boolean;
}

export interface HomePageBanner {
  id: string;
  src: string;
  alt: string;
  link: string;
  adSlot: number;
}

export interface HomeHeroBanner {
  id: string;
  image: string;
  alt: string;
  link: string;
}

export interface HomePagePrices {
  productIds: string[];
  sellingPrices: Record<string, number>;
  mrps: Record<string, number>;
  priceCachedAtByProductId?: Record<string, number>;
}

export interface CacheEntry<T> {
  value: T;
  cachedAt: number;
}

export const HOME_CONTENT_CACHE_TTL_MS = 5 * 60 * 1000;
export const HOME_PRICE_CACHE_TTL_MS = 2 * 60 * 1000;

const MAX_STALE_CACHE_AGE_MS = 60 * 60 * 1000;
const HOME_PRICE_CACHE_MAX_PRODUCTS = 500;
const MARKET_KEY = import.meta.env.VITE_MARKET || 'GLOBAL';
const SECTIONS_CACHE_KEY = `beauzead_home_sections_v1:${MARKET_KEY}`;
const BANNERS_CACHE_KEY = `beauzead_home_banners_v1:${MARKET_KEY}`;
const HERO_BANNERS_CACHE_KEY = `beauzead_home_hero_banners_v1:${MARKET_KEY}`;

function readCache<T>(key: string): CacheEntry<T> | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed
      || typeof parsed !== 'object'
      || !('cachedAt' in parsed)
      || !('value' in parsed)
      || !Number.isFinite(parsed.cachedAt)
      || Date.now() - Number(parsed.cachedAt) > MAX_STALE_CACHE_AGE_MS
    ) {
      return null;
    }

    return parsed as CacheEntry<T>;
  } catch (error) {
    console.warn('[home-cache] Unable to read cached home data:', error);
    return null;
  }
}

function writeCache<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(key, JSON.stringify({ value, cachedAt: Date.now() }));
  } catch (error) {
    console.warn('[home-cache] Unable to save home data cache:', error);
  }
}

export function readHomeSectionsCache(): CacheEntry<HomePageSections> | null {
  const cached = readCache<HomePageSections>(SECTIONS_CACHE_KEY);
  if (
    !cached
    || !cached.value
    || typeof cached.value !== 'object'
    || !Array.isArray(cached.value.featured)
    || !Array.isArray(cached.value.deals)
    || !Array.isArray(cached.value.trending)
    || typeof cached.value.hasSponsored !== 'boolean'
  ) {
    return null;
  }
  return cached;
}

export function writeHomeSectionsCache(value: HomePageSections): void {
  writeCache(SECTIONS_CACHE_KEY, value);
}

export function readHomeBannersCache(): CacheEntry<HomePageBanner[]> | null {
  const cached = readCache<HomePageBanner[]>(BANNERS_CACHE_KEY);
  return cached && Array.isArray(cached.value) ? cached : null;
}

export function writeHomeBannersCache(value: HomePageBanner[]): void {
  writeCache(BANNERS_CACHE_KEY, value);
}

export function readHomeHeroBannersCache(): CacheEntry<HomeHeroBanner[]> | null {
  const cached = readCache<HomeHeroBanner[]>(HERO_BANNERS_CACHE_KEY);
  if (!cached || !Array.isArray(cached.value) || !cached.value.every((banner) =>
    banner && typeof banner.id === 'string' && typeof banner.image === 'string'
    && typeof banner.alt === 'string' && typeof banner.link === 'string'
  )) return null;
  return cached;
}

export function writeHomeHeroBannersCache(value: HomeHeroBanner[]): void {
  writeCache(HERO_BANNERS_CACHE_KEY, value);
}

const priceCacheKey = (country: string): string =>
  `beauzead_home_prices_v1:${MARKET_KEY}:${country.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')}`;

function normalizeProductIds(productIds: string[]): string[] {
  return Array.from(new Set(productIds.filter(Boolean))).sort();
}

export function readHomePricesCache(
  country: string,
  productIds: string[],
): CacheEntry<HomePagePrices> | null {
  const cached = readCache<HomePagePrices>(priceCacheKey(country));
  if (
    !cached
    || !cached.value
    || !Array.isArray(cached.value.productIds)
    || !cached.value.sellingPrices
    || typeof cached.value.sellingPrices !== 'object'
    || !cached.value.mrps
    || typeof cached.value.mrps !== 'object'
  ) return null;

  const requestedIds = normalizeProductIds(productIds);
  const cachedIds = normalizeProductIds(cached.value.productIds);
  const cachedPriceIds = requestedIds.filter((id) => {
    const price = Number(cached.value.sellingPrices[id]);
    const cachedAt = Number(cached.value.priceCachedAtByProductId?.[id] ?? cached.cachedAt);
    return cachedIds.includes(id)
      && Number.isFinite(price)
      && price > 0
      && Number.isFinite(cachedAt)
      && Date.now() - cachedAt <= MAX_STALE_CACHE_AGE_MS;
  });
  if (cachedPriceIds.length === 0) return null;

  const sellingPrices: Record<string, number> = {};
  const mrps: Record<string, number> = {};
  const priceCachedAtByProductId: Record<string, number> = {};
  for (const id of cachedPriceIds) {
    sellingPrices[id] = Number(cached.value.sellingPrices[id]);
    const mrp = Number(cached.value.mrps[id]);
    if (Number.isFinite(mrp) && mrp > 0) mrps[id] = mrp;
    priceCachedAtByProductId[id] = Number(
      cached.value.priceCachedAtByProductId?.[id] ?? cached.cachedAt,
    );
  }

  return {
    cachedAt: Math.min(...Object.values(priceCachedAtByProductId)),
    value: {
      productIds: cachedPriceIds,
      sellingPrices,
      mrps,
      priceCachedAtByProductId,
    },
  };
}

export function writeHomePricesCache(country: string, value: HomePagePrices): void {
  const key = priceCacheKey(country);
  const now = Date.now();
  let mergedPrices: HomePagePrices = {
    productIds: [],
    sellingPrices: {},
    mrps: {},
    priceCachedAtByProductId: {},
  };

  const existing = readCache<HomePagePrices>(key);
  if (
    existing?.value
    && Array.isArray(existing.value.productIds)
    && existing.value.sellingPrices
    && existing.value.mrps
  ) {
    const existingIds = normalizeProductIds(existing.value.productIds);
    mergedPrices = {
      productIds: existingIds,
      sellingPrices: { ...existing.value.sellingPrices },
      mrps: { ...existing.value.mrps },
      priceCachedAtByProductId: Object.fromEntries(existingIds.map((id) => [
        id,
        Number(existing.value.priceCachedAtByProductId?.[id] ?? existing.cachedAt),
      ])),
    };
  }

  for (const id of normalizeProductIds(value.productIds)) {
    const price = Number(value.sellingPrices[id]);
    if (!Number.isFinite(price) || price <= 0) continue;
    mergedPrices.sellingPrices[id] = price;
    const mrp = Number(value.mrps[id]);
    if (Number.isFinite(mrp) && mrp > 0) mergedPrices.mrps[id] = mrp;
    else delete mergedPrices.mrps[id];
    mergedPrices.priceCachedAtByProductId![id] = now;
  }

  const retainedIds = normalizeProductIds(mergedPrices.productIds.concat(
    Object.keys(mergedPrices.priceCachedAtByProductId || {}),
  )).filter((id) => {
    const cachedAt = Number(mergedPrices.priceCachedAtByProductId?.[id]);
    return Number.isFinite(cachedAt) && now - cachedAt <= MAX_STALE_CACHE_AGE_MS;
  }).sort((left, right) =>
    Number(mergedPrices.priceCachedAtByProductId?.[right])
      - Number(mergedPrices.priceCachedAtByProductId?.[left])
  ).slice(0, HOME_PRICE_CACHE_MAX_PRODUCTS);

  const retainedSet = new Set(retainedIds);
  writeCache(key, {
    productIds: retainedIds,
    sellingPrices: Object.fromEntries(
      Object.entries(mergedPrices.sellingPrices).filter(([id]) => retainedSet.has(id)),
    ),
    mrps: Object.fromEntries(
      Object.entries(mergedPrices.mrps).filter(([id]) => retainedSet.has(id)),
    ),
    priceCachedAtByProductId: Object.fromEntries(
      Object.entries(mergedPrices.priceCachedAtByProductId || {}).filter(([id]) => retainedSet.has(id)),
    ),
  });
}

export function isCacheFresh<T>(entry: CacheEntry<T>, ttlMs: number): boolean {
  return Date.now() - entry.cachedAt < ttlMs;
}
