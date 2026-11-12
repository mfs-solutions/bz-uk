import { useState, useEffect, useRef, useCallback } from 'react';
import { getUserAddresses } from '../lib/adminService';
import {
  fetchProductTat,
  checkDeliveryServiceability,
  estimateCarrierTat,
  isIndianPincode,
  isIndiaCountry,
  resolveCountryToISO2,
  type TatResult,
  type ServiceabilityResult,
  type DeliveryProvider,
} from '../lib/tatService';
import { checkInternationalServiceability } from '../lib/shiprocketOpsService';
import { supabase } from '../lib/supabase';
import type { UserAddress } from '../types';

type RateCardCountryRow = {
  id: string;
  country_name: string | null;
  country_code: string | null;
  short_code: string | null;
  iso2: string | null;
};

type PodShippingRateRow = {
  weight_band_unit: string | null;
  weight_band_from: number | string | null;
  weight_band_to: number | string | null;
  standard_est_delivery_date: string | null;
};

const normalizeCountryToken = (value: string) => String(value || '').trim().toUpperCase().replace(/\s+/g, '');

const COUNTRY_TOKEN_ALIASES: Record<string, string[]> = {
  IN: ['IN', 'IND', 'INDIA'],
  GB: ['GB', 'GBR', 'UK', 'UNITEDKINGDOM', 'ENGLAND', 'SCOTLAND', 'WALES', 'NORTHERNIRELAND'],
  IE: ['IE', 'IRL', 'IRELAND'],
};

const buildCountryTokenSet = (...values: Array<string | null | undefined>): Set<string> => {
  const tokens = new Set<string>();
  for (const value of values) {
    const token = normalizeCountryToken(String(value || ''));
    if (!token) continue;
    tokens.add(token);

    // Expand aliases for known ISO-2/ISO-3/name mismatches (for example GB vs GBR, IE vs IRL).
    const iso2 = normalizeCountryToken(resolveCountryToISO2(token, token));
    if (iso2) {
      const aliasGroup = COUNTRY_TOKEN_ALIASES[iso2];
      if (Array.isArray(aliasGroup)) {
        for (const alias of aliasGroup) tokens.add(alias);
      }
    }
  }
  return tokens;
};

const convertKgToRateUnit = (weightKg: number, unitCode: string): number => {
  const unit = String(unitCode || '').trim().toUpperCase();
  if (!Number.isFinite(weightKg) || weightKg <= 0) return 0;
  if (unit === 'GM' || unit === 'G') return weightKg * 1000;
  if (unit === 'LB') return weightKg / 0.453592;
  if (unit === 'OZ') return weightKg / 0.0283495;
  return weightKg;
};

const parseEtaDays = (etaText: string): number => {
  const text = String(etaText || '').trim();
  if (!text) return 0;
  const rangeMatch = text.match(/(\d+)\s*(?:-|to)\s*(\d+)/i);
  if (rangeMatch) {
    return Math.max(Number(rangeMatch[1]), Number(rangeMatch[2]));
  }
  const singleMatch = text.match(/(\d+)/);
  return singleMatch ? Number(singleMatch[1]) : 0;
};

const fetchIndiaDestinationRateCardEta = async (
  weightKg: number,
  destinationCountry: string,
): Promise<{ days: number } | null> => {
  try {
    const destinationTokens = buildCountryTokenSet(destinationCountry);
    if (destinationTokens.size === 0) return null;

    const { data: countries, error: countriesError } = await supabase
      .from('countries')
      .select('id, country_name, country_code, short_code, iso2')
      .eq('is_active', true);

    if (countriesError || !Array.isArray(countries) || countries.length === 0) {
      return null;
    }

    const countryRows = countries as RateCardCountryRow[];
    const indiaTokens = buildCountryTokenSet('IN', 'IND', 'INDIA');
    const india = countryRows.find((country) => {
      const rowTokens = buildCountryTokenSet(country.iso2, country.country_code, country.short_code, country.country_name);
      for (const token of rowTokens) {
        if (indiaTokens.has(token)) return true;
      }
      return false;
    });
    const destination = countryRows.find((country) => {
      const rowTokens = buildCountryTokenSet(country.iso2, country.country_code, country.short_code, country.country_name);
      for (const token of rowTokens) {
        if (destinationTokens.has(token)) return true;
      }
      return false;
    });

    if (!india?.id || !destination?.id) {
      return null;
    }

    const { data: rates, error: ratesError } = await supabase
      .from('product_origin_destination_shipping_rates')
      .select('weight_band_unit, weight_band_from, weight_band_to, standard_est_delivery_date')
      .eq('product_origin_country_id', india.id)
      .eq('destination_country_id', destination.id)
      .order('weight_band_from', { ascending: true });

    if (ratesError || !Array.isArray(rates) || rates.length === 0) {
      return null;
    }

    const rows = rates as PodShippingRateRow[];
    const normalizedWeightKg = weightKg > 0 ? weightKg : 0.1;
    const matched = rows.find((row) => {
      const unit = String(row.weight_band_unit || 'KG').toUpperCase();
      const fromValue = Number(row.weight_band_from || 0);
      const toValue = Number(row.weight_band_to || 0);
      const convertedWeight = convertKgToRateUnit(normalizedWeightKg, unit);
      return convertedWeight >= fromValue && convertedWeight <= toValue;
    }) || rows[rows.length - 1];

    const parsedDays = parseEtaDays(String(matched.standard_est_delivery_date || ''));
    if (parsedDays <= 0) return null;
    return { days: parsedDays };
  } catch {
    return null;
  }
};

export interface DeliveryEstimateState {
  /** Currently selected address (null for guests / no addresses) */
  address: UserAddress | null;
  /** All user addresses, default first */
  addresses: UserAddress[];
  /** Pincode entered manually (guest) or from selected address */
  pincode: string;
  /** Country resolved from address or detection */
  country: string;
  /** TAT result (null = not checked yet) */
  tat: TatResult | null;
  /** Serviceability result (null = not checked yet) */
  serviceability: ServiceabilityResult | null;
  /** Which carrier handles this route */
  carrier: DeliveryProvider | null;
  /** Whether a check is in progress */
  loading: boolean;
  /** Error message for the last check */
  error: string | null;
}

export interface UseDeliveryEstimateReturn extends DeliveryEstimateState {
  /** Select a different address from the list */
  selectAddress: (addressId: string) => void;
  /** Manually update pincode (for guest users) */
  setPincode: (value: string) => void;
  /** Manually update destination country (for guest users) */
  setCountry: (value: string) => void;
  /** Trigger a manual delivery check */
  checkDelivery: () => Promise<void>;
}

export function useDeliveryEstimate(
  productId: string | undefined,
  userId: string | undefined,
  productOriginCountry?: string,
  shipsInternationally?: boolean,
  productSellerId?: string,
  productWeightKg?: number,
): UseDeliveryEstimateReturn {
  const [addresses, setAddresses] = useState<UserAddress[]>([]);
  const [address, setAddress] = useState<UserAddress | null>(null);
  const [pincode, setPincodeRaw] = useState('');
  const [country, setCountryRaw] = useState('');
  const [tat, setTat] = useState<TatResult | null>(null);
  const [serviceability, setServiceability] = useState<ServiceabilityResult | null>(null);
  const [carrier, setCarrier] = useState<DeliveryProvider | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoChecked = useRef(false);
  const addressesLoaded = useRef(false);

  /* ── Load addresses once ── */
  useEffect(() => {
    if (!userId || addressesLoaded.current) return;
    let cancelled = false;

    (async () => {
      const { data } = await getUserAddresses(userId);
      if (cancelled) return;
      addressesLoaded.current = true;
      const list = (data || []) as UserAddress[];
      setAddresses(list);
      const defaultAddr = list.find((a) => a.is_default) || list[0] || null;
      if (defaultAddr) {
        setAddress(defaultAddr);
        setPincodeRaw(defaultAddr.postal_code || '');
        setCountryRaw(defaultAddr.country || '');
      }
    })();

    return () => { cancelled = true; };
  }, [userId]);

  /* ── Guest fallback: detected location ── */
  useEffect(() => {
    if (userId || pincode) return;
    try {
      const stored = localStorage.getItem('beauzead_detected_location');
      if (stored) {
        const loc = JSON.parse(stored);
        if (loc.postalCode) setPincodeRaw(String(loc.postalCode));
        if (loc.country) setCountryRaw(String(loc.country));
      }
    } catch { /* ignore */ }
  }, [userId, pincode]);

  /* ── Core check: carrier-routed ── */
  const runCheck = useCallback(async (
    pin: string,
    buyerCountry: string,
    originCountry: string,
    pId: string,
    uId: string,
  ) => {
    setLoading(true);
    setError(null);
    setServiceability(null);
    setTat(null);
    setCarrier(null);

    try {
      const buyerISO = resolveCountryToISO2(buyerCountry) || buyerCountry;
      const originISO = resolveCountryToISO2(originCountry) || originCountry;
      const originIsIndia = isIndiaCountry(originISO);
      const buyerIsIndia = isIndiaCountry(buyerISO);
      const buyerCountryKnown = Boolean(String(buyerISO || '').trim());
      const pinLooksIndian = isIndianPincode(pin);

      // Route by origin country
      const provider: DeliveryProvider = originIsIndia
        ? 'shiprocket'
        : 'shippo';
      setCarrier(provider);

      // For API calls, use product's seller ID (always available from DB)
      const effectiveSellerId = productSellerId || uId || '';
      const shiprocketDomesticLane = provider === 'shiprocket'
        && (buyerCountryKnown ? buyerIsIndia : pinLooksIndian);

      if (shiprocketDomesticLane) {
        /* ── Shiprocket: India domestic — serviceability + TAT ── */
        const svc = await checkDeliveryServiceability(pin, effectiveSellerId);
        setServiceability(svc);
        if (svc.serviceable) {
          const result = await fetchProductTat(pId, pin, effectiveSellerId);
          setTat(result);
        }
      } else if (provider === 'shiprocket') {
        /* ── Shiprocket: India → International — live serviceability ── */
        if (!shipsInternationally) {
          setServiceability({ serviceable: false, international: true });
          return;
        }

        const weight = productWeightKg && productWeightKg > 0 ? productWeightKg : 0.5;

        if (originIsIndia) {
          const rateCardEta = await fetchIndiaDestinationRateCardEta(weight, buyerISO || buyerCountry);
          if (rateCardEta) {
            const etaDate = new Date();
            etaDate.setDate(etaDate.getDate() + rateCardEta.days);
            setServiceability({ serviceable: true, international: true });
            setTat({
              tatDays: rateCardEta.days,
              expectedDeliveryDate: etaDate.toISOString().split('T')[0],
            });
            return;
          }
        }

        // Resolve seller pickup pincode for Shiprocket call
        const buyerCountryISO = buyerISO.length === 2 ? buyerISO : '';

        if (effectiveSellerId && buyerCountryISO) {
          try {
            // Fetch seller pickup postal code from DB
            const { data: kycData } = await supabase
              .from('seller_kyc')
              .select('business_postal_code')
              .eq('seller_id', effectiveSellerId)
              .maybeSingle();
            const pickupPin = kycData?.business_postal_code || '';

            if (pickupPin) {
              const srResult = await checkInternationalServiceability({
                sellerId: effectiveSellerId,
                requestData: {
                  pickup_postcode: pickupPin,
                  delivery_country: buyerCountryISO,
                  weight,
                  cod: 0,
                },
              });

              if (!srResult.error && srResult.data) {
                const payload = srResult.data as Record<string, unknown>;
                const couriers = (payload as any)?.data?.available_courier_companies as Array<Record<string, unknown>> | undefined;
                if (Array.isArray(couriers) && couriers.length > 0) {
                  // Pick the fastest courier's estimated delivery days
                  const fastest = couriers.reduce((best, c) => {
                    const days = Number(c.estimated_delivery_days || c.etd_days || 999);
                    return days < best ? days : best;
                  }, 999);
                  if (fastest < 999) {
                    setServiceability({ serviceable: true, international: true });
                    const dt = new Date();
                    dt.setDate(dt.getDate() + fastest);
                    setTat({ tatDays: fastest, expectedDeliveryDate: dt.toISOString().split('T')[0] });
                    return;
                  }
                }
              }
            }
          } catch {
            // Fall through to carrier estimate if live call fails
          }
        }

        // Fallback: Shiprocket live call failed or missing data — use carrier estimate
        setServiceability({ serviceable: true, international: true });
        setTat(estimateCarrierTat('shiprocket', false));

      } else {
        /* ── Shippo: non-India origin ── */
        /* Shippo get_rates requires full buyer address (street, city, country)
           which we don't have at PDP stage — only a pincode.
           Use carrier delivery window estimate. */
        const domestic = buyerISO === originISO;
        if (domestic) {
          setServiceability({ serviceable: true });
          setTat(estimateCarrierTat('shippo', true));
        } else if (shipsInternationally) {
          setServiceability({ serviceable: true, international: true });
          setTat(estimateCarrierTat('shippo', false));
        } else {
          setServiceability({ serviceable: false, international: true });
        }
      }
    } catch {
      setError('Unable to check delivery at this time');
      setTat(null);
    } finally {
      setLoading(false);
    }
  }, [shipsInternationally, productSellerId, productWeightKg]);

  /* ── Auto-check once when address/pincode + product are ready ── */
  /* Only auto-check for logged-in users (address from DB).
     Guests get their pincode from IP detection which is unreliable —
     they must click "Check" manually. */
  useEffect(() => {
    if (!userId || !productId || !pincode || pincode.trim().length < 3 || autoChecked.current) return;
    autoChecked.current = true;
    runCheck(pincode.trim(), country, productOriginCountry || '', productId, userId);
  }, [productId, pincode, country, productOriginCountry, userId, runCheck]);

  /* ── Re-check when shipsInternationally changes (product data loaded) ── */
  useEffect(() => {
    if (!userId || shipsInternationally === undefined || !autoChecked.current) return;
    if (!productId || !pincode || pincode.trim().length < 3) return;
    runCheck(pincode.trim(), country, productOriginCountry || '', productId, userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipsInternationally]);

  /* ── Public: Select an address ── */
  const selectAddress = useCallback((addressId: string) => {
    const found = addresses.find((a) => a.id === addressId);
    if (!found) return;
    setAddress(found);
    setPincodeRaw(found.postal_code || '');
    setCountryRaw(found.country || '');
    setTat(null);
    setServiceability(null);
    setCarrier(null);
    setError(null);
    autoChecked.current = false;
  }, [addresses]);

  /* ── Public: Manual pincode entry (guest) ── */
  const setPincode = useCallback((value: string) => {
    const clean = value.replace(/[^A-Za-z0-9\s-]/g, '').slice(0, 10);
    setPincodeRaw(clean);
    autoChecked.current = false;
    if (clean.length < 3) {
      setTat(null);
      setServiceability(null);
      setCarrier(null);
      setError(null);
    }
  }, []);

  /* ── Public: Manual country entry/update (guest) ── */
  const setCountry = useCallback((value: string) => {
    setCountryRaw(value);
    autoChecked.current = false;
  }, []);

  /* ── Public: Manual check trigger ── */
  const checkDelivery = useCallback(async () => {
    const pin = pincode.trim();
    if (pin.length < 3 || !productId) return;
    await runCheck(pin, country, productOriginCountry || '', productId, userId || '');
  }, [pincode, country, productOriginCountry, productId, userId, runCheck]);

  return {
    address,
    addresses,
    pincode,
    country,
    tat,
    serviceability,
    carrier,
    loading,
    error,
    selectAddress,
    setPincode,
    setCountry,
    checkDelivery,
  };
}
