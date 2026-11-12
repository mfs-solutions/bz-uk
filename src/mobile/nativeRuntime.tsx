import { App as CapacitorApp } from '@capacitor/app';
import { Dialog } from '@capacitor/dialog';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isNativeAndroid, isNativeIOS } from './nativePlatform';

const LAST_PATH_KEY = 'bzead_native_last_path';
// Ephemeral flow pages — restoring without prior context causes confusion
const NO_RESTORE_PREFIXES = ['/payment', '/checkout', '/otp-verification', '/new-password', '/seller/otp-verification', '/seller/new-password'];

/**
 * Persists the last active path so the correct page is restored if Android
 * kills the process while the app is in background (memory pressure, etc.).
 *
 * On every background transition the visible path is saved to localStorage.
 * On cold start (process was killed → app launches at /) we navigate back to
 * that path; auth guards still apply, so protected pages redirect to login if
 * the session also expired.
 */
export function useNativePagePersist(pathname: string) {
  const navigate = useNavigate();

  // Save path when app moves to background
  useEffect(() => {
    if (!isNativeAndroid) return;
    let remove: (() => void) | null = null;
    const setup = async () => {
      try {
        const listener = await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
          if (isActive) return;
          try {
            const path = window.location.pathname;
            if (path && path !== '/') localStorage.setItem(LAST_PATH_KEY, path);
          } catch { /* ignore */ }
        });
        remove = () => void listener.remove();
      } catch { /* ignore */ }
    };
    void setup();
    return () => { if (remove) remove(); };
  }, []);

  // On cold start: if the app launched at / (process-kill recovery) restore saved path
  useEffect(() => {
    if (!isNativeAndroid) return;
    if (pathname !== '/') return;
    try {
      const saved = localStorage.getItem(LAST_PATH_KEY);
      if (!saved || saved === '/') return;
      if (NO_RESTORE_PREFIXES.some(p => saved.startsWith(p))) return;
      // Short delay lets auth context initialise before the guard runs
      const t = setTimeout(() => navigate(saved, { replace: true }), 150);
      return () => clearTimeout(t);
    } catch { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

const ROOT_PATHS = new Set(['/', '/seller/dashboard', '/admin']);

function isRootPath(pathname: string): boolean {
  return ROOT_PATHS.has(pathname);
}

/** Show an Android-style snackbar without requiring @capacitor/toast. */
function showExitHintSnackbar() {
  const existing = document.getElementById('bzead-back-snackbar');
  if (existing) existing.remove();

  const snack = document.createElement('div');
  snack.id = 'bzead-back-snackbar';
  snack.textContent = 'Press back again to exit';
  Object.assign(snack.style, {
    position: 'fixed',
    bottom: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(15,23,42,0.92)',
    color: '#fff',
    padding: '10px 22px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    zIndex: '999999',
    pointerEvents: 'none',
    opacity: '0',
    transition: 'opacity 0.2s ease',
    whiteSpace: 'nowrap',
    boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
  });
  document.body.appendChild(snack);
  requestAnimationFrame(() => { snack.style.opacity = '1'; });
  setTimeout(() => {
    snack.style.opacity = '0';
    setTimeout(() => snack.remove(), 220);
  }, 2000);
}

export function useNativeBackButton(pathname: string) {
  const latestPathRef = useRef(pathname);
  // Timestamp of the last back press while on a root page (ms)
  const lastRootBackRef = useRef<number>(0);

  useEffect(() => {
    latestPathRef.current = pathname;
    // Reset double-tap window whenever the user navigates away from root
    if (!isRootPath(pathname)) lastRootBackRef.current = 0;
  }, [pathname]);

  useEffect(() => {
    if (!isNativeAndroid) return;

    let active = true;
    let removeListener: (() => void) | null = null;

    const register = async () => {
      try {
        const listener = await CapacitorApp.addListener('backButton', async () => {
          const currentPath = latestPathRef.current;

          // ── Non-root page: navigate back in history ──────────────────────
          if (!isRootPath(currentPath)) {
            window.history.back();
            return;
          }

          // ── Root page: double-tap exit with confirmation dialog ──────────
          const now = Date.now();
          const elapsed = now - lastRootBackRef.current;

          if (lastRootBackRef.current > 0 && elapsed < 2000) {
            // Second press within 2 s → ask the user
            lastRootBackRef.current = 0;
            const { value } = await Dialog.confirm({
              title: 'Exit BZEAD',
              message: 'Do you want to close the app?',
              okButtonTitle: 'Yes, Exit',
              cancelButtonTitle: 'Stay',
            });
            if (value) await CapacitorApp.exitApp();
          } else {
            // First press → show hint snackbar
            lastRootBackRef.current = now;
            showExitHintSnackbar();
          }
        });

        if (!active) { await listener.remove(); return; }
        removeListener = () => { void listener.remove(); };
      } catch {
        // Capacitor App plugin unavailable (web build fallback)
      }
    };

    void register();
    return () => {
      active = false;
      if (removeListener) removeListener();
    };
  }, []);
}

interface NativePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
}

interface NativePullToRefreshState {
  enabled: boolean;
  pullDistance: number;
  isRefreshing: boolean;
}

export function useNativePullToRefresh({ onRefresh }: NativePullToRefreshOptions): NativePullToRefreshState {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const startYRef = useRef(0);
  const draggingRef = useRef(false);
  const maxPullRef = useRef(0);
  const refreshingRef = useRef(false);
  const refreshHandlerRef = useRef(onRefresh);

  useEffect(() => {
    refreshHandlerRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    refreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  useEffect(() => {
    if (!isNativeIOS) return;

    const threshold = 90;
    const maxDistance = 130;

    const onTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current) return;
      if (event.touches.length !== 1) return;
      if (window.scrollY > 0) return;

      draggingRef.current = true;
      startYRef.current = event.touches[0].clientY;
      maxPullRef.current = 0;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!draggingRef.current) return;

      const delta = event.touches[0].clientY - startYRef.current;
      if (delta <= 0) {
        setPullDistance(0);
        return;
      }

      const damped = Math.min(maxDistance, delta * 0.45);
      maxPullRef.current = damped;
      setPullDistance(damped);

      if (damped > 2) {
        event.preventDefault();
      }
    };

    const finishPull = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setPullDistance(0);

      if (maxPullRef.current < threshold || refreshingRef.current) return;

      setIsRefreshing(true);
      refreshingRef.current = true;

      Promise.resolve(refreshHandlerRef.current())
        .catch(() => {
          // Fail silently: pull-to-refresh should never hard-fail the UI.
        })
        .finally(() => {
          refreshingRef.current = false;
          setIsRefreshing(false);
        });
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', finishPull);
    window.addEventListener('touchcancel', finishPull);

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', finishPull);
      window.removeEventListener('touchcancel', finishPull);
    };
  }, []);

  return {
    enabled: isNativeIOS,
    pullDistance,
    isRefreshing,
  };
}

interface NativePullToRefreshIndicatorProps {
  enabled: boolean;
  pullDistance: number;
  isRefreshing: boolean;
}

export const NativePullToRefreshIndicator: React.FC<NativePullToRefreshIndicatorProps> = ({
  enabled,
  pullDistance,
  isRefreshing,
}) => {
  if (!enabled && !isRefreshing) return null;
  if (!isRefreshing && pullDistance < 4) return null;

  const progress = Math.min(1, pullDistance / 90);
  const opacity = isRefreshing ? 1 : Math.max(0.2, progress);

  return (
    <div
      className="native-pull-indicator"
      style={{
        opacity,
        transform: `translate(-50%, ${Math.min(56, pullDistance * 0.65)}px)`,
      }}
      aria-hidden
    >
      <div className={`native-pull-spinner ${isRefreshing ? 'native-pull-spinner--active' : ''}`} />
      <span className="native-pull-label">{isRefreshing ? 'Refreshing' : 'Pull to refresh'}</span>
    </div>
  );
};
