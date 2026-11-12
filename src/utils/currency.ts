// ============================================================
// CURRENCY UTILITY — Exchange rates, conversion & formatting
// ============================================================

import { supabase } from '../lib/supabase.ts';
import { IS_UK_STOREFRONT, STOREFRONT_CURRENCY_CODE } from '../config/market.ts';
import { runtimeEnv } from '../lib/runtimeEnv.ts';

type CountryCurrencyRow = {
  country_name: string | null;
  short_code: string | null;
  country_code: string | null;
  currency_code: string | null;
  iso2: string | null;
};

const DEFAULT_CURRENCY = 'INR';
const COUNTRY_CACHE_TTL_MS = 10 * 60 * 1000;

let countryCurrencyIndex: Record<string, string> = {};
let countryCurrencyLastLoad = 0;
let countryCurrencyLoadInFlight: Promise<void> | null = null;

const normalizeCountryToken = (value: string): string =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[.]/g, '')
    .replace(/\s+/g, ' ');

const compactCountryToken = (value: string): string => normalizeCountryToken(value).replace(/[^A-Z0-9]/g, '');

const isValidCurrencyCode = (value: string): boolean =>
  (IS_UK_STOREFRONT && value === STOREFRONT_CURRENCY_CODE)
  || SUPPORTED_CURRENCIES.some((item) => item.code === value);

const buildCountryCurrencyIndex = (rows: CountryCurrencyRow[]) => {
  const next: Record<string, string> = {};

  rows.forEach((row) => {
    const currencyCode = String(row.currency_code || '').trim().toUpperCase();
    if (!currencyCode) return;

    const variants = [
      String(row.country_name || ''),
      String(row.short_code || ''),
      String(row.country_code || ''),
      String(row.iso2 || ''),
    ];

    variants.forEach((variant) => {
      const normalized = normalizeCountryToken(variant);
      if (normalized) {
        next[normalized] = currencyCode;
      }

      const compact = compactCountryToken(variant);
      if (compact) {
        next[compact] = currencyCode;
      }
    });
  });

  countryCurrencyIndex = next;
  countryCurrencyLastLoad = Date.now();
};

const ensureCountryCurrencyIndex = async () => {
  const isFresh = Date.now() - countryCurrencyLastLoad < COUNTRY_CACHE_TTL_MS;
  if (isFresh && Object.keys(countryCurrencyIndex).length > 0) return;

  if (!countryCurrencyLoadInFlight) {
    countryCurrencyLoadInFlight = (async () => {
      const { data } = await supabase
        .from('countries')
        .select('country_name, short_code, country_code, currency_code, iso2')
        .eq('is_active', true);

      buildCountryCurrencyIndex(Array.isArray(data) ? (data as CountryCurrencyRow[]) : []);
    })().finally(() => {
      countryCurrencyLoadInFlight = null;
    });
  }

  await countryCurrencyLoadInFlight;
};

/** Resolve currency code from a country code (alpha-2 or alpha-3) or currency code directly */
export function currencyForCountry(countryOrCode: string): string {
  if (!countryOrCode) return DEFAULT_CURRENCY;
  const upper = countryOrCode.toUpperCase().trim();
  // If already a known currency code, return it
  if (isValidCurrencyCode(upper)) return upper;
  return DEFAULT_CURRENCY;
}

export async function resolveCurrencyFromCountry(countryOrCode: string): Promise<string> {
  const token = String(countryOrCode || '').trim();
  if (!token) return '';

  const upper = token.toUpperCase();
  if (isValidCurrencyCode(upper)) return upper;

  await ensureCountryCurrencyIndex();

  const normalized = normalizeCountryToken(token);
  const compact = compactCountryToken(token);

  return countryCurrencyIndex[normalized] || countryCurrencyIndex[compact] || '';
}

// ─── Supported currencies shown in the selector ──────────────────────────
export const SUPPORTED_CURRENCIES = [
  { code: 'INR', symbol: '₹',  name: 'Indian Rupee' },
  { code: 'USD', symbol: '$',  name: 'US Dollar' },
  { code: 'EUR', symbol: '€',  name: 'Euro' },
  { code: 'GBP', symbol: '£',  name: 'British Pound' },
  { code: 'JPY', symbol: '¥',  name: 'Japanese Yen' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'SAR', symbol: '﷼',  name: 'Saudi Riyal' },
];

// ─── Exchange rates ───────────────────────────────────────────────────────

interface ExchangeRates { [key: string]: number; }

let cachedRates: ExchangeRates = {};
let lastFetch: number = 0;
const CACHE_DURATION = 3600000;        // 1 hour — matches pg_cron refresh cycle
const RETRY_AFTER_FAILURE_MS = 60_000; // shorter retry window when all sources fail

const hasUsableRates = (rates: ExchangeRates): boolean => (
  Object.values(rates || {}).some((value) => Number.isFinite(Number(value)) && Number(value) > 0)
);

// Supabase project config — used for DB query and Edge Function fallback
const SUPABASE_URL = (runtimeEnv.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = runtimeEnv.VITE_SUPABASE_ANON_KEY || '';
const EDGE_FN_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/exchange-rates` : '';
// Live-rate public fallback — used only when DB is unreachable
const PUBLIC_FALLBACK_URL = 'https://open.er-api.com/v6/latest/USD';

export const fetchExchangeRates = async (): Promise<ExchangeRates> => {
  const now = Date.now();
  if (hasUsableRates(cachedRates) && (now - lastFetch) < CACHE_DURATION) return cachedRates;

  // ── Primary: countries table exchange_rate column (kept fresh by pg_cron hourly) ──
  // Try up to 2 times before falling back to live API.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { data, error } = await supabase
        .from('countries')
        .select('currency_code, exchange_rate')
        .eq('is_active', true)
        .not('exchange_rate', 'is', null);

      if (!error && Array.isArray(data) && data.length > 0) {
        const rates: ExchangeRates = {};
        for (const row of data as Array<{ currency_code: string; exchange_rate: number }>) {
          const code = String(row.currency_code || '').trim().toUpperCase();
          const rate = Number(row.exchange_rate);
          if (code && Number.isFinite(rate) && rate > 0 && !rates[code]) {
            rates[code] = rate;
          }
        }
        if (hasUsableRates(rates)) {
          cachedRates = rates;
          lastFetch = now;
          return cachedRates;
        }
      }
    } catch {
      // retry or fall through to live API
    }
  }

  // ── Fallback: live exchange rate APIs (DB temporarily unreachable) ──
  const urlsToTry: { url: string; headers?: Record<string, string>; ratesKey: string }[] = [];
  if (EDGE_FN_URL) {
    urlsToTry.push({ url: EDGE_FN_URL, headers: { apikey: SUPABASE_ANON_KEY }, ratesKey: 'rates' });
  }
  urlsToTry.push({ url: PUBLIC_FALLBACK_URL, ratesKey: 'rates' });

  for (const { url, headers, ratesKey } of urlsToTry) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: headers || {} });
      if (!res.ok) continue;
      const json = await res.json();
      const rates = json[ratesKey] || json.conversion_rates || json.rates;
      if (rates && typeof rates === 'object' && rates.USD) {
        cachedRates = rates;
        lastFetch = now;
        return cachedRates;
      }
    } catch {
      // try next provider
    }
  }

  // All sources failed — retain last known rates if any, never hardcode values
  lastFetch = now - CACHE_DURATION + RETRY_AFTER_FAILURE_MS; // retry after 60 s
  return hasUsableRates(cachedRates) ? cachedRates : {};
};

/** Returns true only when there are no usable rates for conversion. */
export const isExchangeRateUnavailable = (): boolean => !hasUsableRates(cachedRates);

export const hasCurrencyRate = (currencyCode: string, rates: ExchangeRates): boolean => {
  const rate = Number(rates[String(currencyCode || '').trim().toUpperCase()]);
  return Number.isFinite(rate) && rate > 0;
};

export function convertAmountStrict(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: ExchangeRates,
): number | null {
  if (!Number.isFinite(amount)) return null;

  const fromCode = String(fromCurrency || '').trim().toUpperCase();
  const toCode = String(toCurrency || '').trim().toUpperCase();
  if (!fromCode || !toCode) return null;
  if (fromCode === toCode) return amount;
  if (!hasCurrencyRate(fromCode, rates) || !hasCurrencyRate(toCode, rates)) return null;

  const inUSD = fromCode === 'USD' ? amount : amount / rates[fromCode];
  const converted = toCode === 'USD' ? inUSD : inUSD * rates[toCode];
  return Number.isFinite(converted) ? converted : null;
}

// ─── Synchronous conversion (uses cached rates from context) ─────────────

/** Convert an amount between currencies using pre-fetched rates.
 *  Returns the original amount if conversion is impossible (no silent errors). */
export function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: ExchangeRates,
): number {
  if (IS_UK_STOREFRONT) {
    return convertAmountStrict(amount, fromCurrency, toCurrency, rates) ?? Number.NaN;
  }

  if (!Number.isFinite(amount) || amount === 0) return 0;
  const fromCode = (fromCurrency || 'INR').toUpperCase().trim();
  const toCode = (toCurrency || 'INR').toUpperCase().trim();
  if (fromCode === toCode) return amount;

  const from = rates[fromCode];
  const to = rates[toCode];
  if (!from || !to || from <= 0 || to <= 0) return amount;
  const inUSD = fromCode === 'USD' ? amount : amount / from;
  const result = toCode === 'USD' ? inUSD : inUSD * to;
  return result;
}

// ─── Async conversion (fetches rates if needed) ──────────────────────────

export const convertCurrency = async (
  amount: number,
  fromCurrency: string,
  toCurrency: string,
): Promise<number> => {
  if (fromCurrency === toCurrency) return amount;
  const rates = await fetchExchangeRates();
  return convertAmount(amount, fromCurrency, toCurrency, rates);
};

// ─── Formatting ──────────────────────────────────────────────────────────

/** Format a price with the correct currency symbol & locale formatting.
 *  Uses Intl.NumberFormat for accurate symbol placement & decimal handling. */
export const formatCurrency = (amount: number, currencyCode: string): string => {
  const normalizedCurrency = String(currencyCode || '').trim().toUpperCase();
  if (['GBP', 'MVR'].includes(normalizedCurrency) && !Number.isFinite(amount)) {
    return `${normalizedCurrency} price unavailable`;
  }

  try {
    const locale = normalizedCurrency === 'GBP' ? 'en-GB' : normalizedCurrency === 'MVR' ? 'en-MV' : 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: normalizedCurrency,
      minimumFractionDigits: normalizedCurrency === 'JPY' || normalizedCurrency === 'KRW' ? 0 : 2,
      maximumFractionDigits: normalizedCurrency === 'JPY' || normalizedCurrency === 'KRW' ? 0 : 2,
    }).format(amount);
  } catch {
    // If the currency code is invalid, fall back to plain number + code
    return `${normalizedCurrency} ${amount.toFixed(2)}`;
  }
};

/** Convenience: convert + format in one call */
export function formatPrice(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: ExchangeRates,
): string {
  const converted = convertAmount(amount, fromCurrency, toCurrency, rates);
  return formatCurrency(converted, toCurrency);
}
