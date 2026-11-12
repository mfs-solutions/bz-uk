import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HOME_CONTENT_CACHE_TTL_MS,
  HOME_PRICE_CACHE_TTL_MS,
  isCacheFresh,
  readHomePricesCache,
  readHomeHeroBannersCache,
  readHomeSectionsCache,
  writeHomePricesCache,
  writeHomeHeroBannersCache,
  writeHomeSectionsCache,
} from '../lib/homePageCache';

describe('home page cache', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('stores and restores public home sections', () => {
    const sections = {
      featured: [],
      deals: [],
      trending: [],
      hasSponsored: true,
    };

    writeHomeSectionsCache(sections);

    const cached = readHomeSectionsCache();
    expect(cached?.value).toEqual(sections);
    expect(cached && isCacheFresh(cached, HOME_CONTENT_CACHE_TTL_MS)).toBe(true);
  });

  it('stores and restores hero banner metadata', () => {
    const banners = [{ id: 'hero-1', image: 'https://example.com/banner.jpg', alt: 'Offer', link: '/offer' }];
    writeHomeHeroBannersCache(banners);
    expect(readHomeHeroBannersCache()?.value).toEqual(banners);
  });

  it('rejects invalid hero banner metadata', () => {
    writeHomeHeroBannersCache([{ id: 'hero-1', image: 'https://example.com/banner.jpg', alt: 'Offer', link: '/offer' }]);
    const key = Object.keys(localStorage).find((item) => item.startsWith('beauzead_home_hero_banners_v1:'));
    expect(key).toBeDefined();
    localStorage.setItem(key!, JSON.stringify({ cachedAt: Date.now(), value: [{ id: 'hero-1' }] }));
    expect(readHomeHeroBannersCache()).toBeNull();
  });

  it('reuses cached home prices per product only for the matching market country', () => {
    const prices = {
      productIds: ['product-b', 'product-a'],
      sellingPrices: { 'product-a': 100, 'product-b': 200 },
      mrps: { 'product-a': 150, 'product-b': 250 },
    };

    writeHomePricesCache('United Kingdom', prices);

    const cached = readHomePricesCache('United Kingdom', ['product-a', 'product-b']);
    expect(cached?.value).toMatchObject({ ...prices, productIds: ['product-a', 'product-b'] });
    expect(cached && isCacheFresh(cached, HOME_PRICE_CACHE_TTL_MS)).toBe(true);
    expect(readHomePricesCache('India', ['product-a', 'product-b'])).toBeNull();
    expect(readHomePricesCache('United Kingdom', ['product-a'])?.value).toMatchObject({
      productIds: ['product-a'],
      sellingPrices: { 'product-a': 100 },
      mrps: { 'product-a': 150 },
    });
    expect(readHomePricesCache('United Kingdom', ['product-a', 'product-c'])?.value.productIds).toEqual(['product-a']);
  });

  it('merges newly fetched home prices without discarding cached product prices', () => {
    writeHomePricesCache('United Kingdom', {
      productIds: ['product-a'],
      sellingPrices: { 'product-a': 100 },
      mrps: { 'product-a': 150 },
    });
    writeHomePricesCache('United Kingdom', {
      productIds: ['product-b'],
      sellingPrices: { 'product-b': 200 },
      mrps: { 'product-b': 250 },
    });

    const cached = readHomePricesCache('United Kingdom', ['product-a', 'product-b']);
    expect(cached?.value.sellingPrices).toEqual({ 'product-a': 100, 'product-b': 200 });
    expect(cached?.value.mrps).toEqual({ 'product-a': 150, 'product-b': 250 });
  });

  it('marks stale entries for background refresh', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T00:00:00Z'));
    writeHomeSectionsCache({
      featured: [],
      deals: [],
      trending: [],
      hasSponsored: false,
    });

    vi.advanceTimersByTime(HOME_CONTENT_CACHE_TTL_MS + 1);

    const cached = readHomeSectionsCache();
    expect(cached && isCacheFresh(cached, HOME_CONTENT_CACHE_TTL_MS)).toBe(false);
    expect(cached).not.toBeNull();
  });
});
