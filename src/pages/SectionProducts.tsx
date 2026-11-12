import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { StorefrontHeader } from '../components/layout/StorefrontHeader';
import { Footer } from '../components/layout/Footer';
import { MobileNav } from '../components/layout/MobileNav';
import { ProductCard } from '../components/products/ProductCard';
import { Menu, X, Star, DollarSign, Package, ArrowLeft } from 'lucide-react';
import { fetchProductsBySection, fetchCategoriesFlat, searchPublicProductsByKeywords, sectionMeta, type ProductSection } from '../lib/productService';
import { fetchPublicProductPrices } from '../lib/pricingService';
import { useCurrency } from '../contexts/CurrencyContext';
import { useAuth } from '../contexts/AuthContext';
import { getActiveSponsoredProductsBySection } from '../lib/sponsoredProductsService';
import { useDestinationCountry } from '../hooks/useDestinationCountry';
import type { Product } from '../types';

interface FilterOptions {
  priceRange: [number, number];
  rating: number | null;
  inStock: boolean;
  sortBy: 'featured' | 'price-low-high' | 'price-high-low' | 'rating' | 'newest';
  category: string | null;
}

export const SectionProducts: React.FC = () => {
  const { section } = useParams<{ section: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currency, convertPrice, formatPrice } = useCurrency();
  const { user, currentAuthUser } = useAuth();
  const [showSidebar, setShowSidebar] = useState(false);
  const [filters, setFilters] = useState<FilterOptions>({
    priceRange: [0, Number.POSITIVE_INFINITY],
    rating: null,
    inStock: false,
    sortBy: 'featured',
    category: null,
  });

  // Validate section param
  const validSections: ProductSection[] = ['featured', 'hot-deals', 'trending'];
  const currentSection = validSections.includes(section as ProductSection)
    ? (section as ProductSection)
    : null;

  const [products, setProducts] = useState<Product[]>([]);
  const [publicPriceMap, setPublicPriceMap] = useState<Record<string, number>>({});
  const [publicMrpMap, setPublicMrpMap] = useState<Record<string, number>>({});
  const [publicPriceLoading, setPublicPriceLoading] = useState(false);
  const [categoryNameMap, setCategoryNameMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [searchTotalCount, setSearchTotalCount] = useState(0);
  const [hasMoreSearchResults, setHasMoreSearchResults] = useState(false);
  const searchRequestId = useRef(0);

  const selectedCountry = useDestinationCountry({
    userId: user?.id || currentAuthUser?.userId || null,
    userCountry: user?.country || '',
  });

  const info = currentSection
    ? sectionMeta[currentSection]
    : { title: 'Unknown Section', subtitle: '', icon: '🛍️' };
  const searchTerm = (searchParams.get('search') || '').trim().toLowerCase();
  useEffect(() => {
    let cancelled = false;
    const requestId = ++searchRequestId.current;
    setSearchError(null);
    setSearchTotalCount(0);
    setHasMoreSearchResults(false);

    if (!currentSection) {
      setProducts([]);
      setCategoryNameMap({});
      setLoading(false);
      return () => { cancelled = true; };
    }

    (async () => {
      setLoading(true);
      let productsToRender: Product[] = [];

      if (searchTerm) {
        const [searchRes, catsRes] = await Promise.all([
          searchPublicProductsByKeywords(searchTerm, 50, 0, true),
          fetchCategoriesFlat(),
        ]);

        if (!cancelled && requestId === searchRequestId.current) {
          const nameMap: Record<string, string> = {};
          (catsRes.data || []).forEach((c: any) => { nameMap[c.id] = c.name; });
          setCategoryNameMap(nameMap);

          if (searchRes.error) {
            setSearchError(searchRes.error);
            setProducts([]);
            setLoading(false);
            return;
          }

          productsToRender = (searchRes.data || []) as Product[];
          const enriched = productsToRender.map((p: any) => ({
            ...p,
            category_name: nameMap[p.category] || '',
          })) as Product[];
          setProducts(enriched);
          setSearchTotalCount(searchRes.totalCount);
          setHasMoreSearchResults(searchRes.totalCount > enriched.length);
          setLoading(false);
        }

        return;
      }

      // Fetch section products and categories in parallel
      const [activeSponsored, fallbackRes, catsRes] = await Promise.all([
        getActiveSponsoredProductsBySection(200),
        fetchProductsBySection(currentSection, 200),
        fetchCategoriesFlat(),
      ]);

      const selectedSectionProducts = activeSponsored[currentSection] || [];
      productsToRender =
        selectedSectionProducts.length > 0
          ? selectedSectionProducts
          : ((fallbackRes.data || []) as Product[]);

      if (!cancelled) {
        // Build category name lookup
        const nameMap: Record<string, string> = {};
        (catsRes.data || []).forEach((c: any) => { nameMap[c.id] = c.name; });
        setCategoryNameMap(nameMap);

        // Enrich products with resolved category names
        const enriched = productsToRender.map((p: any) => ({
          ...p,
          category_name: nameMap[p.category] || '',
        })) as Product[];
        setProducts(enriched);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentSection, searchTerm]);

  const loadMoreSearchResults = async () => {
    if (!searchTerm || loadingMore || !hasMoreSearchResults) return;
    const requestId = searchRequestId.current;
    setLoadingMore(true);
    const { data, totalCount, error } = await searchPublicProductsByKeywords(
      searchTerm,
      50,
      products.length,
      true,
    );
    if (requestId === searchRequestId.current) {
      if (error) {
        setSearchError(error);
      } else {
        setProducts((current) => {
          const existingIds = new Set(current.map((product) => product.id));
          const merged = [
            ...current,
            ...((data as Product[]) || []).filter((product) => !existingIds.has(product.id)),
          ];
          setHasMoreSearchResults(merged.length < totalCount);
          return merged;
        });
        setSearchTotalCount(totalCount);
      }
      setLoadingMore(false);
    }
  };

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

      setPublicPriceLoading(true);
      const { data, error } = await fetchPublicProductPrices(
        products.map((p) => p.id),
        selectedCountry
      );

      if (cancelled) return;
      const map: Record<string, number> = {};
      const mrpMap: Record<string, number> = {};
      (data || []).forEach((item) => {
        map[item.productId] = item.publicUnitPrice;
        if (item.markupMrp > 0) mrpMap[item.productId] = item.markupMrp;
      });

      setPublicPriceMap(map);
      setPublicMrpMap(mrpMap);
      setPriceError(error);
      setPublicPriceLoading(false);
    };

    void loadPublicPrices();
    return () => { cancelled = true; };
  }, [products, selectedCountry]);

  const displayPriceByProduct = useMemo(() => {
    const prices: Record<string, number> = {};
    products.forEach((product) => {
      const publicPrice = publicPriceMap[product.id];
      if (Number.isFinite(publicPrice)) {
        prices[product.id] = convertPrice(publicPrice, product.currency || 'INR');
      }
    });
    return prices;
  }, [products, publicPriceMap, convertPrice]);

  // Price filters and sorting use the same country-specific price as product cards.
  const dynamicMaxPrice = useMemo(() => {
    const prices = Object.values(displayPriceByProduct);
    if (prices.length === 0) return 200000;
    return Math.ceil(Math.max(...prices) / 1000) * 1000 || 200000;
  }, [displayPriceByProduct]);

  // Extract unique categories from products (resolved names)
  const availableCategories = useMemo(() => {
    const catSet = new Map<string, string>(); // uuid → name
    products.forEach((p) => {
      if (p.category) {
        catSet.set(p.category, categoryNameMap[p.category] || p.category);
      }
    });
    return Array.from(catSet.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, name]) => ({ id, name }));
  }, [products, categoryNameMap]);

  // Filter and sort products
  const filteredProducts = useMemo(() => {
    const filtered = products.filter((product) => {
      const marketPrice = displayPriceByProduct[product.id];
      if (selectedCountry && !publicPriceLoading && !Number.isFinite(marketPrice)) return false;
      if (Number.isFinite(marketPrice)) {
        if (marketPrice < filters.priceRange[0] || marketPrice > filters.priceRange[1]) return false;
      } else if (filters.priceRange[0] > 0 || Number.isFinite(filters.priceRange[1])) {
        return false;
      }
      // Filter by rating
      if (filters.rating && (product.rating || 0) < filters.rating) {
        return false;
      }
      // Filter by stock
      if (filters.inStock && product.stock === 0) {
        return false;
      }
      // Filter by category
      if (filters.category && product.category !== filters.category) {
        return false;
      }
      return true;
    });

    // Sort products
    switch (filters.sortBy) {
      case 'price-low-high':
        return [...filtered].sort(
          (a, b) => (displayPriceByProduct[a.id] ?? Number.POSITIVE_INFINITY)
            - (displayPriceByProduct[b.id] ?? Number.POSITIVE_INFINITY),
        );
      case 'price-high-low':
        return [...filtered].sort(
          (a, b) => (displayPriceByProduct[b.id] ?? Number.NEGATIVE_INFINITY)
            - (displayPriceByProduct[a.id] ?? Number.NEGATIVE_INFINITY),
        );
      case 'rating':
        return [...filtered].sort((a, b) => (b.rating || 0) - (a.rating || 0));
      case 'newest':
        return [...filtered].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      case 'featured':
      default:
        return filtered;
    }
  }, [products, filters, displayPriceByProduct, selectedCountry, publicPriceLoading]);

  // SL52: Redirect to not-found for invalid section
  useEffect(() => {
    if (!currentSection && section) {
      navigate('/not-found', { replace: true });
    }
  }, [currentSection, section, navigate]);

  const handlePriceChange = (type: 'min' | 'max', value: number) => {
    const [min, max] = filters.priceRange;
    if (type === 'min') {
      setFilters((prev) => ({ ...prev, priceRange: [Math.min(value, max), max] }));
    } else {
      setFilters((prev) => ({ ...prev, priceRange: [min, Math.max(value, min)] }));
    }
  };

  const resetFilters = () => {
    setFilters({
      priceRange: [0, Number.POSITIVE_INFINITY],
      rating: null,
      inStock: false,
      sortBy: 'featured',
      category: null,
    });
  };

  if (!currentSection) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <StorefrontHeader />
        <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 w-full">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-black mb-4">Section Not Found</h1>
            <p className="text-gray-500 mb-6">The product section you're looking for doesn't exist.</p>
            <button
              onClick={() => navigate('/')}
              className="bg-amber-500 text-white px-6 py-2 rounded-lg font-semibold hover:bg-amber-600 transition-all duration-300"
            >
              Back to Home
            </button>
          </div>
        </main>
        <Footer />
        <MobileNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-16 md:pb-0">
      <StorefrontHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-1 text-gray-500 hover:text-amber-600 transition-colors text-sm mb-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </button>
            <h1 className="text-xl md:text-2xl font-bold text-black mb-1">
              {info.icon} {info.title}
            </h1>
            <p className="text-sm text-gray-500">{info.subtitle}</p>
            {searchTerm && (
              <p className="text-xs text-amber-600 mt-1">
                Search results for "{searchParams.get('search')}"
              </p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              {searchTerm
                ? `${filteredProducts.length} shown · ${searchTotalCount} matching products`
                : `${filteredProducts.length} products`}
            </p>
          </div>

          {/* Mobile Filter Toggle */}
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="md:hidden p-1.5 bg-white text-amber-600 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {showSidebar ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Sidebar Filters */}
          <aside
            className={`${
              showSidebar ? 'block' : 'hidden'
            } md:block bg-white border border-gray-100 rounded-xl p-4 h-fit sticky top-24 md:col-span-1`}
          >
            <h2 className="text-lg font-bold text-black mb-4">Filters</h2>

            {/* Sort By */}
            <div className="mb-6">
              <h3 className="text-base font-semibold text-black mb-2 flex items-center gap-2">
                <Package className="h-4 w-4 text-amber-600" />
                Sort By
              </h3>
              <select
                value={filters.sortBy}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    sortBy: e.target.value as FilterOptions['sortBy'],
                  }))
                }
                className="w-full bg-white border border-gray-100 text-black rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500"
              >
                <option value="featured">Featured</option>
                <option value="price-low-high">Price: Low to High</option>
                <option value="price-high-low">Price: High to Low</option>
                <option value="rating">Highest Rated</option>
                <option value="newest">Newest</option>
              </select>
            </div>

            {/* Category Filter */}
            {availableCategories.length > 1 && (
              <div className="mb-6 pb-6 border-b border-gray-100">
                <h3 className="text-base font-semibold text-black mb-3">Category</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => setFilters((prev) => ({ ...prev, category: null }))}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-all duration-300 text-sm ${
                      filters.category === null
                        ? 'bg-amber-500 text-white font-medium'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    All Categories
                  </button>
                  {availableCategories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() =>
                        setFilters((prev) => ({
                          ...prev,
                          category: prev.category === cat.id ? null : cat.id,
                        }))
                      }
                      className={`w-full text-left px-3 py-2 rounded-lg transition-all duration-300 text-sm ${
                        filters.category === cat.id
                          ? 'bg-amber-500 text-white font-medium'
                          : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Price Range Filter */}
            <div className="mb-6 pb-6 border-b border-gray-100">
              <h3 className="text-base font-semibold text-black mb-3 flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-amber-600" />
                Price Range
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-500 mb-2 block">
                    Min: {formatPrice(filters.priceRange[0], currency)}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={filters.priceRange[0]}
                    onChange={(e) => handlePriceChange('min', Number(e.target.value))}
                    aria-label="Minimum price"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-500 mb-2 block">
                    Max: {Number.isFinite(filters.priceRange[1])
                      ? formatPrice(filters.priceRange[1], currency)
                      : 'Any price'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={Number.isFinite(filters.priceRange[1]) ? filters.priceRange[1] : ''}
                    placeholder={String(dynamicMaxPrice)}
                    onChange={(e) => handlePriceChange(
                      'max',
                      e.target.value === '' ? Number.POSITIVE_INFINITY : Number(e.target.value),
                    )}
                    aria-label="Maximum price"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Rating Filter */}
            <div className="mb-6 pb-6 border-b border-gray-100">
              <h3 className="text-base font-semibold text-black mb-3 flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-600" />
                Rating
              </h3>
              <div className="space-y-3">
                {[4, 3, 2, 1].map((rating) => (
                  <button
                    key={rating}
                    onClick={() =>
                      setFilters((prev) => ({
                        ...prev,
                        rating: prev.rating === rating ? null : rating,
                      }))
                    }
                    className={`w-full text-left px-3 py-2 rounded-lg transition-all duration-300 flex items-center gap-2 ${
                      filters.rating === rating
                        ? 'bg-amber-500 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={filters.rating === rating}
                      readOnly
                      className="cursor-pointer"
                    />
                    <span>
                      {'⭐'.repeat(rating)} {rating}+ Stars
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Stock Filter */}
            <div className="pb-8">
              <button
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    inStock: !prev.inStock,
                  }))
                }
                className={`w-full text-left px-3 py-2 rounded-lg transition-all duration-300 flex items-center gap-2 ${
                  filters.inStock
                    ? 'bg-amber-500 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={filters.inStock}
                  readOnly
                  className="cursor-pointer"
                />
                <span>In Stock Only</span>
              </button>
            </div>

            {/* Reset Filters Button */}
            <button
              onClick={resetFilters}
              className="w-full bg-white hover:bg-gray-50 text-black px-4 py-2 rounded-lg font-medium transition-all duration-300"
            >
              Reset Filters
            </button>
          </aside>

          {/* Products Grid */}
          <div className="md:col-span-3">
            {(searchError || priceError) && (
              <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                {searchError || priceError}
              </p>
            )}
            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="bg-gray-100 rounded-xl animate-pulse aspect-[3/4]" />
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-xl p-12 text-center">
                <div className="text-4xl mb-4">{info.icon}</div>
                <h2 className="text-xl font-semibold text-black mb-2">No Products Found</h2>
                <p className="text-gray-500 mb-6">
                  Try adjusting your filters to find what you're looking for.
                </p>
                <button
                  onClick={resetFilters}
                  className="bg-amber-500 text-white px-6 py-2 rounded-lg font-semibold hover:bg-amber-600 transition-all duration-300"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    publicUnitPrice={publicPriceMap[product.id]}
                    markupMrp={publicMrpMap[product.id]}
                    priceLoading={publicPriceLoading || Boolean(
                      selectedCountry && !Number.isFinite(publicPriceMap[product.id]),
                    )}
                  />
                ))}
              </div>
            )}
            {!loading && searchTerm && hasMoreSearchResults && (
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => void loadMoreSearchResults()}
                  disabled={loadingMore}
                  className="rounded-lg bg-black px-6 py-3 font-semibold text-white hover:bg-gray-900 disabled:cursor-wait disabled:opacity-60"
                >
                  {loadingMore ? 'Loading more products...' : 'Load more results'}
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
      <MobileNav />
    </div>
  );
};
