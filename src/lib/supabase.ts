import { createClient } from '@supabase/supabase-js';
import { runtimeEnv, serverSupabaseKey } from './runtimeEnv.ts';

// Supabase auth storage key — must match the project ref in VITE_SUPABASE_URL.
export const AUTH_STORAGE_KEY = 'sb-aiiefgjfftmerayihpbv-auth-token';

const rawSupabaseUrl = runtimeEnv.VITE_SUPABASE_URL;
const rawSupabaseAnonKey = serverSupabaseKey || runtimeEnv.VITE_SUPABASE_ANON_KEY;

const supabaseUrl = rawSupabaseUrl?.trim();
const supabaseAnonKey = rawSupabaseAnonKey?.trim();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables');
}

if (runtimeEnv.PROD && !supabaseUrl.startsWith('https://')) {
  throw new Error('In production, VITE_SUPABASE_URL must use https');
}

const stableStorage =
  typeof window !== 'undefined' && window.localStorage ? window.localStorage : undefined;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/**
 * Custom fetch with a per-request timeout.
 *
 * - Auth endpoints (/auth/v1/) are NOT wrapped with our timeout because
 *   the Supabase auth client manages its own lock-acquisition + retry
 *   logic via navigator.locks and AbortControllers.  Adding a second
 *   abort layer causes "signal is aborted without reason" during init.
 * - Storage uploads (POST/PUT to /storage/v1/object/) get 120 s.
 * - Everything else gets 15 s.
 */
const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
  const method = (init?.method || 'GET').toUpperCase();

  // Auth endpoints — let the SDK manage its own abort signals.
  // We do NOT add our own AbortController (that causes "signal is
  // aborted without reason" during SDK init), but we DO retry on
  // transient network failures (TypeError: Failed to fetch) which
  // happen frequently on mobile cellular connections.
  const isAuthEndpoint = url.includes('/auth/v1/');
  if (isAuthEndpoint) {
    const authTimeoutMs = 12_000;
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await withTimeout(
          fetch(input, init),
          authTimeoutMs,
          'Auth request timed out'
        );
      } catch (err) {
        lastError = err;
        // Don't retry if the caller explicitly aborted the request
        if (init?.signal?.aborted) throw err;
        // Only retry on network-level failures (TypeError), not HTTP errors
        const message = err instanceof Error ? err.message : '';
        const isRetryable = err instanceof TypeError || /timed out/i.test(message);

        if (isRetryable && attempt < 2) {
          await sleep(1000 * (attempt + 1));
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  }

  const isStorageUpload =
    url.includes('/storage/v1/object/') && (method === 'POST' || method === 'PUT');
  const isEdgeFunctionRequest = url.includes('/functions/v1/');
  const timeout = isStorageUpload ? 120_000 : isEdgeFunctionRequest ? 90_000 : 30_000;
  const isReadRequest = method === 'GET' || method === 'HEAD';
  const attempts = isReadRequest ? 3 : 1;

  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      if (init?.signal) {
        if (init.signal.aborted) {
          clearTimeout(timeoutId);
          controller.abort();
        } else {
          init.signal.addEventListener(
            'abort',
            () => controller.abort(),
            { once: true }
          );
        }
      }

      return await fetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      lastError = error;
      if (!isReadRequest || attempt === attempts - 1 || init?.signal?.aborted) {
        throw error;
      }
      await sleep(1000 * (attempt + 1));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError;
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: fetchWithTimeout,
    headers: { 'X-Client-Info': 'bzeadstore-web' },
  },
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: AUTH_STORAGE_KEY,
    storage: stableStorage,
  },
});
