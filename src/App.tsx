import { lazy, Suspense, useEffect, useState, useTransition, createContext, useContext, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { PageSkeleton } from './components/common/Skeleton';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CartProvider, useCart } from './contexts/CartContext';
import { WishlistProvider } from './contexts/WishlistContext';
import { CurrencyProvider } from './contexts/CurrencyContext';
import { useWishlistSync } from './hooks/useWishlistSync';
import { GlobalActionConfirmation } from './components/common/GlobalActionConfirmation';
import ErrorBoundary from './components/ErrorBoundary';
import { OfflineScreen, useOnlineStatus } from './components/OfflineScreen';
import {
  NativePullToRefreshIndicator,
  useNativeBackButton,
  useNativePagePersist,
  useNativePullToRefresh,
} from './mobile/nativeRuntime';
import { openExternalUrl } from './mobile/externalLinks';
import { BzeadHomePage } from './pages/BzeadHomePage';
import { FloatingCartShortcut } from './components/layout/FloatingCartShortcut';

// ── Navigation loading context ─────────────────────────────────────────
// Exposes startNavigation (wraps navigate in startTransition) so React 19
// keeps showing the current page while the lazy chunk loads, and isPending
// drives the global progress bar.
interface AppNavigationCtx {
  isPending: boolean;
  startNavigation: (fn: () => void) => void;
}
const AppNavigationContext = createContext<AppNavigationCtx>({
  isPending: false,
  startNavigation: (fn) => fn(),
});
export const useAppNavigation = () => useContext(AppNavigationContext);

const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isPending, startTransition] = useTransition();
  const startNavigation = useCallback((fn: () => void) => startTransition(fn), []);
  return (
    <AppNavigationContext.Provider value={{ isPending, startNavigation }}>
      {children}
    </AppNavigationContext.Provider>
  );
};

// ── Retry wrapper for lazy imports (handles chunk-load failures after deploys) ──
function lazyRetry<T extends { default: React.ComponentType<any> }>(
  factory: () => Promise<T>,
): React.LazyExoticComponent<T['default']> {
  return lazy(() =>
    factory().catch(() =>
      // First retry after a short delay
      new Promise<T>((resolve) => setTimeout(resolve, 1500)).then(() =>
        factory().catch(() => {
          // Final retry failed — force reload to get fresh chunks
          const reloadKey = 'bzead_chunk_reload';
          if (!sessionStorage.getItem(reloadKey)) {
            sessionStorage.setItem(reloadKey, Date.now().toString());
            window.location.reload();
          }
          // Return a minimal fallback so the promise chain resolves
          return factory();
        })
      )
    )
  );
}

// ── Lazy-loaded page components (code-splitting) ──────────────────────
// Named-only exports use .then() wrapper; default exports load directly.

// Auth
const Login = lazyRetry(() => import('./components/auth/Login').then(m => ({ default: m.Login })));
const Signup = lazyRetry(() => import('./components/auth/Signup').then(m => ({ default: m.Signup })));

// User pages
const MyOrders = lazyRetry(() => import('./pages/user/MyOrders').then(m => ({ default: m.MyOrders })));
const NotificationsPage = lazyRetry(() => import('./pages/user/Notifications'));
const WishlistPage = lazyRetry(() => import('./pages/user/Wishlist').then(m => ({ default: m.WishlistPage })));
const CartPage = lazyRetry(() => import('./pages/user/Cart').then(m => ({ default: m.CartPage })));
const UserSettings = lazyRetry(() => import('./pages/user/Settings').then(m => ({ default: m.UserSettings })));
const ForgotPassword = lazyRetry(() => import('./pages/user/ForgotPassword'));
const Profile = lazyRetry(() => import('./pages/user/Profile'));
const OrderDetails = lazyRetry(() => import('./pages/user/OrderDetails'));
const WriteReview = lazyRetry(() => import('./pages/user/WriteReview'));
const UserAddressManagement = lazyRetry(() => import('./pages/user/AddressManagement'));
const AddressEditor = lazyRetry(() => import('./pages/user/AddressEditor'));
const Checkout = lazyRetry(() => import('./pages/user/Checkout'));
const ShippingAddressPage = lazyRetry(() => import('./pages/user/ShippingAddress'));
const OrderSummaryPage = lazyRetry(() => import('./pages/user/OrderSummary'));
const OrderConfirmationPage = lazyRetry(() => import('./pages/user/OrderConfirmation'));
const UkHostedCheckoutReturn = lazyRetry(() => import('./pages/user/UkHostedCheckoutReturn'));

// Public pages
const ProductDetailsPage = lazyRetry(() => import('./pages/ProductDetailsPage'));
const CategoryProducts = lazyRetry(() => import('./pages/CategoryProducts').then(m => ({ default: m.CategoryProducts })));
const SectionProducts = lazyRetry(() => import('./pages/SectionProducts').then(m => ({ default: m.SectionProducts })));
const PrivacyPolicy = lazyRetry(() => import('./pages/PrivacyPolicy'));
const DeleteAccountPolicy = lazyRetry(() => import('./pages/DeleteAccountPolicy'));
const TermsService = lazyRetry(() => import('./pages/TermsService'));
const ShippingPolicy = lazyRetry(() => import('./pages/ShippingPolicy'));
const RefundPolicy = lazyRetry(() => import('./pages/RefundPolicy'));
const TermsAndConditions = lazyRetry(() => import('./pages/TermsAndConditions'));
const About = lazyRetry(() => import('./pages/About'));
const Contact = lazyRetry(() => import('./pages/Contact'));
const OTPVerification = lazyRetry(() => import('./pages/OTPVerification'));
const NewPassword = lazyRetry(() => import('./pages/NewPassword'));
const NotFound = lazyRetry(() => import('./pages/NotFound'));

// ── Page loading fallback ─────────────────────────────────────────────
const PageLoader = () => <PageSkeleton variant="plain" />;

// ── Global navigation progress bar ────────────────────────────────────
// Shows during both lazy-chunk loading (via isPending from useTransition)
// and regular route changes (fallback timer keeps it visible long enough).
const NavigationProgress: React.FC = () => {
  const { isPending } = useAppNavigation();
  const location = useLocation();
  const [timerActive, setTimerActive] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    setTimerActive(true);
    const t = window.setTimeout(() => setTimerActive(false), 2000);
    return () => window.clearTimeout(t);
  }, [location.pathname, location.search, location.hash]);

  const visible = isPending || timerActive;
  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[1200] pointer-events-none">
      <div className="h-[3px] nav-progress-bar" />
    </div>
  );
};

const LegacySectionRedirect: React.FC<{ to: '/products/section/featured' | '/products/section/hot-deals' }> = ({ to }) => {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}`} replace />;
};

/** Share link fallback — if the host does not intercept this route, redirect to product page */
const ShareRedirect: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  return <Navigate to={`/products/${slug}`} replace />;
};

/**
 * Buyer-app seller redirect — intercepts /seller/* routes in the buyer-only
 * Android app and opens the full web app in the system browser (Chrome
 * Custom Tab) instead of rendering seller pages inline.
 */
const ExternalSellerRedirect: React.FC = () => {
  const navigate = useNavigate();
  useEffect(() => {
    void openExternalUrl('https://www.bzead.com/seller');
    navigate('/', { replace: true });
  }, [navigate]);
  return null;
};

const NativeRuntimeGuard: React.FC<{ children: (refreshEpoch: number) => React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [refreshEpoch, setRefreshEpoch] = useState(0);

  useNativeBackButton(location.pathname);
  useNativePagePersist(location.pathname);

  const handleRefresh = useCallback(async () => {
    setRefreshEpoch((prev) => prev + 1);
  }, []);

  const {
    enabled: pullEnabled,
    pullDistance,
    isRefreshing,
  } = useNativePullToRefresh({ onRefresh: handleRefresh });

  return (
    <>
      <NativePullToRefreshIndicator
        enabled={pullEnabled}
        pullDistance={pullDistance}
        isRefreshing={isRefreshing}
      />
      {children(refreshEpoch)}
    </>
  );
};

/** Root deep-link entrypoint used by share redirects (/?product=<slug>) */
const RootEntry: React.FC = () => {
  const location = useLocation();
  const productRef = new URLSearchParams(location.search).get('product')?.trim();

  if (productRef) {
    return <Navigate to={`/products/${encodeURIComponent(productRef)}`} replace />;
  }

  return <BzeadHomePage />;
};

// ═══════════════════════════════════════════════════════════════════════
// RouteGuard — buyer storefront access control
//
// Guest:  Public pages only. Cart/wishlist/checkout → redirect to /login.
// User:   Public + user pages.
// ═══════════════════════════════════════════════════════════════════════
const RouteGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { authRole, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const [guardTimeoutReached, setGuardTimeoutReached] = useState(false);

  useEffect(() => {
    if (!loading) {
      setGuardTimeoutReached(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setGuardTimeoutReached(true);
    }, 12_000);
    return () => window.clearTimeout(timer);
  }, [loading]);

  const effectiveLoading = loading && !guardTimeoutReached;

  useEffect(() => {
    if (effectiveLoading) return;

    const authFlowPages = ['/otp-verification', '/new-password', '/forgot-password'];
    if (authFlowPages.includes(path)) return;

    const publicPages = [
      '/',
      '/privacy-policy', '/terms-of-service', '/shipping-policy',
      '/refund-policy', '/terms-and-conditions', '/deleteaccount', '/about', '/contact',
    ];
    const publicPrefixes = ['/products', '/category'];
    const isPublicPage =
      publicPages.includes(path) ||
      publicPrefixes.some((p) => path === p || path.startsWith(`${p}/`));

    const userAuthPages = ['/login', '/signup'];
    const isUserAuthPage = userAuthPages.includes(path);
    const isSellerPortalRedirect = path === '/seller' || path.startsWith('/seller/');
    const userProtectedPrefixes = [
      '/orders', '/profile', '/wishlist', '/cart', '/checkout',
      '/settings', '/notifications', '/user',
    ];
    const isUserProtectedPage = userProtectedPrefixes.some(
      (p) => path === p || path.startsWith(`${p}/`)
    );

    if (authRole === 'admin' || authRole === 'seller') {
      if (path === '/deleteaccount') return;
      if (isSellerPortalRedirect) return;
      if (path !== '/') {
        navigate('/', { replace: true });
      }
      return;
    }

    if (authRole === 'user') {
      if (isSellerPortalRedirect) return;
      // Already logged in — redirect away from user login/signup
      if (isUserAuthPage) {
        navigate('/', { replace: true });
        return;
      }
      // Everything else (public + user protected) — allowed
      return;
    }

    if (isPublicPage || isUserAuthPage || isSellerPortalRedirect) return;

    if (isUserProtectedPage) {
      navigate('/login', { replace: true, state: { from: path } });
    }
    // Unknown path — let NotFound component handle it
  }, [authRole, path, effectiveLoading, navigate]);

  if (effectiveLoading) return <PageLoader />;
  return <>{children}</>;
};

// Auto-sync wishlist when user logs in
const WishlistAutoSync: React.FC = () => {
  useWishlistSync();
  return null;
};

// Auto-sync cart when user logs in
const CartAutoSync: React.FC = () => {
  const { user, currentAuthUser, authRole } = useAuth();
  const { syncCartWithBackend } = useCart();

  useEffect(() => {
    if (authRole && authRole !== 'user') return;
    const userId = user?.id || currentAuthUser?.userId;
    if (userId) {
      syncCartWithBackend(userId);
    }
  }, [authRole, user?.id, currentAuthUser?.userId, syncCartWithBackend]);

  return null;
};

function App() {
  const isOnline = useOnlineStatus();

  if (!isOnline) {
    return <OfflineScreen />;
  }

  return (
    <ErrorBoundary>
      <AuthProvider>
        <CurrencyProvider>
          <CartProvider>
            <WishlistProvider>
              <Router>
                <NavigationProvider>
                  <WishlistAutoSync />
                  <CartAutoSync />
                  <NavigationProgress />
                  <GlobalActionConfirmation />
                  <FloatingCartShortcut />
                  <NativeRuntimeGuard>
                    {(refreshEpoch) => (
                      <RouteGuard key={refreshEpoch}>
                        <ErrorBoundary>
                          <Suspense fallback={<PageLoader />}>
                            <Routes>
                  <Route path="/" element={<RootEntry />} />
                  <Route path="/all-categories" element={<Navigate to="/" replace />} />
                  <Route path="/products/featured" element={<LegacySectionRedirect to="/products/section/featured" />} />
                  <Route path="/products/hot-deals" element={<LegacySectionRedirect to="/products/section/hot-deals" />} />
                  <Route path="/products/section/:section" element={<SectionProducts />} />
                  <Route path="/products/:productId" element={<ProductDetailsPage />} />
                  {/* Share link fallback — redirect to product page (OG handled by edge function) */}
                  <Route path="/share/:slug" element={<ShareRedirect />} />
                  <Route path="/category/:categoryId" element={<CategoryProducts />} />
                  
                  {/* Legal Pages */}
                  <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                  <Route path="/deleteaccount" element={<DeleteAccountPolicy />} />
                  <Route path="/terms-of-service" element={<TermsService />} />
                  <Route path="/shipping-policy" element={<ShippingPolicy />} />
                  <Route path="/refund-policy" element={<RefundPolicy />} />
                  <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
                  <Route path="/about" element={<About />} />
                  <Route path="/contact" element={<Contact />} />
                  
                  {/* User Routes */}
                  <Route path="/login" element={<Login role="user" />} />
                  <Route path="/signup" element={<Signup role="user" />} />
                  <Route path="/otp-verification" element={<OTPVerification />} />
                  <Route path="/new-password" element={<NewPassword />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/orders" element={<MyOrders />} />
                  <Route path="/orders/:orderId" element={<OrderDetails />} />
                  <Route path="/notifications" element={<NotificationsPage />} />
                  <Route path="/wishlist" element={<WishlistPage />} />
                  <Route path="/cart" element={<CartPage />} />
                  <Route path="/settings" element={<UserSettings />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/products/:productId/review" element={<WriteReview />} />
                  <Route path="/user/addresses" element={<UserAddressManagement />} />
                  <Route path="/user/addresses/new" element={<AddressEditor />} />
                  <Route path="/user/addresses/:addressId/edit" element={<AddressEditor />} />
                  
                  {/* Checkout Flow Routes */}
                  <Route path="/checkout/shipping" element={<ShippingAddressPage />} />
                  <Route path="/checkout/review" element={<OrderSummaryPage />} />
                  <Route path="/checkout/payment" element={<Checkout />} />
                  <Route path="/checkout/confirmation" element={<OrderConfirmationPage />} />
                  <Route path="/checkout/uk-payment-return" element={<UkHostedCheckoutReturn />} />
                  
                  <Route path="/seller" element={<ExternalSellerRedirect />} />
                  <Route path="/seller/*" element={<ExternalSellerRedirect />} />
                  
                  {/* 404 */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
                          </Suspense>
                        </ErrorBoundary>
                      </RouteGuard>
                    )}
                  </NativeRuntimeGuard>
                </NavigationProvider>
              </Router>
            </WishlistProvider>
          </CartProvider>
        </CurrencyProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
