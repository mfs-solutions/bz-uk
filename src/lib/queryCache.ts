// Small read-through cache for public storefront queries. Results are held in
// memory (instant for in-session navigation) and mirrored to localStorage so a
// reload or return visit doesn't wait on the network. Concurrent identical
// requests share one in-flight promise.

import { runtimeEnv } from './runtimeEnv.ts';

const PREFIX = 'beauzead_qc_v1:';
const MARKET_KEY = runtimeEnv.VITE_MARKET || 'GLOBAL';
const MAX_ENTRY_CHARS = 400_000;
const MAX_PERSISTED_ENTRIES = 60;

interface Entry {
  value: unknown;
  expiresAt: number;
}

const memory = new Map<string, Entry>();
const inFlight = new Map<string, Promise<unknown>>();
let generation = 0;

export const QUERY_TTL = {
  categories: 10 * 60 * 1000,
  products: 3 * 60 * 1000,
  product: 2 * 60 * 1000,
  prices: 2 * 60 * 1000,
} as const;

const storage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

const fullKey = (key: string) => `${PREFIX}${MARKET_KEY}:${key}`;

function readPersisted(key: string): Entry | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(fullKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entry;
    if (!parsed || typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= Date.now()) {
      store.removeItem(fullKey(key));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function pruneExpired(store: Storage, evictOldest = false): void {
  const found: { key: string; expiresAt: number }[] = [];
  for (let i = store.length - 1; i >= 0; i--) {
    const k = store.key(i);
    if (!k || !k.startsWith(PREFIX)) continue;
    let expiresAt = 0;
    try {
      expiresAt = (JSON.parse(store.getItem(k) || '') as Entry).expiresAt;
    } catch { /* corrupt entry is removed below */ }
    if (!(expiresAt > Date.now())) store.removeItem(k);
    else found.push({ key: k, expiresAt });
  }
  if (evictOldest || found.length > MAX_PERSISTED_ENTRIES) {
    found.sort((a, b) => a.expiresAt - b.expiresAt);
    const drop = evictOldest ? Math.ceil(found.length / 2) : found.length - MAX_PERSISTED_ENTRIES;
    found.slice(0, drop).forEach((f) => store.removeItem(f.key));
  }
}

function persist(key: string, entry: Entry): void {
  const store = storage();
  if (!store) return;
  try {
    const raw = JSON.stringify(entry);
    if (raw.length > MAX_ENTRY_CHARS) return;
    try {
      store.setItem(fullKey(key), raw);
    } catch {
      pruneExpired(store, true);
      store.setItem(fullKey(key), raw);
    }
  } catch {
    /* quota or serialization failure: memory cache still works */
  }
}

export function clearQueryCache(): void {
  generation++;
  memory.clear();
  inFlight.clear();
  const store = storage();
  if (!store) return;
  try {
    for (let i = store.length - 1; i >= 0; i--) {
      const k = store.key(i);
      if (k && k.startsWith(PREFIX)) store.removeItem(k);
    }
  } catch { /* ignore */ }
}

export async function cachedQuery<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  isCacheable: (value: T) => boolean = () => true,
): Promise<T> {
  const now = Date.now();
  const hit = memory.get(key) ?? readPersisted(key);
  if (hit && hit.expiresAt > now) {
    memory.set(key, hit);
    return hit.value as T;
  }
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  const startedGeneration = generation;
  const request = fetcher()
    .then((value) => {
      // Skip storing if the cache was cleared (e.g. by a write) mid-request.
      if (startedGeneration === generation && isCacheable(value)) {
        const entry = { value, expiresAt: Date.now() + ttlMs };
        memory.set(key, entry);
        persist(key, entry);
      }
      return value;
    })
    .finally(() => {
      if (inFlight.get(key) === request) inFlight.delete(key);
    });
  inFlight.set(key, request);
  return request;
}

if (typeof window !== 'undefined') {
  const store = storage();
  if (store) {
    try { pruneExpired(store); } catch { /* ignore */ }
  }
}
