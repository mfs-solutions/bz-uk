import React, { useState, useEffect } from 'react';
import { Header } from '../../components/layout/Header';
import { Footer } from '../../components/layout/Footer';
import { MobileNav } from '../../components/layout/MobileNav';
import { ProductGridSkeleton } from '../../components/common/Skeleton';
import { useAuth } from '../../contexts/AuthContext';
import { useWishlist } from '../../contexts/WishlistContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { useDestinationCountry } from '../../hooks/useDestinationCountry';
import { fetchPublicProductPrices } from '../../lib/pricingService';
import { useNavigate } from 'react-router-dom';
import { Heart, ShoppingCart, X } from 'lucide-react';
import { Link } from 'react-router-dom';

// Users whose wishlist was already synced from the backend in this session.
const syncedUsers = new Set<string>();

export const WishlistPage: React.FC = () => {
  const { user, currentAuthUser, loading: authLoading } = useAuth();
  const { items: wishlistItems, removeFromWishlist, loadFromBackend } = useWishlist();
  const { formatPrice, convertPrice, currency } = useCurrency();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(wishlistItems.length === 0);
  const [priceLoading, setPriceLoading] = useState(false);
  const [publicPriceMap, setPublicPriceMap] = useState<Record<string, number>>({});
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const selectedCountry = useDestinationCountry({
    userId: user?.id || currentAuthUser?.userId || null,
    userCountry: user?.country || '',
  });

  useEffect(() => {
    // Wait for auth to initialize
    if (authLoading) return;
    // Check if user is logged in
    if (!user && !currentAuthUser) {
      navigate('/login');
      return;
    }

    // Load wishlist from backend
    const loadWishlist = async () => {
      try {
        const userId = user?.id || currentAuthUser?.userId;
        if (userId && !syncedUsers.has(userId)) {
          syncedUsers.add(userId);
          await loadFromBackend(userId);
        }
      } catch (error) {
        console.error('Failed to load wishlist from backend:', error);
      } finally {
        setLoading(false);
      }
    };

    loadWishlist();
  }, [user, currentAuthUser, navigate, loadFromBackend, authLoading]);

  useEffect(() => {
    const loadPublicPrices = async () => {
      if (!selectedCountry) {
        setPublicPriceMap({});
        setPriceLoading(true);
        return;
      }

      if (wishlistItems.length === 0) {
        setPublicPriceMap({});
        setPriceLoading(false);
        return;
      }

      setPriceLoading(true);
      const { data } = await fetchPublicProductPrices(
        wishlistItems.map((item) => item.id),
        selectedCountry,
      );

      const map: Record<string, number> = {};
      (data || []).forEach((item) => {
        map[item.productId] = item.publicUnitPrice;
      });

      setPublicPriceMap(map);
      setPriceLoading(false);
    };

    void loadPublicPrices();
  }, [wishlistItems, selectedCountry]);

  const handleRemoveItem = (id: string) => {
    setRemovingId(id);
    removeFromWishlist(id);
    // Small delay so opacity-50 feedback is visible before item is removed from list
    setTimeout(() => {
      setRemovingId(null);
      setConfirmRemoveId(null);
    }, 300);
  };

  const handleAddToCart = (product: any) => {
    // Navigate to product page so user can select variant (size/color) before adding
    navigate(`/products/${product.id}`);
  };

  const resolvePublicPriceSourceCurrency = (product: { currency?: string }) =>
    (product.currency || 'INR').toUpperCase();

  const unitPriceOf = (item: (typeof wishlistItems)[number]): number | null => {
    if (typeof publicPriceMap[item.id] === 'number') return publicPriceMap[item.id];
    return typeof item.price === 'number' ? item.price : null;
  };

  const hasResolvedAllPrices = wishlistItems.every((item) => unitPriceOf(item) !== null);
  const totalValue = hasResolvedAllPrices
    ? wishlistItems.reduce(
      (sum, item) => sum + convertPrice(unitPriceOf(item) as number, resolvePublicPriceSourceCurrency(item)),
      0,
    )
    : 0;
  // Savings = original price (before discount) minus the current price.
  const totalSavings = hasResolvedAllPrices
    ? wishlistItems.reduce((sum, item) => {
      const unit = convertPrice(unitPriceOf(item) as number, resolvePublicPriceSourceCurrency(item));
      const discount = item.discount && item.discount > 0 && item.discount < 100 ? item.discount : 0;
      return sum + (discount ? unit / (1 - discount / 100) - unit : 0);
    }, 0)
    : 0;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />

      <main className="flex-grow max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 w-full pb-24 md:pb-8">
        <div className="flex items-end justify-between gap-3 mb-4">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-slate-900 leading-tight">My Wishlist</h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              {wishlistItems.length} {wishlistItems.length === 1 ? 'item' : 'items'} saved
            </p>
          </div>
          {wishlistItems.length > 0 && (
            <div className="text-right">
              <p className="text-[11px] sm:text-xs text-slate-500">Total value</p>
              <p className="text-base sm:text-xl font-bold text-[#6D28D9]">
                {hasResolvedAllPrices ? formatPrice(totalValue, currency) : '…'}
              </p>
              {hasResolvedAllPrices && totalSavings >= 1 && (
                <p className="text-[11px] sm:text-xs font-semibold text-emerald-600">
                  You save {formatPrice(Math.round(totalSavings), currency)}
                </p>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <ProductGridSkeleton count={8} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4" />
        ) : wishlistItems.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 sm:p-14 text-center">
            <Heart className="h-14 w-14 text-slate-300 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900 mb-1">Your wishlist is empty</h2>
            <p className="text-sm text-slate-500 mb-6">Tap the heart on any product to save it for later.</p>
            <button
              onClick={() => navigate('/')}
              className="bg-[#6D28D9] text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-[#5b21b6] transition-colors"
            >
              Continue Shopping
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {wishlistItems.map((product) => {
              const unit = unitPriceOf(product);
              const sourceCurrency = resolvePublicPriceSourceCurrency(product);
              const discount = product.discount && product.discount > 0 && product.discount < 100 ? product.discount : 0;
              const outOfStock = product.stock != null && product.stock <= 0;
              return (
                <article
                  key={product.id}
                  className={`relative bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col transition-opacity ${
                    removingId === product.id ? 'opacity-50' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setConfirmRemoveId(product.id)}
                    disabled={removingId === product.id}
                    aria-label={`Remove ${product.name} from wishlist`}
                    className="absolute top-2 right-2 z-10 h-8 w-8 rounded-full bg-white/90 shadow flex items-center justify-center text-slate-500 hover:text-red-600 disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  {discount > 0 && (
                    <span className="absolute top-2 left-2 z-10 bg-red-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                      -{discount}%
                    </span>
                  )}
                  <Link to={`/products/${product.id}`} className="block aspect-square bg-slate-100">
                    <img
                      src={product.image_url}
                      alt={product.name}
                      loading="lazy"
                      className={`w-full h-full object-cover ${outOfStock ? 'grayscale opacity-70' : ''}`}
                    />
                  </Link>

                  <div className="flex flex-col flex-grow p-3 gap-1">
                    <Link to={`/products/${product.id}`}>
                      <h3 className="text-sm font-semibold text-slate-900 line-clamp-2 leading-snug">{product.name}</h3>
                    </Link>
                    {product.brand && <p className="text-xs text-slate-500 truncate">{product.brand}</p>}

                    <div className="flex items-baseline flex-wrap gap-x-2 mt-1">
                      {unit !== null ? (
                        <>
                          <span className="text-base font-bold text-[#6D28D9]">{formatPrice(unit, sourceCurrency)}</span>
                          {discount > 0 && (
                            <span className="text-xs text-slate-400 line-through">
                              {formatPrice(Math.round(unit / (1 - discount / 100)), sourceCurrency)}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-slate-500">{priceLoading ? 'Loading price…' : 'Price unavailable'}</span>
                      )}
                    </div>

                    <p className={`text-xs font-medium ${
                      product.stock == null ? 'text-slate-500' : outOfStock ? 'text-red-600' : 'text-emerald-600'
                    }`}>
                      {product.stock == null ? 'Check availability' : outOfStock ? 'Out of stock' : 'In stock'}
                    </p>

                    <button
                      type="button"
                      onClick={() => handleAddToCart(product)}
                      disabled={removingId === product.id}
                      className="mt-auto pt-0 w-full bg-[#6D28D9] text-white text-sm px-3 py-2 rounded-xl font-semibold hover:bg-[#5b21b6] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <ShoppingCart className="h-4 w-4" />
                      {outOfStock ? 'View product' : 'Add to cart'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* Confirm Remove Dialog */}
      {confirmRemoveId && (
        <div className="fixed inset-0 z-[10001] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Remove from Wishlist</h3>
            <p className="text-sm text-gray-600 mb-6">Are you sure you want to remove this item from your wishlist?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmRemoveId(null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRemoveItem(confirmRemoveId)}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
      <MobileNav />
    </div>
  );
};
