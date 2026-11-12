// Native push notifications via Firebase Cloud Messaging (@capacitor/push-notifications).
// Replaces the previous OneSignal (onesignal-cordova-plugin) integration.
//
// FCM tokens are registered with the `register-push-token` Supabase Edge Function,
// which stores them in the `device_push_tokens` table keyed by the authenticated
// Supabase user id. Sending happens via the `send-push-notification` edge function
// (FCM HTTP v1).
//
// On non-native platforms this module is a no-op — the web build uses
// `../lib/oneSignalWeb.ts` instead.
import logger from '../utils/logger';
import { PushNotifications } from '@capacitor/push-notifications';
import type {
  ActionPerformed,
  PushNotificationSchema,
  RegistrationError,
  Token,
} from '@capacitor/push-notifications';
import type { PluginListenerHandle } from '@capacitor/core';
import { isNativePlatform, isNativeAndroid } from './nativePlatform';
import { supabase } from '../lib/supabase';

let pushInitialized = false;
let currentToken: string | null = null;
let currentUserId: string | null = null;
let registering = false;
const listeners: PluginListenerHandle[] = [];

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const REGISTER_PUSH_TOKEN_URL = `${SUPABASE_URL}/functions/v1/register-push-token`;
const PLATFORM = isNativeAndroid ? 'android' : 'ios';

interface RegisterResult {
  ok: boolean;
  status: number;
}

async function postTokenAction(
  action: 'register' | 'unregister',
  token: string,
  accessToken: string,
): Promise<RegisterResult> {
  const res = await fetch(REGISTER_PUSH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ action, token, platform: PLATFORM }),
  });
  return { ok: res.ok, status: res.status };
}

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Register (or re-register) the current FCM token for the given user. */
async function syncTokenForUser(userId: string | null) {
  if (!currentToken || registering) return;
  const accessToken = await getAccessToken();
  if (!accessToken) {
    logger.warn('FCM token registration skipped — no auth session');
    return;
  }

  registering = true;
  try {
    if (userId) {
      const result = await postTokenAction('register', currentToken, accessToken);
      if (!result.ok) {
        logger.error('FCM token registration failed', { status: result.status });
      } else {
        logger.log('FCM token registered', { platform: PLATFORM });
      }
    } else {
      const result = await postTokenAction('unregister', currentToken, accessToken);
      if (!result.ok) {
        logger.warn('FCM token unregister failed', { status: result.status });
      } else {
        logger.log('FCM token unregistered');
      }
    }
  } catch (error) {
    logger.error('FCM token sync failed', { error });
  } finally {
    registering = false;
  }
}

export async function initializeNativePushNotifications() {
  if (!isNativePlatform || pushInitialized) return;

  try {
    listeners.push(await PushNotifications.addListener('registration', (token: Token) => {
      currentToken = token.value;
      logger.log('FCM registration received');
      if (currentUserId) {
        void syncTokenForUser(currentUserId);
      }
    }));

    listeners.push(await PushNotifications.addListener('registrationError', (error: RegistrationError) => {
      logger.error('FCM registration error', { error });
    }));

    listeners.push(await PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
      logger.log('Push notification received while app open', { id: notification.id });
    }));

    listeners.push(await PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
      logger.log('Push notification opened app', {
        id: action.notification?.id,
        actionId: action.actionId,
      });
    }));

    const result = await PushNotifications.requestPermissions();
    if (result.receive !== 'granted') {
      logger.warn('Push notification permission not granted');
      return;
    }

    await PushNotifications.register();
    pushInitialized = true;
  } catch (error) {
    logger.error('Native push initialization failed', { error });
  }
}

/**
 * Rebind the current FCM token to the logged-in Supabase user (register on
 * login, unregister on logout). Called from oneSignalSync on auth changes.
 */
export async function setNativePushExternalId(userId: string | null) {
  currentUserId = userId;
  if (!isNativePlatform || !pushInitialized) return;

  if (userId) {
    await syncTokenForUser(userId);
  } else if (currentToken) {
    await syncTokenForUser(null);
  }
}
