import { App as CapacitorApp } from '@capacitor/app';
import { isNativeAndroid } from './nativePlatform';
import logger from '../utils/logger';

const BUILD_INFO_ENDPOINT = '/build-info.json';
const BUILD_CACHE_KEY = 'beauzead_last_seen_build_id';
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly
// Only reload on resume if the app was in background longer than this
const BACKGROUND_RELOAD_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

let syncInitialized = false;
let checkInFlight = false;
let lastSeenBuildId: string | null = null;
let backgroundAt: number | null = null;

function readStoredBuildId(): string | null {
  try {
    const value = localStorage.getItem(BUILD_CACHE_KEY);
    return value ? value.trim() : null;
  } catch {
    return null;
  }
}

function writeStoredBuildId(buildId: string): void {
  try {
    localStorage.setItem(BUILD_CACHE_KEY, buildId);
  } catch {
    // Ignore storage write errors.
  }
}

function extractBuildId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

  const source = payload as Record<string, unknown>;
  const buildId = String(source.build || source.version || source.release || '').trim();
  return buildId || null;
}

async function fetchLatestBuildId(): Promise<string | null> {
  try {
    const response = await fetch(`${BUILD_INFO_ENDPOINT}?ts=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) return null;

    const payload = await response.json();
    return extractBuildId(payload);
  } catch {
    return null;
  }
}

async function checkForBuildUpdate(trigger: string): Promise<void> {
  if (checkInFlight || document.visibilityState === 'hidden') return;

  checkInFlight = true;
  try {
    const latestBuildId = await fetchLatestBuildId();
    if (!latestBuildId) return;

    if (!lastSeenBuildId) {
      lastSeenBuildId = latestBuildId;
      writeStoredBuildId(latestBuildId);
      return;
    }

    if (latestBuildId !== lastSeenBuildId) {
      logger.log(`[LiveSync] New build detected via ${trigger}: ${latestBuildId}`);
      lastSeenBuildId = latestBuildId;
      writeStoredBuildId(latestBuildId);
      window.location.reload();
    }
  } finally {
    checkInFlight = false;
  }
}

export function initializeNativeLiveWebSync(): void {
  if (!isNativeAndroid || syncInitialized) return;

  syncInitialized = true;
  lastSeenBuildId = readStoredBuildId();

  void checkForBuildUpdate('startup');

  // Only reload on resume if the app was backgrounded for a long time.
  // Short away-periods (checking email for OTP, switching apps) must never
  // trigger a reload and lose the user's in-progress form state.
  void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) {
      backgroundAt = Date.now();
      return;
    }
    if (backgroundAt !== null) {
      const elapsed = Date.now() - backgroundAt;
      backgroundAt = null;
      if (elapsed >= BACKGROUND_RELOAD_THRESHOLD_MS) {
        void checkForBuildUpdate('long-background');
      }
    }
  });

  // Periodic hourly check for long-running active sessions
  window.setInterval(() => {
    if (document.visibilityState !== 'hidden') {
      void checkForBuildUpdate('interval');
    }
  }, CHECK_INTERVAL_MS);
}
