import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { StorefrontHeader } from '../components/layout/StorefrontHeader';
import { MegaMenu } from '../components/layout/MegaMenu';
import { HeroCarousel } from '../components/layout/HeroCarousel';
import { Footer } from '../components/layout/Footer';
import { WelcomeBackBar } from '../components/layout/WelcomeBackBar';
import { Categories } from '../components/layout/Categories';
import { MobileNav } from '../components/layout/MobileNav';
import { VideoAdsBanner } from '../components/layout/VideoAdsBanner';
import { ProductCard } from '../components/products/ProductCard';
import type { HeaderDetectedLocation } from '../components/layout/Header';
import {
  fetchActiveHomepageSponsoredProductsPage,
  getActiveHomepageSponsoredProductCount,
} from '../lib/sponsoredProductsService';
import {
  HOME_CONTENT_CACHE_TTL_MS,
  HOME_PRICE_CACHE_TTL_MS,
  isCacheFresh,
  readHomeBannersCache,
  readHomePricesCache,
  writeHomeBannersCache,
  writeHomePricesCache,
  type HomePageBanner,
} from '../lib/homePageCache';
import { fetchPublicProductPrices } from '../lib/pricingService';
import { fetchHomepageProductsPage, type ProductSection } from '../lib/productService';

const HOMEPAGE_PAGE_SIZE = 20;
const HOMEPAGE_SECTIONS: Array<{ key: ProductSection; title: string }> = [
  { key: 'featured', title: 'Featured Products' },
  { key: 'hot-deals', title: 'Hot Deals' },
  { key: 'trending', title: 'Trending Now 📈' },
];

type HomepageSectionState = {
  products: Product[];
  sourceProducts: Product[];
  fetchedCount: number;
  totalCount: number;
  status: 'queued' | 'loading' | 'ready' | 'complete' | 'error';
  error: string | null;
};

const createInitialSectionState = (): Record<ProductSection, HomepageSectionState> => ({
  featured: { products: [], sourceProducts: [], fetchedCount: 0, totalCount: 0, status: 'queued', error: null },
  'hot-deals': { products: [], sourceProducts: [], fetchedCount: 0, totalCount: 0, status: 'queued', error: null },
  trending: { products: [], sourceProducts: [], fetchedCount: 0, totalCount: 0, status: 'queued', error: null },
});

import { useDestinationCountry } from '../hooks/useDestinationCountry';
import { supabase } from '../lib/supabase';
import type { Product } from '../types';

const AdBanner: React.FC<{ src: string; alt: string; link?: string }> = ({ src, alt, link }) => {
  const img = (
    <img
      src={src}
      alt={alt}
      className="w-full rounded-xl shadow-sm"
      style={{ maxHeight: '150px', objectFit: 'cover' }}
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
  return link ? <a href={link}>{img}</a> : img;
};

/** Auto-rotating ad banner carousel — rotates every 15s if more than one banner */
const AdBannerCarousel: React.FC<{ banners: { id: string; src: string; alt: string; link?: string }[] }> = ({ banners }) => {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => setCurrent((p) => (p + 1) % banners.length), 15000);
    return () => clearInterval(timer);
  }, [banners.length]);

  if (banners.length === 0) return null;

  return (
    <div className="w-full my-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative overflow-hidden rounded-xl">
        <div
          className="flex transition-transform duration-700 ease-in-out"
          style={{ transform: `translateX(-${current * 100}%)` }}
        >
          {banners.map((b) => (
            <div key={b.id} className="w-full flex-shrink-0">
              <AdBanner src={b.src} alt={b.alt} link={b.link} />
            </div>
          ))}
        </div>
        {banners.length > 1 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {banners.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`w-1.5 h-1.5 rounded-full transition-all ${i === current ? 'bg-amber-500 w-4' : 'bg-gray-300'}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const ProductSectionRow: React.FC<{
  title: string;
  products: Product[];
  seeMoreLink: string;
  publicPriceMap: Record<string, number>;
  publicMrpMap: Record<string, number>;
  publicPriceLoading?: boolean;
  loading?: boolean;
  isSponsored?: boolean;
  queued?: boolean;
  queuedAfter?: string;
  hasMore?: boolean;
  error?: string | null;
  onLoadMore?: () => void;
}> = ({
  title,
  products,
  seeMoreLink,
  publicPriceMap,
  publicMrpMap,
  publicPriceLoading = false,
  loading,
  isSponsored = false,
  queued = false,
  queuedAfter,
  hasMore = false,
  error,
  onLoadMore,
}) => {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || loading || error || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onLoadMore?.();
    }, { rootMargin: '600px 0px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, error, onLoadMore]);

  return (
  <div className="py-6">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl md:text-2xl font-bold text-gray-900">{title}</h2>
        <div className="flex items-center gap-2">
          {isSponsored && (
            <span className="bg-red-600 text-white text-[9px] leading-none font-semibold uppercase tracking-wide px-1.5 py-1 rounded">
              Sponsored
            </span>
          )}
          <Link
            to={seeMoreLink}
            className="flex items-center space-x-2 text-amber-600 hover:text-amber-700 transition-colors"
          >
            <span className="text-sm font-medium">See More</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-gray-100 rounded-xl animate-pulse aspect-[4/5]" />
          ))}
        </div>
      ) : queued ? (
        <p className="text-gray-400 text-center py-8">
          Waiting for {queuedAfter} to finish loading.
        </p>
      ) : products.length === 0 && hasMore ? (
        <p className="text-gray-400 text-center py-8">Keep scrolling to find products in this section.</p>
      ) : products.length === 0 && !loading && !error ? (
        <p className="text-gray-400 text-center py-8">No products yet</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              publicUnitPrice={publicPriceMap[product.id]}
              markupMrp={publicMrpMap[product.id]}
              priceLoading={publicPriceLoading}
            />
          ))}
        </div>
      )}
      {!queued && hasMore && <div ref={sentinelRef} aria-hidden="true" className="h-px" />}
      {!queued && error && (
        <div className="py-4 text-center">
          <p role="alert" className="mb-2 text-sm text-red-600">{error}</p>
          <button type="button" onClick={onLoadMore} className="text-sm font-medium text-amber-700 hover:text-amber-800">
            Try loading again
          </button>
        </div>
      )}
      {!queued && loading && products.length > 0 && (
        <p role="status" className="py-3 text-center text-sm text-gray-500">Loading more products…</p>
      )}
      {!queued && hasMore && !loading && !error && (
        <button
          type="button"
          onClick={onLoadMore}
          className="mx-auto mt-3 block text-sm font-medium text-amber-700 hover:text-amber-800"
          aria-label={`Load next ${title} batch`}
        >
          Load more
        </button>
      )}
    </div>
  </div>
  );
};

export const BzeadHomePage: React.FC = () => {
  const { user, currentAuthUser } = useAuth();
  const isLoggedIn = !!user;

  const [cachedBanners] = useState(readHomeBannersCache);
  const [sections, setSections] = useState(createInitialSectionState);
  const sectionsRef = useRef(sections);
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [hasSponsored, setHasSponsored] = useState(false);
  const sponsoredModeRef = useRef<boolean | null>(null);
  const requestInFlightRef = useRef(new Set<ProductSection>());
  const featured = sections.featured.products;
  const deals = sections['hot-deals'].products;
  const trending = sections.trending.products;
  const [publicPriceMap, setPublicPriceMap] = useState<Record<string, number>>({});
  const [publicMrpMap, setPublicMrpMap] = useState<Record<string, number>>({});
  const [publicPriceLoading, setPublicPriceLoading] = useState(false);
  const [adBanners, setAdBanners] = useState<HomePageBanner[]>(() => cachedBanners?.value || []);
  const priceRequestRef = React.useRef(0);
  const [detectedCountry, setDetectedCountry] = useState(() => {
    const cached = localStorage.getItem('beauzead_detected_country');
    return cached || '';
  });

  const handleLocationDetected = (location: HeaderDetectedLocation) => {
    setDetectedCountry(location.country || '');
  };

  const selectedCountry = useDestinationCountry({
    userId: user?.id || currentAuthUser?.userId || null,
    userCountry: user?.country || '',
  }) || detectedCountry;

  const adSlot1 = adBanners.filter((banner) => banner.adSlot === 1);
  const adSlot2 = adBanners.filter((banner) => banner.adSlot === 2);
  const adSlot3 = adBanners.filter((banner) => banner.adSlot === 3);

  const loadNextPage = useCallback(async (section: ProductSection) => {
    if (requestInFlightRef.current.has(section)) return;
    const current = sectionsRef.current[section];
    if (current.status === 'complete' || current.status === 'loading') return;
    const offset = current.fetchedCount;
    requestInFlightRef.current.add(section);

    const setSection = (nextSection: HomepageSectionState) => {
      const next = { ...sectionsRef.current, [section]: nextSection };
      sectionsRef.current = next;
      setSections(next);
    };
    setSection({ ...current, status: 'loading', error: null });

    try {
      let isSponsored = sponsoredModeRef.current;
      if (isSponsored === null) {
        const result = await getActiveHomepageSponsoredProductCount();
        if (result.error) throw new Error(result.error);
        isSponsored = result.count > 0;
        sponsoredModeRef.current = isSponsored;
        setHasSponsored(isSponsored);
      }

      const result = isSponsored
        ? await fetchActiveHomepageSponsoredProductsPage(section, HOMEPAGE_PAGE_SIZE, offset)
        : await fetchHomepageProductsPage(section, HOMEPAGE_PAGE_SIZE, offset);
      if (result.error) throw new Error(result.error);
      if (result.count > offset && result.data.length === 0) {
        throw new Error(`The ${section} page returned no products before its reported end.`);
      }

      const productsById = new Map(current.sourceProducts.map((product) => [product.id, product]));
      (result.data || []).forEach((product) => productsById.set(product.id, product));
      const sourceProducts = Array.from(productsById.values());
      const products = !isSponsored && section === 'hot-deals'
        ? sourceProducts
          .filter((product) => Number(product.mrp) > Number(product.price))
          .sort((left, right) => {
            const leftDiscount = (Number(left.mrp) - left.price) / Number(left.mrp);
            const rightDiscount = (Number(right.mrp) - right.price) / Number(right.mrp);
            return rightDiscount - leftDiscount
              || right.created_at.localeCompare(left.created_at)
              || left.id.localeCompare(right.id);
          })
        : sourceProducts;
      const totalCount = result.count;
      const complete = offset + (result.data || []).length >= totalCount;
      setSection({
        products,
        sourceProducts,
        fetchedCount: offset + result.data.length,
        totalCount,
        status: complete ? 'complete' : 'ready',
        error: null,
      });

      if (complete) {
        const currentIndex = HOMEPAGE_SECTIONS.findIndex((entry) => entry.key === section);
        if (currentIndex === activeSectionIndex && currentIndex + 1 < HOMEPAGE_SECTIONS.length) {
          setActiveSectionIndex(currentIndex + 1);
        }
      }
    } catch (error) {
      console.error(`Failed to load homepage ${section} products:`, error);
      setSection({ ...current, status: 'error', error: 'Unable to load products. Please try again.' });
    } finally {
      requestInFlightRef.current.delete(section);
    }
  }, [activeSectionIndex]);

  useEffect(() => {
    const activeSection = HOMEPAGE_SECTIONS[activeSectionIndex]?.key;
    if (activeSection && sections[activeSection].status === 'queued') {
      void loadNextPage(activeSection);
    }
  }, [activeSectionIndex, loadNextPage, sections]);

  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  const loadFeatured = useCallback(() => void loadNextPage('featured'), [loadNextPage]);
  const loadDeals = useCallback(() => void loadNextPage('hot-deals'), [loadNextPage]);
  const loadTrending = useCallback(() => void loadNextPage('trending'), [loadNextPage]);

  useEffect(() => {
    let cancelled = false;
    let lastRefreshAt = cachedBanners?.cachedAt || 0;
    let prefetchTimerId: number | null = null;

    const refreshBanners = async () => {
      try {
        const { data, error } = await supabase
          .from('banners')
          .select('id, title, image_url, link, ad_slot')
          .eq('is_active', true)
          .eq('banner_type', 'ad')
          .order('position', { ascending: true });

        if (error) {
          console.error('Failed to refresh home page banners:', error);
          return;
        }

        const nextBanners = (data || []).map((banner) => ({
          id: banner.id,
          src: banner.image_url,
          alt: banner.title,
          link: banner.link || '',
          adSlot: Number(banner.ad_slot),
        }));

        if (cancelled) return;
        setAdBanners(nextBanners);
        writeHomeBannersCache(nextBanners);
        lastRefreshAt = Date.now();
      } catch (error) {
        console.error('Failed to refresh home page banners:', error);
      }
    };

    if (!cachedBanners || !isCacheFresh(cachedBanners, HOME_CONTENT_CACHE_TTL_MS)) {
      void refreshBanners();
    } else {
      // Background-refresh banners after cached render to keep ad inventory current.
      prefetchTimerId = window.setTimeout(() => {
        if (!cancelled) void refreshBanners();
      }, 3000);
    }

    const timerId = window.setInterval(() => {
      if (Date.now() - lastRefreshAt >= HOME_CONTENT_CACHE_TTL_MS) {
        void refreshBanners();
      }
    }, HOME_CONTENT_CACHE_TTL_MS);

    return () => {
      cancelled = true;
      if (prefetchTimerId) window.clearTimeout(prefetchTimerId);
      window.clearInterval(timerId);
    };
  }, [cachedBanners]);

  useEffect(() => {
    const requestId = priceRequestRef.current + 1;
    priceRequestRef.current = requestId;
    let cancelled = false;

    const loadPublicPrices = async () => {
      if (!selectedCountry) {
        setPublicPriceMap({});
        setPublicMrpMap({});
        setPublicPriceLoading(true);
        return;
      }

      const productIds = Array.from(new Set([
        ...featured.map((product) => product.id),
        ...deals.map((product) => product.id),
        ...trending.map((product) => product.id),
      ]));

      if (productIds.length === 0) {
        setPublicPriceMap({});
        setPublicMrpMap({});
        setPublicPriceLoading(false);
        return;
      }

      const cachedPrices = readHomePricesCache(selectedCountry, productIds);
      const cachedIds = new Set(cachedPrices?.value.productIds || []);
      const missingCachedPrices = productIds.filter((id) => !cachedIds.has(id));
      const cachedPricesFresh = Boolean(
        cachedPrices
        && missingCachedPrices.length === 0
        && isCacheFresh(cachedPrices, HOME_PRICE_CACHE_TTL_MS),
      );
      if (cachedPrices) {
        setPublicPriceMap(cachedPrices.value.sellingPrices);
        setPublicMrpMap(cachedPrices.value.mrps);
        setPublicPriceLoading(missingCachedPrices.length > 0);
        if (cachedPricesFresh) return;
      } else {
        setPublicPriceMap({});
        setPublicMrpMap({});
        setPublicPriceLoading(true);
      }

      const productsToRefresh = cachedPrices && missingCachedPrices.length > 0 && isCacheFresh(cachedPrices, HOME_PRICE_CACHE_TTL_MS)
        ? missingCachedPrices
        : productIds;
      const { data, error } = await fetchPublicProductPrices(productsToRefresh, selectedCountry);
      if (cancelled || priceRequestRef.current !== requestId) return;
      if (error) {
        console.error('Failed to refresh home page prices:', error);
        setPublicPriceLoading(false);
        return;
      }

      const map: Record<string, number> = cachedPrices && productsToRefresh.length !== productIds.length
        ? { ...cachedPrices.value.sellingPrices }
        : {};
      const mrpMap: Record<string, number> = cachedPrices && productsToRefresh.length !== productIds.length
        ? { ...cachedPrices.value.mrps }
        : {};
      (data || []).forEach((item) => {
        map[item.productId] = item.publicUnitPrice;
        if (item.markupMrp > 0) mrpMap[item.productId] = item.markupMrp;
      });

      setPublicPriceMap(map);
      setPublicMrpMap(mrpMap);
      setPublicPriceLoading(false);
      writeHomePricesCache(selectedCountry, {
        productIds: Array.from(new Set([...(cachedPrices?.value.productIds || []), ...productIds])),
        sellingPrices: map,
        mrps: mrpMap,
      });
    };

    void loadPublicPrices();
    return () => {
      cancelled = true;
    };
  }, [featured, deals, trending, selectedCountry]);

  return (
    // overflow-x-clip (not -hidden) prevents this wrapper from becoming a scroll container,
    // which would otherwise demote the sticky <Header> inside it (sticky needs a non-scrolling ancestor).
    <div className="min-h-screen bg-white pb-16 md:pb-0 overflow-x-clip">
      <StorefrontHeader enableLocationAutoDetect onLocationDetected={handleLocationDetected} />

      {/* Categories Mega Menu */}
      <MegaMenu />

      {/* Hero Carousel */}
      <HeroCarousel />

      <WelcomeBackBar
        isLoggedIn={isLoggedIn}
        displayName={user?.full_name || user?.email?.split('@')[0] || 'User'}
      />

      {/* Category Shortcuts - properly aligned with other sections */}
      <div style={{ marginTop: '16px', marginBottom: '16px' }}>
        <Categories />
      </div>

      {/* Featured Products */}
      <ProductSectionRow
        title="Featured Products"
        products={featured}
        seeMoreLink="/products/featured"
        publicPriceMap={publicPriceMap}
        publicMrpMap={publicMrpMap}
        publicPriceLoading={publicPriceLoading}
        loading={sections.featured.status === 'loading'}
        isSponsored={hasSponsored}
        hasMore={sections.featured.status === 'ready'}
        error={sections.featured.error}
        onLoadMore={loadFeatured}
      />

      {/* Ad Banner Slot 1 */}
      <AdBannerCarousel banners={adSlot1} />

      {/* Hot Deals */}
      <ProductSectionRow
        title="Hot Deals 🔥"
        products={deals}
        seeMoreLink="/products/hot-deals"
        publicPriceMap={publicPriceMap}
        publicMrpMap={publicMrpMap}
        publicPriceLoading={publicPriceLoading}
        loading={sections['hot-deals'].status === 'loading'}
        isSponsored={hasSponsored}
        queued={sections['hot-deals'].status === 'queued'}
        queuedAfter="Featured Products"
        hasMore={sections['hot-deals'].status === 'ready'}
        error={sections['hot-deals'].error}
        onLoadMore={loadDeals}
      />

      {/* Ad Banner Slot 2 */}
      <AdBannerCarousel banners={adSlot2} />

      {/* Trending Deals */}
      <ProductSectionRow
        title="Trending Now 📈"
        products={trending}
        seeMoreLink="/products/section/trending"
        publicPriceMap={publicPriceMap}
        publicMrpMap={publicMrpMap}
        publicPriceLoading={publicPriceLoading}
        loading={sections.trending.status === 'loading'}
        isSponsored={hasSponsored}
        queued={sections.trending.status === 'queued'}
        queuedAfter="Hot Deals"
        hasMore={sections.trending.status === 'ready'}
        error={sections.trending.error}
        onLoadMore={loadTrending}
      />

      {/* Ad Banner Slot 3 */}
      <AdBannerCarousel banners={adSlot3} />

      {/* Become a Seller CTA - Only show for guests and regular users */}
      {(!isLoggedIn || user?.role === 'user') && (
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 py-16 my-8 rounded-none">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold text-black mb-4">
            Start Selling on BZEAD
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Join thousands of successful sellers and grow your business globally
          </p>
          <a
            href="https://www.bzead.com/seller"
            className="inline-flex items-center bg-blue-600 hover:bg-blue-700 text-white text-lg px-5 py-3 rounded-lg font-semibold transition-colors"
          >
            Get Started Now
          </a>
        </div>
      </div>
      )}

      {/* Video Ads — above footer */}
      <VideoAdsBanner />

      {/* Footer */}
      <Footer />

      {/* Mobile Navigation */}
      <MobileNav />
    </div>
  );
};
