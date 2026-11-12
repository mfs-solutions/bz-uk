import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, Heart, User, LogOut, Package, ChevronDown, ChevronRight, Loader2, Menu, Bell, Settings, X, MapPin, Store, Headphones } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useCart } from '../../contexts/CartContext';
import { useWishlist } from '../../contexts/WishlistContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { resolveCurrencyFromCountry, SUPPORTED_CURRENCIES } from '../../utils/currency';
import { detectLocationWithCaching, getLocationLabel, type ResolvedLocation } from '../../lib/locationService';
import { supabase } from '../../lib/supabase';
import logger from '../../utils/logger';
import { useAppNavigation } from '../../App';
import { isNativePlatform } from '../../mobile/nativePlatform';
import { openExternalUrl } from '../../mobile/externalLinks';
import { IS_UK_STOREFRONT } from '../../config/market';

export interface HeaderDetectedLocation {
  city: ResolvedLocation['city'];
  state: ResolvedLocation['state'];
  country: ResolvedLocation['country'];
  countryCode: ResolvedLocation['countryCode'];
  latitude: ResolvedLocation['latitude'];
  longitude: ResolvedLocation['longitude'];
  provider?: ResolvedLocation['provider'];
  resolvedAt?: ResolvedLocation['resolvedAt'];
}

interface HeaderProps {
  enableLocationAutoDetect?: boolean;
  onLocationDetected?: (location: HeaderDetectedLocation) => void;
}

export const Header: React.FC<HeaderProps> = ({
  enableLocationAutoDetect = true,
  onLocationDetected,
}) => {
  const { user, currentAuthUser, authRole, signOut } = useAuth();
  const { totalItems } = useCart();
  const { items: wishlistItems } = useWishlist();
  const { currency, setCurrency, setDetectedCurrency, loading: currencyLoading, switchingCurrency } = useCurrency();
  const { startNavigation, isPending: navigationLoading } = useAppNavigation();
  const [logoLoadError, setLogoLoadError] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showLoginDropdown, setShowLoginDropdown] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [loadingLink, setLoadingLink] = useState<string | null>(null);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showSellerConfirm, setShowSellerConfirm] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationText, setLocationText] = useState('Detect location for delivery options');
  const [profileCountryId, setProfileCountryId] = useState<string | null>(null);
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const userId = user?.id || currentAuthUser?.userId || null;

  // Signed-in buyers always have a profile country (required at signup). Show the
  // profile country in the header location area and never auto-detect for them.
  useEffect(() => {
    const loadProfileCountry = async () => {
      if (!userId || authRole !== 'user') {
        setProfileCountryId(null);
        return;
      }

      const { data: profileRow } = await supabase
        .from('profiles')
        .select('country_id')
        .eq('id', userId)
        .maybeSingle();

      const countryId = String((profileRow as { country_id?: string | null } | null)?.country_id || '').trim();
      if (!countryId) {
        setProfileCountryId(null);
        return;
      }

      setProfileCountryId(countryId);

      const { data: countryRow } = await supabase
        .from('countries')
        .select('country_name, short_code, country_code, iso2')
        .eq('id', countryId)
        .maybeSingle();

      const name = String(
        (countryRow as { country_name?: string | null } | null)?.country_name
        || (countryRow as { short_code?: string | null } | null)?.short_code
        || (countryRow as { country_code?: string | null } | null)?.country_code
        || (countryRow as { iso2?: string | null } | null)?.iso2
        || ''
      ).trim();

      if (name) setLocationText(name);
    };

    void loadProfileCountry();
  }, [userId, authRole]);

  // For a signed-in buyer: if the freshly detected country differs from the saved
  // profile country, update the profile country (and currency) in the DB so pricing
  // follows the user's real location. Returns true if the profile was changed.
  const syncProfileCountryToDetected = async (location: HeaderDetectedLocation): Promise<boolean> => {
    if (authRole !== 'user' || !userId) return false;

    const iso2 = String(location.countryCode || '').trim().toUpperCase();
    const name = String(location.country || '').trim();
    if (!iso2 && !name) return false;

    // Resolve the detected country to a countries row (id + currency).
    let query = supabase.from('countries').select('id, currency_code');
    query = iso2
      ? query.eq('iso2', iso2)
      : query.ilike('country_name', name);
    const { data: countryRow } = await query.limit(1).maybeSingle();

    const detectedCountryId = String((countryRow as { id?: string | null } | null)?.id || '').trim();
    if (!detectedCountryId) return false;

    // Same country as profile → nothing to do.
    if (profileCountryId && detectedCountryId === profileCountryId) return false;

    const newCurrency = String((countryRow as { currency_code?: string | null } | null)?.currency_code || '')
      .toUpperCase()
      .trim();

    const updatePayload: Record<string, string> = { country_id: detectedCountryId };
    if (newCurrency) updatePayload.currency = newCurrency;

    const { error: updateError } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', userId);

    if (updateError) {
      logger.error(updateError as unknown as Error, { context: 'Profile country auto-update failed' });
      return false;
    }

    setProfileCountryId(detectedCountryId);
    if (newCurrency) setDetectedCurrency(newCurrency);
    // Tell pricing hooks (useDestinationCountry) to re-resolve from the updated profile.
    window.dispatchEvent(new Event('beauzead:location-updated'));
    return true;
  };

  const requestAndApplyLocation = async (forceRefresh = false) => {
    if (locationLoading) return;

    // Signed-in buyers never auto-detect — they always have a profile country.
    // Only an explicit manual click (forceRefresh) is allowed.
    if (!forceRefresh && authRole === 'user' && userId) {
      setLocationError(null);
      return;
    }

    setLocationLoading(true);
    setLocationError(null);

    try {
      const result = await detectLocationWithCaching({ userId, forceRefresh });
      if (result.error || !result.data) {
        // Detection failed: keep showing the profile country (already in locationText).
        setLocationError(result.error || 'Unable to detect your location.');
        return;
      }

      const location = result.data;
      let currencyCode = await resolveCurrencyFromCountry(location.countryCode || '');
      if (!currencyCode && location.country) {
        currencyCode = await resolveCurrencyFromCountry(location.country);
      }
      if (currencyCode) setDetectedCurrency(currencyCode);

      // Signed-in buyer: align profile country with the detected location when different.
      await syncProfileCountryToDetected(location);

      const visibleText = getLocationLabel(location);
      setLocationText(visibleText || 'Location detected');

      onLocationDetected?.(location);
    } catch (error) {
      logger.error(error as Error, { context: 'Location detection failed' });
      setLocationError('Unable to detect your location.');
    } finally {
      setLocationLoading(false);
    }
  };

  useEffect(() => {
    if (!enableLocationAutoDetect) return;

    // Signed-in buyers never auto-detect and never read localStorage — their
    // country comes from the DB profile (shown by the loadProfileCountry effect).
    if (authRole === 'user' && userId) {
      return;
    }

    // Guests only: hydrate the label from the cached detected location.
    const cachedLocation = localStorage.getItem('beauzead_detected_location');
    if (cachedLocation) {
      try {
        const parsed = JSON.parse(cachedLocation) as HeaderDetectedLocation;
        const visibleText = [parsed.city, parsed.state, parsed.country].filter(Boolean).join(', ');
        if (visibleText) {
          setLocationText(visibleText);
        }
      } catch {
        // Ignore invalid cached location
      }
    }

    // Auto-detect location for guests during initial header load.
    void requestAndApplyLocation(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableLocationAutoDetect, userId, authRole]);

  // Check if user is logged in (either user profile or auth user exists)
  const isLoggedIn = user || currentAuthUser;
  const canUseManualCurrencySelector = authRole !== 'seller' && authRole !== 'admin';

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowProfileDropdown(false);
        setShowLoginDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNavigation = (link: string) => {
    setShowProfileDropdown(false);
    setShowMobileMenu(false);
    setLoadingLink(link);
    startNavigation(() => {
      navigate(link);
      setLoadingLink(null);
    });
  };

  const handleSignOut = () => {
    setShowLogoutDialog(true);
  };

  // "Become a Seller" handler.
  // • Web      → open the public seller portal.
  // • Native   → confirm first; on accept, open the public seller URL in the
  //              system browser because the buyer app build excludes seller routes.
  const handleBecomeSellerClick = (e: React.MouseEvent) => {
    if (!isNativePlatform) return; // web: let the anchor navigate normally
    e.preventDefault();
    setShowMobileMenu(false);
    setShowSellerConfirm(true);
  };

  const handleBecomeSellerConfirm = () => {
    setShowSellerConfirm(false);
    // Open the seller portal in a Chrome Custom Tab on native (via
    // @capacitor/browser) because the buyer app build excludes seller routes.
    void openExternalUrl('https://www.bzead.com/seller');
  };

  const handleSignOutConfirm = async () => {
    setIsLoggingOut(true);
    try {
      await signOut();
      setShowProfileDropdown(false);
      setShowMobileMenu(false);
      setShowLogoutDialog(false);
      startNavigation(() => navigate('/'));
    } catch (error) {
      logger.error(error as Error, { context: 'Logout error' });
    } finally {
      setIsLoggingOut(false);
    }
  };

  // Get display name from user
  const getDisplayName = () => {
    if (user?.full_name) return user.full_name;
    if (user?.email) {
      // Extract name from email (before @)
      return user.email.split('@')[0];
    }
    return 'User';
  };

  const getProfilePath = () => {
    return '/profile';
  };

  const getOrdersPath = () => {
    return '/orders';
  };

  const getSettingsPath = () => {
    return '/settings';
  };

  const profilePath = getProfilePath();
  const ordersPath = getOrdersPath();
  const settingsPath = getSettingsPath();

  return (
    <header className="sticky top-0 z-[80] bg-[#1e293b] shadow-md relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            {!logoLoadError ? (
              <img 
                src="/images/logo/logo.png" 
                alt="BZEAD" 
                className="h-10 w-auto object-contain"
                onError={() => setLogoLoadError(true)}
              />
            ) : (
              <span className="text-xl font-bold tracking-wide text-amber-400">BZEAD</span>
            )}
          </Link>

          {/* Desktop Right Side Actions */}
          <div className="hidden md:flex items-center space-x-4">
            {enableLocationAutoDetect && !IS_UK_STOREFRONT && (
              <button
                type="button"
                onClick={() => void requestAndApplyLocation(true)}
                className="max-w-[220px] flex items-center gap-2 text-white hover:text-[#e6c768] transition-all duration-300"
                title={locationError || locationText}
              >
                {locationLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[#D4AF37]" />
                ) : (
                  <MapPin className="h-4 w-4 text-[#D4AF37]" />
                )}
                <span className="text-xs truncate">
                  {locationLoading ? 'Detecting location...' : (locationError || locationText)}
                </span>
              </button>
            )}

            {/* Currency Selector */}
            {!IS_UK_STOREFRONT && (
              <div className="relative">
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className={`h-8 min-w-[88px] appearance-none bg-white text-slate-900 border border-amber-200 rounded-lg px-2 py-1 pr-6 text-xs font-semibold hover:border-amber-400 transition-all duration-300 cursor-pointer ${switchingCurrency ? 'opacity-50 pointer-events-none' : ''}`}
                  disabled={currencyLoading || switchingCurrency || !canUseManualCurrencySelector}
                >
                  {SUPPORTED_CURRENCIES.map((curr) => (
                    <option key={curr.code} value={curr.code}>
                      {curr.symbol} {curr.code}
                    </option>
                  ))}
                </select>
                {(currencyLoading || switchingCurrency) && (
                  <Loader2 className="absolute right-1.5 top-1.5 h-4 w-4 text-[#D4AF37] animate-spin" />
                )}
              </div>
            )}

            {/* Become a Seller Button */}
            <a
              href="https://www.bzead.com/seller"
              onClick={handleBecomeSellerClick}
              className="text-sm font-medium text-white hover:text-amber-300 transition-all duration-300"
            >
              Become a Seller
            </a>

            {/* Wishlist */}
            <button
              onClick={() => {
                if (!isLoggedIn) {
                  navigate('/login');
                } else {
                  handleNavigation('/wishlist');
                }
              }}
              disabled={navigationLoading}
              className="relative p-2 hover:bg-amber-100 rounded-lg transition-all duration-300 disabled:opacity-50"
            >
              {loadingLink === '/wishlist' ? (
                <Loader2 className="h-6 w-6 text-[#D4AF37] animate-spin" />
              ) : (
                <Heart className="h-6 w-6 text-[#D4AF37]" />
              )}
              {wishlistItems.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                  {wishlistItems.length}
                </span>
              )}
            </button>

            {/* Cart */}
            <button
              id="cart-icon"
              onClick={() => {
                if (!isLoggedIn) {
                  navigate('/login');
                } else {
                  handleNavigation('/cart');
                }
              }}
              disabled={navigationLoading}
              className="relative p-2 hover:bg-amber-100 rounded-lg transition-all duration-300 disabled:opacity-50"
            >
              {loadingLink === '/cart' ? (
                <Loader2 className="h-6 w-6 text-[#D4AF37] animate-spin" />
              ) : (
                <ShoppingCart className="h-6 w-6 text-[#D4AF37]" />
              )}
              {isLoggedIn && totalItems > 0 && (
                <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                  {totalItems}
                </span>
              )}
            </button>

            {/* User Profile / Login */}
            {isLoggedIn ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onMouseEnter={() => setShowProfileDropdown(true)}
                  onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg transition-all duration-300 bg-[#D4AF37] hover:bg-[#be9a2c]"
                  disabled={navigationLoading}
                >
                  {navigationLoading && loadingLink?.startsWith('/') ? (
                    <Loader2 className="h-5 w-5 text-white animate-spin" />
                  ) : (
                    <User className="h-5 w-5 text-white" />
                  )}
                  <span className="text-white font-semibold text-sm">
                    Profile
                  </span>
                  <ChevronDown className="h-4 w-4 text-white" />
                </button>

                {showProfileDropdown && (
                  <div 
                    className="absolute right-0 mt-2 w-52 bg-white border border-gray-200 rounded-xl shadow-lg py-2 animate-fadeIn"
                    onMouseLeave={() => setShowProfileDropdown(false)}
                  >
                    <button
                      onClick={() => handleNavigation(ordersPath)}
                      disabled={navigationLoading}
                      className="w-full text-left block px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-all duration-300 disabled:opacity-50 flex items-center gap-2"
                    >
                      {loadingLink === ordersPath ? (
                        <>
                          <Loader2 className="inline h-4 w-4 text-[#D4AF37] animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <Package className="h-4 w-4 text-[#D4AF37]" />
                          My Orders
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleNavigation(profilePath)}
                      disabled={navigationLoading}
                      className="w-full text-left block px-4 py-3 text-sm text-gray-900 hover:bg-gray-50 transition-all duration-300 disabled:opacity-50 flex items-center gap-2"
                    >
                      {loadingLink === profilePath ? (
                        <>
                          <Loader2 className="inline h-4 w-4 text-[#D4AF37] animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <User className="h-4 w-4 text-[#D4AF37]" />
                          Profile
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleNavigation('/notifications')}
                      disabled={navigationLoading}
                      className="w-full text-left block px-4 py-3 text-sm text-gray-900 hover:bg-gray-50 transition-all duration-300 disabled:opacity-50 flex items-center gap-2"
                    >
                      {loadingLink === '/notifications' ? (
                        <>
                          <Loader2 className="h-4 w-4 text-[#D4AF37] animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <Bell className="h-4 w-4 text-[#D4AF37]" />
                          Notifications
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleNavigation(settingsPath)}
                      disabled={navigationLoading}
                      className="w-full text-left block px-4 py-3 text-sm text-gray-900 hover:bg-gray-50 transition-all duration-300 disabled:opacity-50 flex items-center gap-2"
                    >
                      {loadingLink === settingsPath ? (
                        <>
                          <Loader2 className="h-4 w-4 text-[#D4AF37] animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <Settings className="h-4 w-4 text-[#D4AF37]" />
                          Settings
                        </>
                      )}
                    </button>
                    <div className="border-t border-gray-200 my-1"></div>
                    <button
                      onClick={handleSignOut}
                      data-no-global-confirm="true"
                      disabled={navigationLoading}
                      className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-gray-50 hover:text-red-300 transition-all duration-300 disabled:opacity-50 flex items-center gap-2"
                    >
                      {navigationLoading && loadingLink === 'logout' ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Logging out...
                        </>
                      ) : (
                        <>
                          <LogOut className="h-4 w-4" />
                          Logout
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="relative" ref={dropdownRef}>
                <button
                  onMouseEnter={() => setShowLoginDropdown(true)}
                  onClick={() => navigate('/login')}
                  className="bg-amber-500 text-white font-semibold px-6 py-2 rounded-lg hover:bg-amber-600 transition-all duration-300 text-sm shadow-sm"
                >
                  Login
                </button>

                {showLoginDropdown && (
                  <div 
                    className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-lg py-2 animate-fadeIn"
                    onMouseLeave={() => setShowLoginDropdown(false)}
                  >
                    <div className="px-4 py-2 text-xs text-gray-500 font-medium uppercase">
                      Quick Access
                    </div>
                    <Link
                      to="/signup"
                      className="block px-4 py-3 text-sm text-gray-900 hover:bg-gray-50 transition-all duration-300"
                      onClick={() => setShowLoginDropdown(false)}
                    >
                      <User className="inline h-4 w-4 mr-3 text-[#D4AF37]" />
                      Sign Up
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mobile Right Side - Cart, Wishlist, Menu */}
          <div className="flex md:hidden items-center gap-1">
            {enableLocationAutoDetect && !IS_UK_STOREFRONT && (
              <button
                type="button"
                onClick={() => void requestAndApplyLocation(true)}
                className="mobile-header-icon-btn"
                title={locationError || locationText}
                aria-label="Update location"
              >
                {locationLoading ? (
                  <Loader2 className="h-[18px] w-[18px] animate-spin" />
                ) : (
                  <MapPin className="h-[18px] w-[18px]" />
                )}
              </button>
            )}

            <button
              onClick={() => {
                if (!isLoggedIn) {
                  navigate('/login');
                } else if (isNativePlatform) {
                  handleNavigation('/wishlist');
                } else {
                  window.location.href = '/wishlist';
                }
              }}
              className="mobile-header-icon-btn"
              aria-label="Wishlist"
            >
              <Heart className="h-[18px] w-[18px]" />
              {wishlistItems.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-amber-500 text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] px-0.5 flex items-center justify-center leading-none">
                  {wishlistItems.length}
                </span>
              )}
            </button>

            <button
              id="cart-icon"
              onClick={() => {
                if (!isLoggedIn) {
                  navigate('/login');
                } else if (isNativePlatform) {
                  handleNavigation('/cart');
                } else {
                  window.location.href = '/cart';
                }
              }}
              className="mobile-header-icon-btn"
              aria-label="Cart"
            >
              <ShoppingCart className="h-[18px] w-[18px]" />
              {isLoggedIn && totalItems > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-amber-500 text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] px-0.5 flex items-center justify-center leading-none">
                  {totalItems}
                </span>
              )}
            </button>

            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className={`mobile-header-menu-btn ${showMobileMenu ? 'mobile-header-menu-btn--open' : ''}`}
              aria-label={showMobileMenu ? 'Close menu' : 'Open menu'}
              aria-expanded={showMobileMenu}
            >
              {showMobileMenu ? <X className="h-[18px] w-[18px]" /> : <Menu className="h-[18px] w-[18px]" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Panel */}
      {showMobileMenu && (
        <div className="md:hidden absolute left-0 right-0 top-full z-50 px-3 pt-2 pb-3">
          <div className="mobile-menu-panel animate-fadeIn">
            {enableLocationAutoDetect && (
              <button
                type="button"
                onClick={() => void requestAndApplyLocation(true)}
                className="mobile-menu-location-pill"
              >
                {locationLoading ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#D4AF37]" />
                ) : (
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-[#D4AF37]" />
                )}
                <span className="truncate">
                  {locationLoading ? 'Detecting location...' : (locationError || locationText)}
                </span>
              </button>
            )}

            {!IS_UK_STOREFRONT && (
              <div className="mobile-menu-currency-row">
                <span className="mobile-menu-currency-label">Currency</span>
                <div className="relative flex-1">
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className={`mobile-menu-currency-select ${switchingCurrency ? 'opacity-50' : ''}`}
                    disabled={currencyLoading || switchingCurrency || !canUseManualCurrencySelector}
                  >
                    {SUPPORTED_CURRENCIES.map((curr) => (
                      <option key={curr.code} value={curr.code}>
                        {curr.symbol} {curr.code}
                      </option>
                    ))}
                  </select>
                  {(currencyLoading || switchingCurrency) && (
                    <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#D4AF37] animate-spin" />
                  )}
                </div>
              </div>
            )}

            {isLoggedIn ? (
              <>
                <div className="mobile-menu-user-name">{getDisplayName()}</div>
                <div className="mobile-menu-links">
                  <Link
                    to={profilePath}
                    className="mobile-menu-link-row"
                    onClick={() => setShowMobileMenu(false)}
                  >
                    <User className="h-4 w-4 shrink-0 text-[#D4AF37]" />
                    <span className="flex-1">Profile</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-white/40" />
                  </Link>
                  <Link
                    to={ordersPath}
                    className="mobile-menu-link-row"
                    onClick={() => setShowMobileMenu(false)}
                  >
                    <Package className="h-4 w-4 shrink-0 text-[#D4AF37]" />
                    <span className="flex-1">Track Order</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-white/40" />
                  </Link>
                  <Link
                    to="/notifications"
                    className="mobile-menu-link-row"
                    onClick={() => setShowMobileMenu(false)}
                  >
                    <Bell className="h-4 w-4 shrink-0 text-[#D4AF37]" />
                    <span className="flex-1">Notifications</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-white/40" />
                  </Link>
                  <button
                    onClick={handleSignOut}
                    data-no-global-confirm="true"
                    className="mobile-menu-link-row mobile-menu-link-row--danger w-full text-left"
                  >
                    <LogOut className="h-4 w-4 shrink-0" />
                    <span className="flex-1">Log Out</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-white/40" />
                  </button>
                </div>
              </>
            ) : (
              <div className="mobile-menu-auth-row">
                <Link
                  to="/login"
                  className="mobile-menu-login-btn"
                  onClick={() => setShowMobileMenu(false)}
                >
                  Login
                </Link>
                <Link
                  to="/signup"
                  className="mobile-menu-signup-btn"
                  onClick={() => setShowMobileMenu(false)}
                >
                  Sign Up
                </Link>
              </div>
            )}

            <div className="mobile-menu-links">
              <a
                href="https://www.bzead.com/seller"
                className="mobile-menu-link-row"
                onClick={(e) => {
                  if (isNativePlatform) {
                    handleBecomeSellerClick(e);
                  } else {
                    setShowMobileMenu(false);
                  }
                }}
              >
                <Store className="h-4 w-4 shrink-0 text-[#D4AF37]" />
                <span className="flex-1">Become a Seller</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-white/40" />
              </a>
              <Link
                to="/contact"
                className="mobile-menu-link-row"
                onClick={() => setShowMobileMenu(false)}
              >
                <Headphones className="h-4 w-4 shrink-0 text-[#D4AF37]" />
                <span className="flex-1">Help &amp; Support</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-white/40" />
              </Link>
              {!isLoggedIn && (
                <Link
                  to="/login"
                  state={{ from: '/orders' }}
                  className="mobile-menu-link-row"
                  onClick={() => setShowMobileMenu(false)}
                >
                  <Package className="h-4 w-4 shrink-0 text-[#D4AF37]" />
                  <span className="flex-1">Track Order</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-white/40" />
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation Dialog */}
      {showLogoutDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4" onClick={() => !isLoggingOut && setShowLogoutDialog(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-[calc(100vw-2rem)] sm:max-w-sm w-full p-5 sm:p-6 animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Confirm Logout</h2>
              <button onClick={() => setShowLogoutDialog(false)} disabled={isLoggingOut} className="text-gray-400 hover:text-gray-600 disabled:opacity-50 transition-colors"><X size={20} /></button>
            </div>
            <p className="text-gray-500 text-sm mb-6">Are you sure you want to log out of your account?</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowLogoutDialog(false)} disabled={isLoggingOut} className="px-5 py-2.5 text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 font-semibold text-sm transition-all disabled:opacity-50">Cancel</button>
              <button onClick={handleSignOutConfirm} data-no-global-confirm="true" disabled={isLoggingOut} className="px-5 py-2.5 bg-red-500 text-white rounded-xl hover:bg-red-600 font-semibold text-sm transition-all disabled:opacity-50 flex items-center gap-2 min-w-[120px] justify-center">
                {isLoggingOut ? (<><Loader2 size={16} className="animate-spin" /> Logging out...</>) : (<><LogOut size={16} /> Logout</>)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Become a Seller — confirmation (native app only) */}
      {showSellerConfirm && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4"
          onClick={() => setShowSellerConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-[calc(100vw-2rem)] sm:max-w-sm w-full p-5 sm:p-6 animate-in fade-in zoom-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-gray-900">Open Seller Portal?</h2>
              <button
                onClick={() => setShowSellerConfirm(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <p className="text-gray-600 text-sm mb-2">
              The seller dashboard isn't part of the BZEAD buyer app. We'll open it
              in your phone's browser at <span className="font-semibold">bzead.com/seller</span>.
            </p>
            <p className="text-gray-500 text-xs mb-5">
              You can return to this app any time.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowSellerConfirm(false)}
                className="px-5 py-2.5 text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 font-semibold text-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleBecomeSellerConfirm}
                data-no-global-confirm="true"
                className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold text-sm transition-all"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
