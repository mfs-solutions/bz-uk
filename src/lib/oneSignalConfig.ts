// Web push is now powered by Firebase Cloud Messaging (FCM).
// Keep legacy export names so existing imports keep working.
const FIREBASE_API_KEY = (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined)?.trim() || '';
const FIREBASE_PROJECT_ID = (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined)?.trim() || '';
const FIREBASE_APP_ID = (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined)?.trim() || '';
const FIREBASE_MESSAGING_SENDER_ID =
  (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined)?.trim() || '';
const FIREBASE_VAPID_KEY = (import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined)?.trim() || '';

export const FIREBASE_WEB_PUSH_CONFIG = Object.freeze({
  apiKey: FIREBASE_API_KEY,
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined)?.trim() || '',
  projectId: FIREBASE_PROJECT_ID,
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined)?.trim() || '',
  messagingSenderId: FIREBASE_MESSAGING_SENDER_ID,
  appId: FIREBASE_APP_ID,
  vapidKey: FIREBASE_VAPID_KEY,
});

export const isFirebaseWebPushConfigured = Boolean(
  FIREBASE_WEB_PUSH_CONFIG.apiKey
  && FIREBASE_WEB_PUSH_CONFIG.projectId
  && FIREBASE_WEB_PUSH_CONFIG.appId
  && FIREBASE_WEB_PUSH_CONFIG.messagingSenderId
  && FIREBASE_WEB_PUSH_CONFIG.vapidKey,
);

// Backward-compatible exports (legacy names).
export const ONESIGNAL_APP_ID = '';
export const isOneSignalConfigured = isFirebaseWebPushConfigured;
