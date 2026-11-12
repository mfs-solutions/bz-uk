import { nativePlatform } from '../mobile/nativePlatform';
import { PUSH_TOKEN_STORAGE_KEY } from '../mobile/pushConstants';
import logger from '../utils/logger';
import { supabase } from './supabase';

type PushPlatform = 'android' | 'ios' | 'web';
type PushTokenAction = 'register' | 'unregister';

interface PushTokenFunctionResponse {
  success?: boolean;
  error?: string;
}

const REGISTER_PUSH_TOKEN_FUNCTION = 'register-push-token';
const NO_ACTIVE_SESSION_ERROR = 'No active authenticated session';

function resolvePushPlatform(): PushPlatform {
  if (nativePlatform === 'android' || nativePlatform === 'ios') {
    return nativePlatform;
  }
  return 'web';
}

function resolveStoredPushToken(rawToken?: string): string {
  const directToken = String(rawToken || '').trim();
  if (directToken) return directToken;

  if (typeof window === 'undefined' || !window.localStorage) return '';
  return String(window.localStorage.getItem(PUSH_TOKEN_STORAGE_KEY) || '').trim();
}

async function extractFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (!error || typeof error !== 'object') return fallback;

  const maybeError = error as { message?: string; context?: unknown };
  const context = maybeError.context;
  if (context instanceof Response) {
    try {
      const payload = await context.clone().json() as { error?: string; message?: string };
      const payloadError = String(payload?.error || payload?.message || '').trim();
      if (payloadError) return payloadError;
    } catch {
      try {
        const textPayload = await context.clone().text();
        if (textPayload.trim()) return textPayload.trim();
      } catch {
        // Ignore context parsing failures.
      }
    }

    return `${fallback} (HTTP ${context.status})`;
  }

  const message = String(maybeError.message || '').trim();
  if (message) return message;
  return fallback;
}

async function invokePushTokenAction(
  action: PushTokenAction,
  token?: string,
): Promise<{ success: boolean; error?: string }> {
  const resolvedToken = resolveStoredPushToken(token);
  if (!resolvedToken) {
    return { success: false, error: 'Push token not available on this device' };
  }

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    return { success: false, error: NO_ACTIVE_SESSION_ERROR };
  }

  const { data, error } = await supabase.functions.invoke(REGISTER_PUSH_TOKEN_FUNCTION, {
    body: {
      action,
      token: resolvedToken,
      platform: resolvePushPlatform(),
    },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) {
    const detailedMessage = await extractFunctionErrorMessage(
      error,
      `Failed to ${action} push token`,
    );
    return { success: false, error: detailedMessage };
  }

  const payload = (data || {}) as PushTokenFunctionResponse;
  if (payload.success === false) {
    return {
      success: false,
      error: payload.error || `Failed to ${action} push token`,
    };
  }

  return { success: true };
}

export async function registerPushTokenForCurrentSession(token?: string): Promise<void> {
  const result = await invokePushTokenAction('register', token);
  if (!result.success && result.error !== NO_ACTIVE_SESSION_ERROR) {
    logger.warn('[PushToken] register failed', result.error);
  }
}

export async function unregisterPushTokenForCurrentSession(token?: string): Promise<void> {
  const result = await invokePushTokenAction('unregister', token);
  if (!result.success && result.error !== NO_ACTIVE_SESSION_ERROR) {
    logger.warn('[PushToken] unregister failed', result.error);
  }
}
