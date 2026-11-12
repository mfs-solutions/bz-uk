import { initializeApp, type FirebaseApp } from '@firebase/app';
import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type Messaging,
} from '@firebase/messaging';
import { PUSH_TOKEN_STORAGE_KEY, PUSH_TOKEN_UPDATED_EVENT } from '../mobile/pushConstants';
import logger from '../utils/logger';
import { isNativePlatform } from '../mobile/nativePlatform';
import { FIREBASE_WEB_PUSH_CONFIG, isFirebaseWebPushConfigured } from './oneSignalConfig';
import {
  registerPushTokenForCurrentSession,
  unregisterPushTokenForCurrentSession,
} from './pushTokenService';

export interface OneSignalSdk {
  source: 'firebase';
}

let firebaseApp: FirebaseApp | null = null;
let messaging: Messaging | null = null;
let readyPromise: Promise<OneSignalSdk | null> | null = null;
let foregroundListenerRegistered = false;

function emitPushTokenUpdated(token: string | null): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(PUSH_TOKEN_UPDATED_EVENT, { detail: { token } }),
  );
}

function readStoredToken(): string {
  if (typeof window === 'undefined' || !window.localStorage) return '';
  return String(window.localStorage.getItem(PUSH_TOKEN_STORAGE_KEY) || '').trim();
}

function writeStoredToken(token: string | null): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  if (token) {
    window.localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
  } else {
    window.localStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
  }
  emitPushTokenUpdated(token);
}

async function getMessagingInstance(): Promise<Messaging | null> {
  if (messaging) return messaging;
  if (!isFirebaseWebPushConfigured || isNativePlatform || typeof window === 'undefined') {
    return null;
  }
  const supported = await isSupported().catch(() => false);
  if (!supported) return null;
  if (!firebaseApp) {
    firebaseApp = initializeApp({
      apiKey: FIREBASE_WEB_PUSH_CONFIG.apiKey,
      authDomain: FIREBASE_WEB_PUSH_CONFIG.authDomain || undefined,
      projectId: FIREBASE_WEB_PUSH_CONFIG.projectId,
      storageBucket: FIREBASE_WEB_PUSH_CONFIG.storageBucket || undefined,
      messagingSenderId: FIREBASE_WEB_PUSH_CONFIG.messagingSenderId,
      appId: FIREBASE_WEB_PUSH_CONFIG.appId,
    });
  }
  messaging = getMessaging(firebaseApp);
  return messaging;
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const params = new URLSearchParams({
      apiKey: FIREBASE_WEB_PUSH_CONFIG.apiKey,
      authDomain: FIREBASE_WEB_PUSH_CONFIG.authDomain,
      projectId: FIREBASE_WEB_PUSH_CONFIG.projectId,
      storageBucket: FIREBASE_WEB_PUSH_CONFIG.storageBucket,
      messagingSenderId: FIREBASE_WEB_PUSH_CONFIG.messagingSenderId,
      appId: FIREBASE_WEB_PUSH_CONFIG.appId,
    });
    return await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${params.toString()}`);
  } catch (error) {
    logger.error('Firebase messaging service worker registration failed', { error });
    return null;
  }
}

async function ensureWebPushToken(): Promise<string | null> {
  const msg = await getMessagingInstance();
  if (!msg) return null;
  const sw = await registerServiceWorker();
  if (!sw) return null;
  try {
    const token = await getToken(msg, {
      vapidKey: FIREBASE_WEB_PUSH_CONFIG.vapidKey,
      serviceWorkerRegistration: sw,
    });
    const resolved = String(token || '').trim();
    if (!resolved) return null;
    writeStoredToken(resolved);
    return resolved;
  } catch (error) {
    logger.error('Firebase getToken failed', { error });
    return null;
  }
}

function ensureForegroundListener(msg: Messaging): void {
  if (foregroundListenerRegistered) return;
  foregroundListenerRegistered = true;
  onMessage(msg, (payload) => {
    logger.log('Firebase foreground push received', {
      hasNotification: Boolean(payload.notification),
      messageId: payload.messageId,
    });
  });
}

export function initializeOneSignalWeb(): Promise<OneSignalSdk | null> {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    const msg = await getMessagingInstance();
    if (!msg) return null;
    ensureForegroundListener(msg);
    return { source: 'firebase' } satisfies OneSignalSdk;
  })();
  return readyPromise;
}

export function whenWebPushReady(): Promise<OneSignalSdk | null> {
  return initializeOneSignalWeb();
}

export async function requestWebPushToken(): Promise<string | null> {
  const sdk = await whenWebPushReady();
  if (!sdk) return null;
  return ensureWebPushToken();
}

export async function clearWebPushToken(): Promise<void> {
  const msg = await getMessagingInstance();
  const existingToken = readStoredToken();
  if (!msg) {
    writeStoredToken(null);
    return;
  }
  try {
    if (existingToken) {
      await deleteToken(msg);
    }
  } catch (error) {
    logger.warn('Firebase deleteToken failed', { error });
  }
  writeStoredToken(null);
}

export function getStoredWebPushToken(): string {
  return readStoredToken();
}

export async function setWebPushExternalId(userId: string | null): Promise<void> {
  const token = readStoredToken();
  if (!token) return;

  if (userId) {
    await registerPushTokenForCurrentSession(token);
    return;
  }
  await unregisterPushTokenForCurrentSession(token);
}
