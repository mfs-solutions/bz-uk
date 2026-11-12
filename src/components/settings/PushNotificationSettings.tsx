/**
 * PushNotificationSettings
 * ------------------------
 * Self-contained section for the Settings page that lets a signed-in user
 * subscribe / unsubscribe from web push notifications and choose which
 * categories they want to receive.
 *
 * Persists to `profiles.notification_preferences` (JSONB) using a
 * read-merge-write pattern so we never clobber keys owned by other
 * sections (e.g. email preferences).
 *
 * Hidden on Capacitor native shells (native uses the OS-level subscription
 * managed by `nativePushNotifications.ts`).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, Check, Loader2, ShieldAlert } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import logger from '../../utils/logger';
import { isNativePlatform } from '../../mobile/nativePlatform';
import { isFirebaseWebPushConfigured } from '../../lib/oneSignalConfig';
import { useWebPushSubscription } from '../../hooks/useWebPushSubscription';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  mergeNotificationPreferences,
  type NotificationPreferences,
} from '../../lib/notificationPreferences';

interface PushNotificationSettingsProps {
  userId: string;
  onSaved?: (message: string) => void;
  onError?: (message: string) => void;
}

interface CategoryRow {
  key: 'push_orders' | 'push_returns' | 'push_account' | 'push_system' | 'push_promotions';
  label: string;
  description: string;
}

const CATEGORY_ROWS: ReadonlyArray<CategoryRow> = Object.freeze([
  { key: 'push_orders', label: 'Order updates', description: 'Placed, accepted, shipped, delivered, cancelled' },
  { key: 'push_returns', label: 'Returns & refunds', description: 'Return requests, approvals, and refund status' },
  { key: 'push_account', label: 'Account & approvals', description: 'Identity, product approval, and payout updates' },
  { key: 'push_system', label: 'System messages', description: 'Service announcements and important alerts' },
  { key: 'push_promotions', label: 'Promotions', description: 'Special offers and marketing (optional)' },
]);

export const PushNotificationSettings: React.FC<PushNotificationSettingsProps> = ({
  userId,
  onSaved,
  onError,
}) => {
  const push = useWebPushSubscription();
  const [prefs, setPrefs] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES,
  );
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  /* Load existing prefs once we have a userId. */
  useEffect(() => {
    let cancelled = false;
    if (!userId) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('notification_preferences')
          .eq('id', userId)
          .single();
        if (error) throw error;
        if (cancelled) return;
        setPrefs(mergeNotificationPreferences(data?.notification_preferences));
      } catch (error) {
        logger.error('Failed to load push preferences', { error });
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  /* Reconcile master toggle with actual subscription state once known. */
  useEffect(() => {
    if (!loaded || !push.ready) return;
    setPrefs((prev) => prev.push_enabled === push.optedIn
      ? prev
      : { ...prev, push_enabled: push.optedIn });
  }, [loaded, push.ready, push.optedIn]);

  const persist = useCallback(async (next: NotificationPreferences) => {
    setSaving(true);
    try {
      // Read-merge-write so we never lose keys owned by other sections
      // (e.g. legacy email preferences edited in parallel).
      const { data, error: readError } = await supabase
        .from('profiles')
        .select('notification_preferences')
        .eq('id', userId)
        .single();
      if (readError) throw readError;
      const current = mergeNotificationPreferences(data?.notification_preferences);
      const merged: NotificationPreferences = {
        ...current,
        push_enabled: next.push_enabled,
        push_orders: next.push_orders,
        push_returns: next.push_returns,
        push_account: next.push_account,
        push_system: next.push_system,
        push_promotions: next.push_promotions,
      };
      const { error: writeError } = await supabase
        .from('profiles')
        .update({ notification_preferences: merged })
        .eq('id', userId);
      if (writeError) throw writeError;
      onSaved?.('Push preferences saved');
    } catch (error) {
      logger.error('Failed to save push preferences', { error });
      const message = error instanceof Error ? error.message : 'Failed to save push preferences';
      onError?.(message);
    } finally {
      setSaving(false);
    }
  }, [userId, onSaved, onError]);

  const handleMasterToggle = useCallback(async () => {
    if (push.busy || saving) return;
    if (push.permission === 'denied' && !push.optedIn) {
      onError?.('Notifications are blocked in your browser. Enable them in site settings and try again.');
      return;
    }
    const targetEnabled = !push.optedIn;
    if (targetEnabled) {
      const state = await push.enable();
      // `push.enable()` returns void and updates state via the hook;
      // re-read latest from the hook after microtask flush.
      void state;
    } else {
      await push.disable();
    }
    // Persist new master flag together with current category prefs.
    await persist({ ...prefs, push_enabled: targetEnabled });
  }, [push, saving, prefs, persist, onError]);

  const handleCategoryToggle = useCallback(async (key: CategoryRow['key'], value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    await persist(next);
  }, [prefs, persist]);

  const masterChecked = push.optedIn && prefs.push_enabled;
  const masterDisabled = !push.ready || push.busy || saving || !push.supported;
  const categoriesDisabled = masterDisabled || !masterChecked;

  const statusBadge = useMemo(() => {
    if (!isFirebaseWebPushConfigured) {
      return <span className="text-xs text-gray-500">Firebase web push not configured</span>;
    }
    if (!push.supported) {
      return <span className="text-xs text-gray-500">Not supported in this browser</span>;
    }
    if (push.permission === 'denied') {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-red-700">
          <ShieldAlert className="h-3.5 w-3.5" /> Blocked in browser
        </span>
      );
    }
    if (push.optedIn) {
      return <span className="text-xs text-green-700">Subscribed</span>;
    }
    return <span className="text-xs text-gray-500">Not subscribed</span>;
  }, [push.supported, push.permission, push.optedIn]);

  if (isNativePlatform) return null;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Browser Push Notifications</h3>
        <p className="text-sm text-gray-500">
          Get instant updates in this browser even when the site is closed.
        </p>
      </div>

      {/* Master toggle */}
      <div className="flex items-center justify-between p-4 bg-gray-100 rounded-lg">
        <div className="flex items-center gap-3">
          {masterChecked
            ? <Bell className="h-5 w-5 text-amber-600" />
            : <BellOff className="h-5 w-5 text-gray-500" />}
          <div>
            <p className="font-medium text-gray-900">Enable on this device</p>
            <div className="text-sm text-gray-500 flex items-center gap-2">
              <span>Allow push notifications in this browser</span>
              {statusBadge}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleMasterToggle}
          disabled={masterDisabled}
          aria-pressed={masterChecked}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
            masterChecked ? 'bg-amber-500' : 'bg-gray-300'
          }`}
        >
          <span className="sr-only">Toggle browser push notifications</span>
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              masterChecked ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
          {(push.busy || saving) && (
            <Loader2 className="absolute -right-6 h-4 w-4 animate-spin text-amber-600" />
          )}
        </button>
      </div>

      {push.permission === 'denied' && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Notifications are blocked for this site. Click the padlock icon in your browser&apos;s
          address bar, set <strong>Notifications</strong> to <strong>Allow</strong>, then reload the page.
        </div>
      )}

      {/* Per-category prefs */}
      <div className="space-y-2">
        {CATEGORY_ROWS.map((row) => (
          <label
            key={row.key}
            className={`flex items-center justify-between p-3 bg-gray-100 rounded-lg ${
              categoriesDisabled ? 'opacity-60' : ''
            }`}
          >
            <div>
              <p className="font-medium text-gray-900">{row.label}</p>
              <p className="text-sm text-gray-500">{row.description}</p>
            </div>
            <input
              type="checkbox"
              checked={prefs[row.key]}
              disabled={categoriesDisabled}
              onChange={(e) => { void handleCategoryToggle(row.key, e.target.checked); }}
              className="w-5 h-5 rounded cursor-pointer disabled:cursor-not-allowed"
            />
          </label>
        ))}
      </div>

      {saving && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Saving…
        </div>
      )}
      {!saving && loaded && push.ready && masterChecked && (
        <div className="flex items-center gap-2 text-sm text-green-700">
          <Check className="h-4 w-4" /> Preferences applied automatically
        </div>
      )}
    </div>
  );
};

export default PushNotificationSettings;
