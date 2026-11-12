import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { StorefrontHeader } from '../components/layout/StorefrontHeader';
import { Footer } from '../components/layout/Footer';
import { MobileNav } from '../components/layout/MobileNav';
import { ProductCard } from '../components/products/ProductCard';
import {
  SlidersHorizontal, X, Star,
  Grid3X3, LayoutList, ChevronDown, AlertCircle
} from 'lucide-react';
import { ProductGridSkeleton } from '../components/common/Skeleton';
import { fetchCategoryContext, fetchCategoryMaxPrice, fetchProducts } from '../lib/productService';
import { fetchPublicProductPrices } from '../lib/pricingService';
import { useCurrency } from '../contexts/CurrencyContext';
import { useAuth } from '../contexts/AuthContext';
import { useDestinationCountry } from '../hooks/useDestinationCountry';

interface CategoryInfo {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  level: number;
}

interface FilterOptions {
  priceRange: [number, number];
  rating: number | null;
  inStock: boolean;
  selectedSubcategory: string | null;
  sortBy: 'featured' | 'price-low-high' | 'price-high-low' | 'rating' | 'newest';
}

const PAGE_SIZE = 25;

export const CategoryProducts: React.FC = () => {
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();
  const { formatPrice } = useCurrency();
  const { user, currentAuthUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<CategoryInfo | null>(null);
  const [subcategories, setSubcategories] = useState<CategoryInfo[]>([]);
  const [parentById, setParentById] = useState<Record<string, string | null>>({});
  const [products, setProducts] = useState<any[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [context, setContext] = useState<{ routeId: string; ids: string[]; names: Record<string, string> } | null>(null);
  const [dynamicPriceMax, setDynamicPriceMax] = useState(100000);
  const [priceRangeReady, setPriceRangeReady] = useState(false);
  const [priceFilter, setPriceFilter] = useState<{ min: number; max?: number }>({ min: 0 });
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  const requestGeneration = useRef(0);
  const nextOffset = useRef(0);
  const pageInFlight = useRef(false);
  const priceCache = useRef<{ key: string; prices: Record<string, number>; mrps: Record<string, number>; fetched: Set<string> }>({
    key: '', prices: {}, mrps: {}, fetched: new Set(),
  });
  const [publicPriceMap, setPublicPriceMap] = useState<Record<string, number>>({});
  const [publicMrpMap, setPublicMrpMap] = useState<Record<string, number>>({});
  const [publicPriceLoading, setPublicPriceLoading] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [gridView, setGridView] = useState<'grid' | 'list'>('grid');

  const [filters, setFilters] = useState<FilterOptions>({
    priceRange: [0, 100000],
    rating: null,
    inStock: false,
    selectedSubcategory: null,
    sortBy: 'featured',
  });

  const selectedCountry = useDestinationCountry({
    userId: user?.id || currentAuthUser?.userId || null,
    userCountry: user?.country || '',
  });

  useEffect(() => {
    if (!categoryId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setFetchError(null);
      setContext(null);
      setProducts([]);
      setPriceRangeReady(false);
      setPriceFilter({ min: 0 });
      setFilters(prev => ({ ...prev, priceRange: [0, 100000], selectedSubcategory: null }));

      try {
        const ctx = await fetchCategoryContext(categoryId);
        if (cancelled) return;

        if (ctx.category) {
          setCategory(ctx.category);
          setSubcategories(ctx.children);
          setParentById(ctx.parentById || {});
          setDynamicPriceMax(100000);
          setContext({ routeId: categoryId, ids: ctx.allCategoryIds, names: ctx.categoryNames || {} });

          const { maxPrice, error } = await fetchCategoryMaxPrice(ctx.allCategoryIds);
          if (cancelled) return;
          if (error) throw new Error(error);
          const ceiling = Math.ceil(maxPrice / 500) * 500 || 100000;
          setDynamicPriceMax(ceiling);
          setFilters(prev => ({ ...prev, priceRange: [0, ceiling] }));
          setPriceRangeReady(true);
        } else {
          setCategory(null);
          setContext(null);
          setParentById({});
          setProducts([]);
          setLoading(false);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Error loading category:', err);
        setFetchError('Failed to load products. Please try again.');
        setCategory(null);
        setContext(null);
        setParentById({});
        setProducts([]);
        setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [categoryId]);

  const loadPage = useCallback(async (generation: number, offset: number) => {
    if (!context || context.routeId !== categoryId || pageInFlight.current) return;
    pageInFlight.current = true;
    if (offset > 0) setLoadingMore(true);
    setPageError(null);
    try {
      const { data, error } = await fetchProducts({
        categoryIds: context.ids,
        subcategoryId: filters.selectedSubcategory || undefined,
        minPrice: priceFilter.min,
        maxPrice: priceFilter.max,
        minRating: filters.rating || undefined,
        inStock: filters.inStock,
        sortBy: filters.sortBy,
        stableOrder: true,
        approvalStatus: 'approved',
        isActive: true,
        limit: PAGE_SIZE,
        offset,
        resolveCategoryNames: false,
        includeCount: false,
      });
      if (generation !== requestGeneration.current) return;
      if (error) throw new Error(error);
      const enriched = data.map((p: any) => ({
        ...p,
        category_name: context.names[p.category] || '',
        sub_category_name: context.names[p.sub_category] || '',
        product_type_name: context.names[p.product_type] || '',
      }));
      setProducts(prev => offset === 0 ? enriched : [...prev, ...enriched]);
      nextOffset.current = offset + data.length;
      setHasMore(data.length === PAGE_SIZE);
    } catch (err) {
      if (generation !== requestGeneration.current) return;
      console.error('Error loading category products:', err);
      if (offset === 0) setFetchError('Failed to load products. Please try again.');
      else setPageError('Failed to load more products. Please try again.');
    } finally {
      if (generation === requestGeneration.current) {
        pageInFlight.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [categoryId, context, filters.inStock, filters.rating, filters.selectedSubcategory, filters.sortBy, priceFilter]);

  useEffect(() => {
    const generation = ++requestGeneration.current;
    pageInFlight.current = false;
    nextOffset.current = 0;
    setHasMore(false);
    setLoadingMore(false);
    setPageError(null);
    if (!context || context.routeId !== categoryId) return;
    setLoading(true);
    setFetchError(null);
    setProducts([]);
    void loadPage(generation, 0);
    const generationRef = requestGeneration;
    return () => { generationRef.current++; };
  }, [categoryId, context, loadPage]);

  const loadMore = useCallback(() => {
    if (hasMore && !loadingMore && !pageError) {
      void loadPage(requestGeneration.current, nextOffset.current);
    }
  }, [hasMore, loadingMore, pageError, loadPage]);

  useEffect(() => {
    if (!sentinel || !hasMore || loadingMore || pageError || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) loadMore();
    }, { rootMargin: '200px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel, hasMore, loadingMore, pageError, loadMore]);

  useEffect(() => {
    let cancelled = false;
    const loadPublicPrices = async () => {
      if (!selectedCountry) {
        setPublicPriceMap({});
        setPublicMrpMap({});
        setPublicPriceLoading(true);
        return;
      }

      if (products.length === 0) {
        setPublicPriceMap({});
        setPublicMrpMap({});
        setPublicPriceLoading(false);
        return;
      }

      const key = `${categoryId}:${selectedCountry}`;
      if (priceCache.current.key !== key) {
        priceCache.current = { key, prices: {}, mrps: {}, fetched: new Set() };
      }
      const cache = priceCache.current;
      const ids = products.map(p => p.id).filter(id => !cache.fetched.has(id));
      setPublicPriceMap({ ...cache.prices });
      setPublicMrpMap({ ...cache.mrps });
      if (ids.length === 0) {
        setPublicPriceLoading(false);
        return;
      }
      setPublicPriceLoading(true);
      const { data, error } = await fetchPublicProductPrices(
        ids,
        selectedCountry
      );
      if (cancelled) return;
      if (error) console.error('Failed to load category product prices:', error);

      (data || []).forEach((item) => {
        cache.prices[item.productId] = item.publicUnitPrice;
        if (item.markupMrp > 0) cache.mrps[item.productId] = item.markupMrp;
      });
      if (!error) ids.forEach(id => cache.fetched.add(id));
      setPublicPriceMap({ ...cache.prices });
      setPublicMrpMap({ ...cache.mrps });
      setPublicPriceLoading(false);
    };

    void loadPublicPrices();
    return () => { cancelled = true; };
  }, [categoryId, products, selectedCountry]);

  const filteredProducts = products;

  // Get unique brands from products for display
  const brands = useMemo(() => {
    const bSet = new Set<string>();
    products.forEach((p) => { if (p.brand) bSet.add(p.brand); });
    return Array.from(bSet).sort();
  }, [products]);

  const isNodeInsideSubtree = useCallback((nodeId: string | null | undefined, subtreeRootId: string) => {
    if (!nodeId) return false;

    let current: string | null | undefined = nodeId;
    const visited = new Set<string>();

    while (current) {
      if (current === subtreeRootId) return true;
      if (visited.has(current)) break;
      visited.add(current);
      current = parentById[current] || null;
    }

    return false;
  }, [parentById]);

  const belongsToSubcategorySection = useCallback((product: any, subcategoryId: string) => {
    return (
      isNodeInsideSubtree(product.category, subcategoryId) ||
      isNodeInsideSubtree(product.sub_category, subcategoryId) ||
      isNodeInsideSubtree(product.product_type, subcategoryId)
    );
  }, [isNodeInsideSubtree]);

  const subcategoryProductSections = useMemo(() => {
    return subcategories
      .map((subcategory) => ({
        subcategory,
        products: filteredProducts.filter((product) =>
          belongsToSubcategorySection(product, subcategory.id)
        ),
      }))
      .filter((section) => section.products.length > 0);
  }, [subcategories, filteredProducts, belongsToSubcategorySection]);

  const uncategorizedProducts = useMemo(() => {
    if (subcategories.length === 0) return filteredProducts;

    return filteredProducts.filter((product) => {
      return !subcategories.some((subcategory) =>
        belongsToSubcategorySection(product, subcategory.id)
      );
    });
  }, [filteredProducts, subcategories, belongsToSubcategorySection]);

  // --- Loading state ---
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col overflow-x-hidden">
        <StorefrontHeader />
        <main className="flex-grow w-full max-w-7xl mx-auto px-3 sm:px-4 py-6">
          <div className="h-5 w-48 rounded bg-gray-200 animate-pulse mb-5" />
          <ProductGridSkeleton count={8} />
        </main>
        <Footer />
        <MobileNav />
      </div>
    );
  }

  // --- Not found / error state ---
  if (fetchError || !category) {
    return (
      <div className="min-h-screen bg-white flex flex-col overflow-x-hidden">
        <StorefrontHeader />
        <main className="flex-grow max-w-7xl mx-auto px-4 py-16 w-full">
          <div className="text-center">
            {fetchError ? (
              <>
                <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                <h1 className="text-2xl font-bold text-gray-900 mb-4">Something went wrong</h1>
                <p className="text-gray-500 mb-6">{fetchError}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="bg-amber-500 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-amber-600 transition"
                >
                  Try Again
                </button>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-gray-900 mb-4">Category Not Found</h1>
                <p className="text-gray-500 mb-6">The category you're looking for doesn't exist or has been removed.</p>
                <button
                  onClick={() => navigate('/')}
                  className="bg-amber-500 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-amber-600 transition"
                >
                  Back to Home
                </button>
              </>
            )}
          </div>
        </main>
        <Footer />
        <MobileNav />
      </div>
    );
  }

  const handlePriceChange = (type: 'min' | 'max', value: number) => {
    const [min, max] = filters.priceRange;
    if (type === 'min') {
      const nextMin = Math.min(value, max);
      setFilters((prev) => ({ ...prev, priceRange: [nextMin, max] }));
      setPriceFilter({ min: nextMin, max: max < dynamicPriceMax ? max : undefined });
    } else {
      const nextMax = Math.max(value, min);
      setFilters((prev) => ({ ...prev, priceRange: [min, nextMax] }));
      setPriceFilter({ min, max: nextMax < dynamicPriceMax ? nextMax : undefined });
    }
  };

  const resetFilters = () => {
    setPriceFilter({ min: 0 });
    setFilters({
      priceRange: [0, dynamicPriceMax],
      rating: null,
      inStock: false,
      selectedSubcategory: null,
      sortBy: 'featured',
    });
  };

  const activeFilterCount = [
    filters.selectedSubcategory,
    filters.rating,
    filters.inStock,
    filters.priceRange[0] > 0 || filters.priceRange[1] < dynamicPriceMax,
  ].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-gray-50 pb-16 md:pb-0 overflow-x-hidden">
      <StorefrontHeader />

      <h1 className="sr-only">{category.name}</h1>

      {/* ── Subcategory Navigation (Amazon-style chips) ── */}
      {subcategories.length > 0 && (
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              <button
                onClick={() => setFilters(prev => ({ ...prev, selectedSubcategory: null }))}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium border transition ${
                  !filters.selectedSubcategory
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-gray-900'
                }`}
              >
                All
              </button>
              {subcategories.map((sub) => (
                <button
                  key={sub.id}
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      selectedSubcategory: prev.selectedSubcategory === sub.id ? null : sub.id,
                    }))
                  }
                  className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium border transition ${
                    filters.selectedSubcategory === sub.id
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-gray-900'
                  }`}
                >
                  {sub.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Sort Bar + Mobile Filter Toggle ── */}
      <div
        className="bg-white border-b border-gray-200 sticky z-[60]"
        style={{ top: 'var(--bz-header-offset)' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Mobile filter button */}
            <button
              onClick={() => setShowMobileFilters(true)}
              className="md:hidden flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              <SlidersHorizontal size={14} />
              Filters
              {activeFilterCount > 0 && (
                <span className="bg-amber-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 ml-1">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Sort dropdown */}
            <div className="relative">
              <select
                value={filters.sortBy}
                onChange={(e) => setFilters((prev) => ({ ...prev, sortBy: e.target.value as FilterOptions['sortBy'] }))}
                className="appearance-none bg-white border border-gray-300 text-sm text-gray-700 rounded-lg pl-3 pr-8 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 cursor-pointer"
              >
                <option value="featured">Sort: Featured</option>
                <option value="price-low-high">Price: Low to High</option>
                <option value="price-high-low">Price: High to Low</option>
                <option value="rating">Avg. Customer Review</option>
                <option value="newest">Newest Arrivals</option>
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Grid toggle */}
          <div className="hidden sm:flex items-center gap-1 border border-gray-300 rounded-lg overflow-hidden">
            <button
              onClick={() => setGridView('grid')}
              className={`p-1.5 transition ${gridView === 'grid' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <Grid3X3 size={16} />
            </button>
            <button
              onClick={() => setGridView('list')}
              className={`p-1.5 transition ${gridView === 'list' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <LayoutList size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Content: Sidebar + Products ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-6">

          {/* ── Desktop Sidebar Filters ── */}
          <aside className="hidden md:block w-56 shrink-0">
            <div
              className="sticky space-y-5"
              style={{ top: 'calc(var(--bz-header-offset) + 3.5rem)' }}
            >

              {/* Subcategory filter (left rail) */}
              {subcategories.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-2">Department</h3>
                  <ul className="space-y-1">
                    <li>
                      <button
                        onClick={() => setFilters(prev => ({ ...prev, selectedSubcategory: null }))}
                        className={`text-sm w-full text-left py-0.5 transition ${
                          !filters.selectedSubcategory ? 'text-amber-600 font-semibold' : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        All {category.name}
                      </button>
                    </li>
                    {subcategories.map((sub) => (
                      <li key={sub.id} className="flex items-center justify-between">
                        <button
                          onClick={() =>
                            setFilters((prev) => ({
                              ...prev,
                              selectedSubcategory: prev.selectedSubcategory === sub.id ? null : sub.id,
                            }))
                          }
                          className={`text-sm py-0.5 transition text-left ${
                            filters.selectedSubcategory === sub.id
                              ? 'text-amber-600 font-semibold'
                              : 'text-gray-600 hover:text-gray-900'
                          }`}
                        >
                          {sub.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Price Range */}
              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-3">Price</h3>
                {!priceRangeReady && <p className="text-xs text-gray-500 mb-2">Loading price range...</p>}
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">
                      Min: {formatPrice(filters.priceRange[0])}
                    </label>
                    <input
                      type="range"
                      disabled={!priceRangeReady}
                      min="0"
                      max={dynamicPriceMax}
                      step="500"
                      value={filters.priceRange[0]}
                      onChange={(e) => handlePriceChange('min', Number(e.target.value))}
                      className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">
                      Max: {formatPrice(filters.priceRange[1])}
                    </label>
                    <input
                      type="range"
                      disabled={!priceRangeReady}
                      min="0"
                      max={dynamicPriceMax}
                      step="500"
                      value={filters.priceRange[1]}
                      onChange={(e) => handlePriceChange('max', Number(e.target.value))}
                      className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* Rating Filter */}
              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-2">Customer Review</h3>
                <div className="space-y-1.5">
                  {[4, 3, 2, 1].map((r) => (
                    <button
                      key={r}
                      onClick={() => setFilters((prev) => ({ ...prev, rating: prev.rating === r ? null : r }))}
                      className={`flex items-center gap-1.5 text-sm transition w-full ${
                        filters.rating === r ? 'text-amber-600 font-medium' : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      <div className="flex">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            size={12}
                            className={i < r ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}
                          />
                        ))}
                      </div>
                      <span>& Up</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* In Stock */}
              <div className="border-t border-gray-200 pt-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.inStock}
                    onChange={() => setFilters((prev) => ({ ...prev, inStock: !prev.inStock }))}
                    className="accent-amber-500 w-3.5 h-3.5"
                  />
                  <span className="text-sm text-gray-700">In Stock Only</span>
                </label>
              </div>

              {/* Brands list */}
              {brands.length > 0 && (
                <div className="border-t border-gray-200 pt-4">
                  <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-2">Brands in loaded products</h3>
                  <ul className="space-y-1 max-h-40 overflow-y-auto">
                    {brands.slice(0, 15).map((b) => (
                      <li key={b} className="text-sm text-gray-600">{b}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Reset */}
              {activeFilterCount > 0 && (
                <button
                  onClick={resetFilters}
                  className="text-sm text-amber-600 hover:text-amber-700 font-medium transition"
                >
                  Clear all filters
                </button>
              )}
            </div>
          </aside>

          {/* ── Products Grid ── */}
          <div className="flex-1 min-w-0">
            {filteredProducts.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">No products found</h2>
                <p className="text-sm text-gray-500 mb-4">
                  Try adjusting your filters or browse a different category.
                </p>
                {activeFilterCount > 0 && (
                  <button
                    onClick={resetFilters}
                    className="bg-amber-500 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-amber-600 transition"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            ) : (
              <>
                {!filters.selectedSubcategory && filters.sortBy === 'featured' && subcategories.length > 0 ? (
                  <div className="space-y-8">
                    {subcategoryProductSections.map((section) => (
                      <section key={section.subcategory.id} className="space-y-3">
                        <div className="flex items-end justify-between border-b border-gray-200 pb-2">
                          <h2 className="text-base md:text-lg font-bold text-gray-900">
                            {section.subcategory.name}
                          </h2>
                          <span className="text-xs text-gray-500">
                            {section.products.length} loaded product{section.products.length !== 1 ? 's' : ''}
                          </span>
                        </div>

                        <div
                          className={
                            gridView === 'grid'
                              ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4'
                              : 'space-y-3'
                          }
                        >
                          {section.products.map((product) => (
                            <ProductCard
                              key={`${section.subcategory.id}-${product.id}`}
                              product={product}
                              imageLoading="lazy"
                              publicUnitPrice={publicPriceMap[product.id]}
                              markupMrp={publicMrpMap[product.id]}
                              priceLoading={publicPriceLoading}
                            />
                          ))}
                        </div>
                      </section>
                    ))}

                    {uncategorizedProducts.length > 0 && (
                      <section className="space-y-3">
                        <div className="flex items-end justify-between border-b border-gray-200 pb-2">
                          <h2 className="text-base md:text-lg font-bold text-gray-900">Other in {category.name}</h2>
                          <span className="text-xs text-gray-500">
                            {uncategorizedProducts.length} loaded product{uncategorizedProducts.length !== 1 ? 's' : ''}
                          </span>
                        </div>

                        <div
                          className={
                            gridView === 'grid'
                              ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4'
                              : 'space-y-3'
                          }
                        >
                          {uncategorizedProducts.map((product) => (
                            <ProductCard
                              key={`other-${product.id}`}
                              product={product}
                              imageLoading="lazy"
                              publicUnitPrice={publicPriceMap[product.id]}
                              markupMrp={publicMrpMap[product.id]}
                              priceLoading={publicPriceLoading}
                            />
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                ) : (
                  <div
                    className={
                      gridView === 'grid'
                        ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4'
                        : 'space-y-3'
                    }
                  >
                    {filteredProducts.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        imageLoading="lazy"
                        publicUnitPrice={publicPriceMap[product.id]}
                        markupMrp={publicMrpMap[product.id]}
                        priceLoading={publicPriceLoading}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
            {hasMore && (
              <div ref={setSentinel} className="py-6 text-center" aria-live="polite">
                {loadingMore ? (
                  <p className="text-sm text-gray-500">Loading more products...</p>
                ) : (
                  <>
                    {pageError && <p className="text-sm text-red-600 mb-2">{pageError}</p>}
                    <button
                      onClick={() => void loadPage(requestGeneration.current, nextOffset.current)}
                      className="px-5 py-2 text-sm font-semibold text-amber-700 border border-amber-500 rounded-lg hover:bg-amber-50"
                    >
                      {pageError ? 'Try again' : 'Load more products'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Mobile Filter Drawer ── */}
      {showMobileFilters && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowMobileFilters(false)}
          />
          {/* Drawer */}
          <div className="absolute left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white shadow-xl overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Filters</h2>
              <button onClick={() => setShowMobileFilters(false)}>
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="p-4 space-y-6">
              {/* Subcategory */}
              {subcategories.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-2">Department</h3>
                  <ul className="space-y-2">
                    <li>
                      <button
                        onClick={() => setFilters(prev => ({ ...prev, selectedSubcategory: null }))}
                        className={`text-sm ${!filters.selectedSubcategory ? 'text-amber-600 font-semibold' : 'text-gray-600'}`}
                      >
                        All {category.name}
                      </button>
                    </li>
                    {subcategories.map((sub) => (
                      <li key={sub.id}>
                        <button
                          onClick={() =>
                            setFilters((prev) => ({
                              ...prev,
                              selectedSubcategory: prev.selectedSubcategory === sub.id ? null : sub.id,
                            }))
                          }
                          className={`text-sm ${
                            filters.selectedSubcategory === sub.id ? 'text-amber-600 font-semibold' : 'text-gray-600'
                          }`}
                        >
                          {sub.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Price */}
              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-3">Price</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">
                      Min: {formatPrice(filters.priceRange[0])}
                    </label>
                    <input
                      type="range" min="0" max={dynamicPriceMax} step="500" disabled={!priceRangeReady}
                      value={filters.priceRange[0]}
                      onChange={(e) => handlePriceChange('min', Number(e.target.value))}
                      className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">
                      Max: {formatPrice(filters.priceRange[1])}
                    </label>
                    <input
                      type="range" min="0" max={dynamicPriceMax} step="500" disabled={!priceRangeReady}
                      value={filters.priceRange[1]}
                      onChange={(e) => handlePriceChange('max', Number(e.target.value))}
                      className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* Rating */}
              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-2">Customer Review</h3>
                <div className="space-y-2">
                  {[4, 3, 2, 1].map((r) => (
                    <button
                      key={r}
                      onClick={() => setFilters((prev) => ({ ...prev, rating: prev.rating === r ? null : r }))}
                      className={`flex items-center gap-1.5 text-sm w-full ${
                        filters.rating === r ? 'text-amber-600 font-medium' : 'text-gray-600'
                      }`}
                    >
                      <div className="flex">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} size={12} className={i < r ? 'fill-amber-400 text-amber-400' : 'text-gray-300'} />
                        ))}
                      </div>
                      <span>& Up</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* In Stock */}
              <div className="border-t border-gray-200 pt-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.inStock}
                    onChange={() => setFilters((prev) => ({ ...prev, inStock: !prev.inStock }))}
                    className="accent-amber-500 w-3.5 h-3.5"
                  />
                  <span className="text-sm text-gray-700">In Stock Only</span>
                </label>
              </div>

              {/* Apply / Reset */}
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={resetFilters}
                  className="flex-1 py-2.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  Reset
                </button>
                <button
                  onClick={() => setShowMobileFilters(false)}
                  className="flex-1 py-2.5 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600 transition"
                >
                  Show Results
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Footer />
      <MobileNav />
    </div>
  );
};

export default CategoryProducts;