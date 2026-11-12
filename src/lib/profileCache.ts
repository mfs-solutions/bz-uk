// Per-user cache of the profile page data so it renders instantly on revisit,
// after the tab/app is minimised and reopened, or when auth tokens refresh.

const KEY = 'beauzead_profile_cache_v1';
export const PROFILE_CACHE_TTL_MS = 10 * 60 * 1000;

export interface ProfileCacheData {
  userId: string;
  profile?: { name: string; email: string; phone: string; country: string; countryId: string };
  profileAt?: number;
  addresses?: unknown[];
  addressesAt?: number;
}

export function readProfileCache(): ProfileCacheData | null {
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProfileCacheData;
    return parsed && typeof parsed.userId === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function updateProfileCache(userId: string, patch: Partial<Omit<ProfileCacheData, 'userId'>>): void {
  try {
    const existing = readProfileCache();
    const base = existing && existing.userId === userId ? existing : { userId };
    window.localStorage.setItem(KEY, JSON.stringify({ ...base, ...patch }));
  } catch {
    /* storage unavailable or full */
  }
}

export function isFresh(timestamp: number | undefined): boolean {
  return typeof timestamp === 'number' && Date.now() - timestamp < PROFILE_CACHE_TTL_MS;
}

export function clearProfileCache(): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
