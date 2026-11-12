import { isNativePlatform } from '../mobile/nativePlatform';
import { PUSH_TOKEN_UPDATED_EVENT } from '../mobile/pushConstants';
import { isOneSignalConfigured } from './oneSignalConfig';
import {
  clearWebPushToken,
  getStoredWebPushToken,
  requestWebPushToken,
  whenWebPushReady,
} from './oneSignalWeb';
import {
  registerPushTokenForCurrentSession,
  unregisterPushTokenForCurrentSession,
} from './pushTokenService';

export type WebPushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export interface WebPushState {
  supported: boolean;
  permission: WebPushPermission;
  optedIn: boolean;
}

const UNSUPPORTED_STATE: WebPushState = Object.freeze({
  supported: false,
  permission: 'unsupported',
  optedIn: false,
});

export function isWebPushApplicable(): boolean {
  if (isNativePlatform) return false;
  if (!isOneSignalConfigured) return false;
  if (typeof window === 'undefined') return false;
  if (typeof Notification === 'undefined') return false;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  return true;
}

function readPermission(): WebPushPermission {
  if (typeof Notification === 'undefined') return 'unsupported';
  const permission = Notification.permission;
  if (permission === 'granted' || permission === 'denied' || permission === 'default') {
    return permission;
  }
  return 'default';
}

function readOptedIn(): boolean {
  return getStoredWebPushToken().length > 0;
}

function readState(): WebPushState {
  if (!isWebPushApplicable()) return UNSUPPORTED_STATE;
  return {
    supported: true,
    permission: readPermission(),
    optedIn: readOptedIn(),
  };
}

function emitState(callback: (state: WebPushState) => void): void {
  callback(readState());
}

export async function getWebPushState(): Promise<WebPushState> {
  if (!isWebPushApplicable()) return UNSUPPORTED_STATE;
  await whenWebPushReady();
  return readState();
}

export async function enableWebPush(): Promise<WebPushState> {
  if (!isWebPushApplicable()) return UNSUPPORTED_STATE;
  await whenWebPushReady();

  let permission = readPermission();
  if (permission === 'denied') return readState();

  if (permission !== 'granted' && typeof Notification.requestPermission === 'function') {
    permission = await Notification.requestPermission();
  }

  if (permission !== 'granted') return readState();

  const token = await requestWebPushToken();
  if (!token) return readState();

  await registerPushTokenForCurrentSession(token);
  return readState();
}

export async function disableWebPush(): Promise<WebPushState> {
  if (!isWebPushApplicable()) return UNSUPPORTED_STATE;

  const existingToken = getStoredWebPushToken();
  if (existingToken) {
    await unregisterPushTokenForCurrentSession(existingToken);
  }
  await clearWebPushToken();
  return readState();
}

export function onWebPushStateChange(
  callback: (state: WebPushState) => void,
): () => void {
  if (!isWebPushApplicable()) return () => undefined;

  const handleTokenUpdate = (): void => emitState(callback);
  const handleVisibilityChange = (): void => {
    if (document.visibilityState !== 'visible') return;
    emitState(callback);
  };

  window.addEventListener(PUSH_TOKEN_UPDATED_EVENT, handleTokenUpdate as EventListener);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  emitState(callback);

  return () => {
    window.removeEventListener(PUSH_TOKEN_UPDATED_EVENT, handleTokenUpdate as EventListener);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}
