/**
 * notificationPreferences.ts
 * --------------------------
 * Shared shape for `profiles.notification_preferences` (JSONB column).
 *
 * Read by both the React UI (Settings) and the `send-push-notification`
 * edge function so the client/server agree on:
 *  - which keys exist
 *  - which NotificationType belongs to which user-facing category
 *  - default values when keys are missing (backwards compatible with rows
 *    saved before the push keys were added).
 *
 * IMPORTANT: never hardcode booleans in callers — always read through
 * `mergeNotificationPreferences()` so missing keys fall back to defaults.
 */

import type { NotificationType } from './notificationService';

/** User-facing notification categories shown in the Settings UI. */
export type NotificationCategory =
  | 'orders'
  | 'returns'
  | 'account'
  | 'system'
  | 'promotions';

/** Persisted shape of `profiles.notification_preferences`. */
export interface NotificationPreferences {
  /* Legacy email keys (kept for backwards compatibility). */
  emailNotifications: boolean;
  orderUpdates: boolean;
  promotions: boolean;

  /* Web/native push master switch + per-category granularity. */
  push_enabled: boolean;
  push_orders: boolean;
  push_returns: boolean;
  push_account: boolean;
  push_system: boolean;
  push_promotions: boolean;
}

/**
 * Production defaults. Promotional pushes default OFF; everything else ON
 * so users who already opted-in to a subscription before this UI shipped
 * continue to receive transactional notifications.
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: Readonly<NotificationPreferences> = Object.freeze({
  emailNotifications: true,
  orderUpdates: true,
  promotions: false,

  push_enabled: true,
  push_orders: true,
  push_returns: true,
  push_account: true,
  push_system: true,
  push_promotions: false,
});

/**
 * Map every NotificationType to a user-facing category so we know which
 * preference toggle gates it. Keep in sync with the NotificationType union
 * in `notificationService.ts`.
 */
const CATEGORY_BY_TYPE: Readonly<Record<NotificationType, NotificationCategory>> = Object.freeze({
  // Order lifecycle
  order_new: 'orders',
  order_placed: 'orders',
  order_accepted: 'orders',
  order_rejected: 'orders',
  order_shipped: 'orders',
  order_in_transit: 'orders',
  order_out_for_delivery: 'orders',
  order_delivered: 'orders',
  order_failed_delivery: 'orders',
  order_picked_up: 'orders',
  order_cancelled: 'orders',
  label_ready: 'orders',

  // Returns / refunds
  return_requested: 'returns',
  return_approved: 'returns',
  return_rejected: 'returns',
  refund_processed: 'returns',

  // Account / approvals / payouts
  identity_approved: 'account',
  identity_rejected: 'account',
  identity_pending: 'account',
  product_approved: 'account',
  product_rejected: 'account',
  product_pending: 'account',
  payout_completed: 'account',
  payout_failed: 'account',

  // Warehouse approval workflow
  warehouse_approved: 'account',
  warehouse_rejected: 'account',
  warehouse_pending: 'account',

  // Generic
  system: 'system',
  info: 'system',
});

export function getCategoryForNotificationType(type: string): NotificationCategory {
  return (CATEGORY_BY_TYPE as Record<string, NotificationCategory | undefined>)[type] ?? 'system';
}

/**
 * Coerce an unknown record (e.g. a row from Supabase) into a fully populated
 * NotificationPreferences object, filling missing keys with defaults.
 * Never returns `null`.
 */
export function mergeNotificationPreferences(
  raw: unknown,
): NotificationPreferences {
  const source = (raw && typeof raw === 'object' && !Array.isArray(raw))
    ? (raw as Record<string, unknown>)
    : {};
  const pick = (key: keyof NotificationPreferences): boolean => {
    const value = source[key];
    return typeof value === 'boolean'
      ? value
      : DEFAULT_NOTIFICATION_PREFERENCES[key];
  };
  return {
    emailNotifications: pick('emailNotifications'),
    orderUpdates: pick('orderUpdates'),
    promotions: pick('promotions'),
    push_enabled: pick('push_enabled'),
    push_orders: pick('push_orders'),
    push_returns: pick('push_returns'),
    push_account: pick('push_account'),
    push_system: pick('push_system'),
    push_promotions: pick('push_promotions'),
  };
}

/**
 * True when the user is willing to receive a push of the given notification
 * type given their preferences (master switch + category switch).
 */
export function isPushAllowedForType(
  prefs: NotificationPreferences,
  type: string,
): boolean {
  if (!prefs.push_enabled) return false;
  const category = getCategoryForNotificationType(type);
  switch (category) {
    case 'orders':     return prefs.push_orders;
    case 'returns':    return prefs.push_returns;
    case 'account':    return prefs.push_account;
    case 'system':     return prefs.push_system;
    case 'promotions': return prefs.push_promotions;
    default:           return true;
  }
}
