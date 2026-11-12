import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  convertAmount,
  fetchExchangeRates,
  formatCurrency,
  resolveCurrencyFromCountry,
} from '../utils/currency';

const DEFAULT_SELLER_CURRENCY = 'INR';

type ExchangeRates = Record<string, number>;

export const useSellerDisplayCurrency = (sellerId?: string) => {
  const [sellerCurrency, setSellerCurrency] = useState<string>(DEFAULT_SELLER_CURRENCY);
  const [rates, setRates] = useState<ExchangeRates>({});

  useEffect(() => {
    let alive = true;

    const loadSellerCurrency = async () => {
      if (!sellerId) {
        setSellerCurrency(DEFAULT_SELLER_CURRENCY);
        return;
      }

      try {
        const [kycRes, profileRes] = await Promise.all([
          supabase
            .from('seller_kyc')
            .select('business_country, country')
            .eq('seller_id', sellerId)
            .maybeSingle(),
          supabase
            .from('profiles')
            .select('country_id')
            .eq('id', sellerId)
            .maybeSingle(),
        ]);

        const kycCountryName = String(
          kycRes.data?.business_country || kycRes.data?.country || '',
        ).trim();

        let resolved = '';
        if (kycCountryName) {
          resolved = await resolveCurrencyFromCountry(kycCountryName);
        }

        if (!resolved && profileRes.data?.country_id) {
          const { data: countryRow } = await supabase
            .from('countries')
            .select('currency_code')
            .eq('id', profileRes.data.country_id)
            .maybeSingle();
          resolved = String(countryRow?.currency_code || '').trim().toUpperCase();
        }

        if (alive) {
          setSellerCurrency(resolved || DEFAULT_SELLER_CURRENCY);
        }
      } catch {
        if (alive) setSellerCurrency(DEFAULT_SELLER_CURRENCY);
      }
    };

    void loadSellerCurrency();

    return () => {
      alive = false;
    };
  }, [sellerId]);

  useEffect(() => {
    let alive = true;

    const loadRates = async () => {
      try {
        const loaded = await fetchExchangeRates();
        if (alive) setRates(loaded || {});
      } catch {
        if (alive) setRates({});
      }
    };

    void loadRates();

    return () => {
      alive = false;
    };
  }, []);

  const convertToSellerCurrency = useCallback(
    (amount: number, sourceCurrency: string = 'INR'): number => {
      const safeAmount = Number(amount || 0);
      if (!Number.isFinite(safeAmount) || safeAmount === 0) return 0;

      const from = String(sourceCurrency || 'INR').trim().toUpperCase();
      const to = String(sellerCurrency || DEFAULT_SELLER_CURRENCY).trim().toUpperCase();

      if (from === to) return safeAmount;
      return convertAmount(safeAmount, from, to, rates);
    },
    [rates, sellerCurrency],
  );

  const formatSellerAmount = useCallback(
    (amount: number, sourceCurrency: string = 'INR'): string => {
      const converted = convertToSellerCurrency(amount, sourceCurrency);
      const currencyCode = String(sellerCurrency || DEFAULT_SELLER_CURRENCY).trim().toUpperCase();
      return formatCurrency(converted, currencyCode);
    },
    [convertToSellerCurrency, sellerCurrency],
  );

  return {
    sellerCurrency: String(sellerCurrency || DEFAULT_SELLER_CURRENCY).trim().toUpperCase(),
    convertToSellerCurrency,
    formatSellerAmount,
  };
};
