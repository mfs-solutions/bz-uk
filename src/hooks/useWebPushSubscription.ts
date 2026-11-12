/**
 * useWebPushSubscription
 * ----------------------
 * React hook exposing the current Firebase web-push state and explicit
 * enable/disable actions. Subscribes to SDK change events so the UI
 * reflects external changes (e.g. user revoking permission in browser
 * site settings).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  disableWebPush,
  enableWebPush,
  getWebPushState,
  isWebPushApplicable,
  onWebPushStateChange,
  type WebPushState,
} from '../lib/webPush';

const INITIAL_STATE: WebPushState = {
  supported: false,
  permission: 'default',
  optedIn: false,
};

export interface UseWebPushSubscriptionResult extends WebPushState {
  busy: boolean;
  ready: boolean;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
}

export function useWebPushSubscription(): UseWebPushSubscriptionResult {
  const [state, setState] = useState<WebPushState>(INITIAL_STATE);
  const [ready, setReady] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!isWebPushApplicable()) {
      setReady(true);
      return;
    }
    let cancelled = false;
    void getWebPushState().then((s) => {
      if (cancelled || !mountedRef.current) return;
      setState(s);
      setReady(true);
    });
    const unsubscribe = onWebPushStateChange((s) => {
      if (!mountedRef.current) return;
      setState(s);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const enable = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await enableWebPush();
      if (mountedRef.current) setState(next);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [busy]);

  const disable = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await disableWebPush();
      if (mountedRef.current) setState(next);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [busy]);

  return { ...state, ready, busy, enable, disable };
}
