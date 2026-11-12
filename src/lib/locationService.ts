import { supabase } from './supabase';
import { Geolocation, type PermissionStatus as GeolocationPermissionStatus } from '@capacitor/geolocation';
import { isNativePlatform } from '../mobile/nativePlatform';

export interface ResolvedLocation {
  place: string;
  city: string;
  state: string;
  country: string;
  countryCode: string;
  postalCode?: string;
  latitude: number;
  longitude: number;
  provider?: string;
  resolvedAt: string;
}

const GUEST_LOCATION_STORAGE_KEY = 'beauzead_detected_location';
const GUEST_COUNTRY_STORAGE_KEY = 'beauzead_detected_country';
const SESSION_DETECT_KEY = 'beauzead_location_detected_date';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

let inFlightDetection: Promise<{ data: ResolvedLocation | null; error: string | null }> | null = null;

const todayKey = () => new Date().toISOString().slice(0, 10);

const roundTo3 = (value: number) => Math.round(value * 1000) / 1000;

export function getLocationLabel(location: Partial<ResolvedLocation> | null | undefined) {
  if (!location) return '';
  return [location.city, location.state, location.country].filter(Boolean).join(', ');
}

function normalizeLocation(input: Partial<ResolvedLocation>): ResolvedLocation {
  return {
    place: String(input.place || '').trim(),
    city: String(input.city || '').trim(),
    state: String(input.state || '').trim(),
    country: String(input.country || '').trim(),
    countryCode: String(input.countryCode || '').trim().toUpperCase(),
    postalCode: String(input.postalCode || '').trim(),
    latitude: Number(input.latitude || 0),
    longitude: Number(input.longitude || 0),
    provider: String(input.provider || '').trim(),
    resolvedAt: String(input.resolvedAt || new Date().toISOString()),
  };
}

function isFresh(resolvedAt?: string | null) {
  if (!resolvedAt) return false;
  const timestamp = new Date(resolvedAt).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp < ONE_DAY_MS;
}

function getGuestLocationFromStorage(): ResolvedLocation | null {
  try {
    const raw = localStorage.getItem(GUEST_LOCATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = normalizeLocation(JSON.parse(raw));
    return parsed;
  } catch {
    return null;
  }
}

function saveGuestLocationToStorage(location: ResolvedLocation) {
  localStorage.setItem(GUEST_LOCATION_STORAGE_KEY, JSON.stringify(location));
  localStorage.setItem(GUEST_COUNTRY_STORAGE_KEY, location.country || '');
  // Notify same-tab listeners (useDestinationCountry, CurrencyContext) immediately.
  // cross-tab updates are handled by the browser's native 'storage' event.
  try {
    window.dispatchEvent(new CustomEvent('beauzead:location-updated', { detail: location }));
  } catch { /* ignore in SSR/test environments */ }
}

function markSessionDetected() {
  try {
    sessionStorage.setItem(SESSION_DETECT_KEY, todayKey());
  } catch {
    // Ignore unavailable sessionStorage
  }
}

function alreadyDetectedThisSessionToday() {
  try {
    return sessionStorage.getItem(SESSION_DETECT_KEY) === todayKey();
  } catch {
    return false;
  }
}

async function fetchUserLocationCache(userId: string): Promise<ResolvedLocation | null> {
  const { data, error } = await supabase
    .from('user_location_cache')
    .select('latitude, longitude, place, city, state, country, country_code, provider, resolved_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;

  return normalizeLocation({
    latitude: Number(data.latitude || 0),
    longitude: Number(data.longitude || 0),
    place: String(data.place || ''),
    city: String(data.city || ''),
    state: String(data.state || ''),
    country: String(data.country || ''),
    countryCode: String(data.country_code || ''),
    provider: String(data.provider || ''),
    resolvedAt: String(data.resolved_at || ''),
  });
}

async function saveUserLocationCache(userId: string, location: ResolvedLocation) {
  await supabase.from('user_location_cache').upsert(
    {
      user_id: userId,
      latitude: roundTo3(location.latitude),
      longitude: roundTo3(location.longitude),
      place: location.place || null,
      city: location.city,
      state: location.state,
      country: location.country,
      country_code: location.countryCode,
      provider: location.provider || null,
      resolved_at: location.resolvedAt,
    },
    { onConflict: 'user_id' }
  );
}

function hasNativeLocationPermission(status: GeolocationPermissionStatus): boolean {
  return status.location === 'granted' || status.coarseLocation === 'granted';
}

function normalizeNativeLocationError(error: unknown): Error {
  const rawMessage = error instanceof Error ? error.message : String(error || '');
  const message = rawMessage.toLowerCase();

  if (message.includes('denied') || message.includes('permission')) {
    return new Error('Location permission denied. Enable location permission in app settings and try again.');
  }

  if (
    message.includes('location services')
    || message.includes('not enabled')
    || message.includes('turned off')
    || message.includes('disabled')
    || message.includes('gps')
  ) {
    return new Error('Phone location is turned off. Turn on Location/GPS and try again.');
  }

  return new Error('Unable to fetch precise location. Please check phone location settings and retry.');
}

function getCurrentPosition(): Promise<{ latitude: number; longitude: number }> {
  if (isNativePlatform) {
    return (async () => {
      try {
        const current = await Geolocation.checkPermissions();

        if (!hasNativeLocationPermission(current)) {
          const requested = await Geolocation.requestPermissions();
          if (!hasNativeLocationPermission(requested)) {
            throw new Error('Location permission denied.');
          }
        }

        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 300000,
        });

        return {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
      } catch (error) {
        throw normalizeNativeLocationError(error);
      }
    })();
  }

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      reject(new Error('Location is not supported in this browser.'));
      return;
    }

    const doc = window.document as Document & {
      permissionsPolicy?: { allowsFeature?: (feature: string) => boolean };
      featurePolicy?: { allowsFeature?: (feature: string) => boolean };
    };

    const allowsGeolocation =
      doc.permissionsPolicy?.allowsFeature?.('geolocation') ??
      doc.featurePolicy?.allowsFeature?.('geolocation');

    if (allowsGeolocation === false) {
      reject(new Error('Geolocation is blocked by the site permissions policy.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        reject(
          new Error(
            error.code === error.PERMISSION_DENIED
              ? 'Location permission denied.'
              : 'Unable to detect your location.'
          )
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 300000,
      }
    );
  });
}

/**
 * IP-based geolocation fallback — used when browser geolocation is denied or unavailable.
 * Tries multiple free IP geolocation providers in sequence.
 */
async function detectLocationByIP(): Promise<ResolvedLocation> {
  // Provider 1: ipapi.co (no key required, 1k/day free)
  try {
    const res = await fetch('https://ipapi.co/json/', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const d = await res.json();
      if (d?.country_name) {
        return normalizeLocation({
          latitude: Number(d.latitude || 0),
          longitude: Number(d.longitude || 0),
          place: '',
          city: String(d.city || ''),
          state: String(d.region || ''),
          country: String(d.country_name || ''),
          countryCode: String(d.country_code || ''),
          postalCode: String(d.postal || ''),
          provider: 'ipapi-fallback',
          resolvedAt: new Date().toISOString(),
        });
      }
    }
  } catch { /* fall through */ }

  // Provider 2: ipwho.is (no key required, HTTPS, 10k/month free)
  try {
    const res = await fetch('https://ipwho.is/', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const d = await res.json();
      if (d?.success !== false && d?.country) {
        return normalizeLocation({
          latitude: Number(d.latitude || 0),
          longitude: Number(d.longitude || 0),
          place: '',
          city: String(d.city || ''),
          state: String(d.region || ''),
          country: String(d.country || ''),
          countryCode: String(d.country_code || ''),
          postalCode: String(d.postal || ''),
          provider: 'ipwhois-fallback',
          resolvedAt: new Date().toISOString(),
        });
      }
    }
  } catch { /* fall through */ }

  throw new Error('Unable to detect location from IP address.');
}

async function reverseGeocode(latitude: number, longitude: number): Promise<ResolvedLocation> {
  const { data, error } = await supabase.functions.invoke('reverse-geocode', {
    body: { latitude, longitude },
  });

  if (!error && data?.data?.country) {
    return normalizeLocation({
      latitude,
      longitude,
      place: data.data.place,
      city: data.data.city,
      state: data.data.state,
      country: data.data.country,
      countryCode: data.data.countryCode,
      postalCode: data.data.postalCode || data.data.postal_code || '',
      provider: data.data.provider || 'edge-function',
      resolvedAt: new Date().toISOString(),
    });
  }

  const fallback = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`,
    {
      headers: { Accept: 'application/json' },
    }
  );

  if (!fallback.ok) {
    throw new Error('Unable to resolve location details.');
  }

  const payload = await fallback.json();
  const address = payload?.address || {};

  return normalizeLocation({
    latitude,
    longitude,
    place: String(address.suburb || address.neighbourhood || address.road || address.city_district || ''),
    city: String(address.city || address.town || address.village || address.hamlet || address.county || ''),
    state: String(address.state || address.region || ''),
    country: String(address.country || ''),
    countryCode: String(address.country_code || ''),
    postalCode: String(address.postcode || ''),
    provider: 'nominatim-fallback',
    resolvedAt: new Date().toISOString(),
  });
}

export async function detectLocationWithCaching(options?: {
  userId?: string | null;
  forceRefresh?: boolean;
}) {
  const userId = options?.userId || null;
  const forceRefresh = options?.forceRefresh === true;

  if (!forceRefresh && inFlightDetection) {
    return inFlightDetection;
  }

  if (!forceRefresh) {
    const guestCached = getGuestLocationFromStorage();

    if (alreadyDetectedThisSessionToday() && guestCached) {
      return { data: guestCached, error: null as string | null };
    }

    if (alreadyDetectedThisSessionToday() && !guestCached) {
      return {
        data: null as ResolvedLocation | null,
        error: 'Location access already requested. Use detect location to retry.',
      };
    }

    if (userId) {
      const backendCached = await fetchUserLocationCache(userId);
      if (backendCached && isFresh(backendCached.resolvedAt)) {
        saveGuestLocationToStorage(backendCached);
        markSessionDetected();
        return { data: backendCached, error: null as string | null };
      }
    }

    if (guestCached && isFresh(guestCached.resolvedAt)) {
      markSessionDetected();
      return { data: guestCached, error: null as string | null };
    }
  }

  const runDetection = async () => {
    try {
      let resolved: ResolvedLocation;

      if (forceRefresh) {
        // User explicitly triggered: GPS → reverse geocode only (no silent IP fallback)
        const coords = await getCurrentPosition();
        resolved = await reverseGeocode(coords.latitude, coords.longitude);
      } else {
        // Auto-detection: IP-based (silent, no browser permission prompt required)
        resolved = await detectLocationByIP();
      }

      saveGuestLocationToStorage(resolved);
      markSessionDetected();

      if (userId) {
        await saveUserLocationCache(userId, resolved);
      }

      return { data: resolved, error: null as string | null };
    } catch (error) {
      if (!forceRefresh) {
        markSessionDetected();
      }
      return { data: null as ResolvedLocation | null, error: error instanceof Error ? error.message : 'Unable to detect location.' };
    }
  };

  if (!forceRefresh) {
    inFlightDetection = runDetection();
    const result = await inFlightDetection;
    inFlightDetection = null;
    return result;
  }

  return runDetection();
}
