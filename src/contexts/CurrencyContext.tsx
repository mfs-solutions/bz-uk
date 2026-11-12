import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import logger from '../utils/logger';
import { fetchExchangeRates, convertAmount, formatCurrency, isExchangeRateUnavailable, resolveCurrencyFromCountry } from '../utils/currency';
import { supabase } from '../lib/supabase';
import { IS_UK_STOREFRONT, STOREFRONT_CURRENCY_CODE } from '../config/market';

interface CurrencyContextType {
  /** The user's active display currency (ISO 4217, e.g. "INR") */
  currency: string;
  /** Manually change the display currency (persists to localStorage) */
  setCurrency: (currency: string) => void;
  /** Apply a location-detected currency — skipped if user has a manual choice */
  setDetectedCurrency: (code: string) => void;
  /** Convert a price from its source currency to the display currency */
  convertPrice: (amount: number, fromCurrency?: string) => number;
  /** Convert + format in one call → ready-to-render string like "₹1,234.00" */
  formatPrice: (amount: number, fromCurrency?: string) => string;
  loading: boolean;
  /** True for a brief period after a manual currency switch (UI transition indicator) */
  switchingCurrency: boolean;
  rates: { [key: string]: number };
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currency, setCurrencyState] = useState<string>(
    IS_UK_STOREFRONT ? STOREFRONT_CURRENCY_CODE : 'USD',
  );
  const [rates, setRates] = useState<{ [key: string]: number }>({});
  const [loading, setLoading] = useState(true);
  const [switchingCurrency, setSwitchingCurrency] = useState(false);

  const resolveCurrencyFromCountryName = useCallback(async (countryNameOrCode: string): Promise<string> => {
    const resolved = await resolveCurrencyFromCountry(countryNameOrCode);
    return resolved || '';
  }, []);

  // ── 1. Detect user's currency from profile → country → currency_code ──
  useEffect(() => {
    if (IS_UK_STOREFRONT) {
      setCurrencyState(STOREFRONT_CURRENCY_CODE);
      return;
    }

    let cancelled = false;

    const detectCurrency = async () => {
      // Priority 0 (ALL users): geo-detected location always wins unless user has
      // manually chosen a currency. This ensures a UK user sees GBP regardless of
      // their profile/KYC country (e.g. Indian seller browsing from UK sees GBP).
      const manualChoiceEarly = localStorage.getItem('beauzead_currency');
      if (!manualChoiceEarly) {
        try {
          const cachedLocation = localStorage.getItem('beauzead_detected_location');
          if (cachedLocation) {
            const parsed = JSON.parse(cachedLocation);
            const locCode = String(parsed.countryCode || '').trim();
            const locName = String(parsed.country || '').trim();
            const geoCurrency = await resolveCurrencyFromCountry(locCode || locName);
            if (!cancelled && geoCurrency) {
              setCurrencyState(geoCurrency);
              return;
            }
          }
        } catch {
          // Ignore — fall through to profile-based detection
        }
      }

      // Check if logged in
      try {
        const { data: { session } } = await supabase.auth.getSession();

        // Guest: wipe any stale manual currency choice so geo-detection runs freely.
        if (!session?.user) {
          localStorage.removeItem('beauzead_currency');
        }

        if (session?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role, country_id, currency')
            .eq('id', session.user.id)
            .maybeSingle();

          const role = String(profile?.role || session.user.user_metadata?.role || 'user');

          // Manual selector overrides everything for logged-in users
          const manualChoice = localStorage.getItem('beauzead_currency');
          if (manualChoice) {
            setCurrencyState(manualChoice);
            return;
          }

          // Seller: use KYC country as fallback (geo already handled above)
          if (role === 'seller') {
            let sellerCurrency = '';

            const { data: kycRow } = await supabase
              .from('seller_kyc')
              .select('kyc_status, business_country, country')
              .eq('seller_id', session.user.id)
              .maybeSingle();

            const kycCountry = String(kycRow?.business_country || kycRow?.country || '').trim();
            if (String(kycRow?.kyc_status || '').toLowerCase() === 'approved' && kycCountry) {
              sellerCurrency = await resolveCurrencyFromCountryName(kycCountry);
            }

            if (!sellerCurrency && profile?.country_id) {
              const { data: country } = await supabase
                .from('countries')
                .select('currency_code')
                .eq('id', profile.country_id)
                .maybeSingle();
              sellerCurrency = String(country?.currency_code || '').toUpperCase();
            }

            if (!cancelled) {
              setCurrencyState(sellerCurrency || 'USD');
            }
            return;
          }

          // Buyer priority order (after geo which is Priority 0 above):
          // 1. Profile / signup country (what they told us when registering)
          // 2. Default shipping address country
          // 3. User metadata currency
          // 4. USD fallback

          // Buyer: profile currency saved at signup time (direct column — no extra join needed)
          let resolvedCurrency = String(profile?.currency || '').toUpperCase();

          // Fallback: derive from profile country_id if currency column is empty
          if (!resolvedCurrency && profile?.country_id) {
            const { data: country } = await supabase
              .from('countries')
              .select('currency_code')
              .eq('id', profile.country_id)
              .maybeSingle();
            resolvedCurrency = String(country?.currency_code || '').toUpperCase();
          }

          if (!cancelled && resolvedCurrency) {
            setCurrencyState(resolvedCurrency);
            return;
          }

          // Buyer: default shipping address country (fallback if no profile country)
          const { data: defaultAddress } = await supabase
            .from('user_addresses')
            .select('country')
            .eq('user_id', session.user.id)
            .eq('is_default', true)
            .limit(1)
            .maybeSingle();

          const defaultAddressCountryCurrency = await resolveCurrencyFromCountryName(defaultAddress?.country || '');
          if (!cancelled && defaultAddressCountryCurrency) {
            setCurrencyState(defaultAddressCountryCurrency);
            return;
          }

          const metaCurrency = String(session.user.user_metadata?.currency || '').toUpperCase();
          if (!cancelled && metaCurrency) {
            setCurrencyState(metaCurrency);
            return;
          }
        }
      } catch (err) {
        // Non-critical — just keep current default
        logger.log('Currency auto-detect skipped', err);
      }

      // Final fallback: USD
      if (!cancelled) setCurrencyState('USD');
    };

    detectCurrency();

    // Re-detect when auth state changes (login / logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        // Logged out (guest) → re-run detection (uses location-based currency)
        detectCurrency();
        return;
      }
      // Logged in → re-run detection
      detectCurrency();
    });

    const handleFocus = () => { void detectCurrency(); };
    // Re-detect immediately when location is saved in this tab by Header/locationService.
    // This ensures currency switches to GBP the moment geolocation/IP detection completes,
    // without waiting for a window focus event.
    const handleLocationUpdated = () => { void detectCurrency(); };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('beauzead:location-updated', handleLocationUpdated);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('beauzead:location-updated', handleLocationUpdated);
    };
  }, [resolveCurrencyFromCountryName]);

  // ── 2. Fetch exchange rates on mount + hourly refresh ─────────────────
  useEffect(() => {
    const loadRates = async () => {
      setLoading(true);
      try {
        const fetchedRates = await fetchExchangeRates();
        setRates(fetchedRates);
      } catch (error) {
        logger.error(error as Error, { context: 'Failed to load exchange rates' });
      } finally {
        setLoading(false);
      }
    };

    loadRates();
    const interval = setInterval(loadRates, 3600000);
    return () => clearInterval(interval);
  }, []);

  // ── 3. Manual currency change (persists to localStorage) ──────────────
  const setCurrency = (newCurrency: string) => {
    if (IS_UK_STOREFRONT) return;
    if (newCurrency === currency) return;
    setSwitchingCurrency(true);
    setCurrencyState(newCurrency);
    localStorage.setItem('beauzead_currency', newCurrency);
  };

  // Auto-clear switching flag after brief transition
  useEffect(() => {
    if (!switchingCurrency) return;
    const timer = setTimeout(() => setSwitchingCurrency(false), 350);
    return () => clearTimeout(timer);
  }, [switchingCurrency]);

  // ── 3b. Location-detected currency (state only — does NOT persist) ──────
  // Skipped when the user has manually chosen a currency via the selector.
  const setDetectedCurrency = useCallback((code: string) => {
    if (IS_UK_STOREFRONT) return;
    if (!code) return;
    const manualChoice = localStorage.getItem('beauzead_currency');
    if (manualChoice) return; // respect user's explicit selection
    setCurrencyState(code);
  }, []);

  // ── 4. Conversion helper ──────────────────────────────────────────────
  const convertPrice = useCallback(
    (amount: number, fromCurrency: string = 'INR'): number => {
      if (!Number.isFinite(amount)) return IS_UK_STOREFRONT ? Number.NaN : 0;
      if (amount === 0) return 0;
      const sourceCurrency = (fromCurrency || 'INR').toUpperCase();
      const targetCurrency = (currency || 'INR').toUpperCase();

      if (IS_UK_STOREFRONT) {
        return convertAmount(amount, sourceCurrency, STOREFRONT_CURRENCY_CODE, rates);
      }

      if (isExchangeRateUnavailable()) return amount;
      if (sourceCurrency === targetCurrency) return amount;
      if (!rates[targetCurrency] || !rates[sourceCurrency]) return amount;
      return convertAmount(amount, sourceCurrency, targetCurrency, rates);
    },
    [currency, rates],
  );

  // ── 5. Convert + format helper ────────────────────────────────────────
  const formatPriceFn = useCallback(
    (amount: number, fromCurrency: string = 'INR'): string => {
      const sourceCurrency = (fromCurrency || 'INR').toUpperCase();
      const targetCurrency = (currency || 'INR').toUpperCase();

      if (IS_UK_STOREFRONT) {
        const converted = convertPrice(amount, sourceCurrency);
        return Number.isFinite(converted)
          ? formatCurrency(converted, STOREFRONT_CURRENCY_CODE)
          : 'GBP price unavailable';
      }

      if (isExchangeRateUnavailable()) {
        return formatCurrency(amount, sourceCurrency);
      }
      const converted = convertPrice(amount, sourceCurrency);
      return formatCurrency(converted, targetCurrency);
    },
    [convertPrice, currency],
  );

  const value = {
    currency,
    setCurrency,
    setDetectedCurrency,
    convertPrice,
    formatPrice: formatPriceFn,
    loading,
    switchingCurrency,
    rates,
  };

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
};

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
};
