import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { IS_UK_STOREFRONT, STOREFRONT_COUNTRY_NAME } from '../config/market';

// Default guest location to United States until IP-based geo-location resolves
const GUEST_DESTINATION_FALLBACK = 'United States';

const getShippingCountry = (): string => {
  const savedShipping = localStorage.getItem('beauzead_checkout_shipping');
  if (!savedShipping) return '';

  try {
    return String(JSON.parse(savedShipping)?.country || '').trim();
  } catch {
    return '';
  }
};

const getDetectedCountry = (): string => {
  const detectedLocation = localStorage.getItem('beauzead_detected_location');
  if (detectedLocation) {
    try {
      const parsed = JSON.parse(detectedLocation) as { country?: string };
      const country = String(parsed.country || '').trim();
      if (country) return country;
    } catch {
      // ignore parse errors
    }
  }

  return String(localStorage.getItem('beauzead_detected_country') || '').trim();
};

export function useDestinationCountry(options?: { userId?: string | null; userCountry?: string | null }) {
  const userId = options?.userId || null;
  const userCountry = String(options?.userCountry || '').trim();

  const [selectedCountry, setSelectedCountry] = useState<string>(() => {
    if (IS_UK_STOREFRONT) return STOREFRONT_COUNTRY_NAME;
    // Signed-in: profile country (from auth) only — no localStorage. DB-backed
    // resolution runs in the effect below and fills any gap.
    if (userId) {
      return userCountry || '';
    }
    return getShippingCountry() || getDetectedCountry() || GUEST_DESTINATION_FALLBACK;
  });

  useEffect(() => {
    if (IS_UK_STOREFRONT) {
      setSelectedCountry(STOREFRONT_COUNTRY_NAME);
      return;
    }

    let cancelled = false;

    const resolveCountry = async () => {
      // Guests have no profile — use localStorage shipping/detected, then fallback.
      if (!userId) {
        if (!cancelled) {
          setSelectedCountry(getShippingCountry() || getDetectedCountry() || GUEST_DESTINATION_FALLBACK);
        }
        return;
      }

      // Signed-in users: DB only. Profile country is required at signup, so it is
      // the authoritative source. No localStorage is read for signed-in users.
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('country_id')
        .eq('id', userId)
        .maybeSingle();

      let profileCountry = '';
      const profileCountryId = String((profileRow as { country_id?: string | null } | null)?.country_id || '').trim();
      if (profileCountryId) {
        const { data: countryRow } = await supabase
          .from('countries')
          .select('country_name, short_code, country_code, iso2')
          .eq('id', profileCountryId)
          .maybeSingle();

        if (countryRow) {
          profileCountry = String(
            (countryRow as { country_name?: string | null }).country_name
            || (countryRow as { short_code?: string | null }).short_code
            || (countryRow as { country_code?: string | null }).country_code
            || (countryRow as { iso2?: string | null }).iso2
            || ''
          ).trim();
        }
      }

      // Priority: profile country (DB) → auth-provided country → DB default address.
      // No localStorage involved for signed-in users.
      const { data: defaultAddress } = await supabase
        .from('user_addresses')
        .select('country')
        .eq('user_id', userId)
        .eq('is_default', true)
        .limit(1)
        .maybeSingle();

      if (!cancelled) {
        setSelectedCountry(
          profileCountry ||
          userCountry ||
          String(defaultAddress?.country || '').trim() ||
          ''
        );
      }
    };

    void resolveCountry();

    const onRefresh = () => { void resolveCountry(); };

    // Re-run when focus returns (user switches tabs) OR when location is detected
    // in the same tab (Header fires 'beauzead:location-updated' after saving).
    window.addEventListener('focus', onRefresh);
    window.addEventListener('beauzead:location-updated', onRefresh);
    // Cross-tab storage changes
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'beauzead_detected_location' || e.key === 'beauzead_detected_country' || e.key === 'beauzead_checkout_shipping') {
        void resolveCountry();
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', onRefresh);
      window.removeEventListener('beauzead:location-updated', onRefresh);
      window.removeEventListener('storage', onStorage);
    };
  }, [userId, userCountry]);

  return selectedCountry;
}
