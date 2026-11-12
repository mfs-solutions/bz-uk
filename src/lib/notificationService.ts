/**
 * notificationService.ts
 * ---------------------
 * CRUD + real-time subscription for the `notifications` table.
 */

import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type NotificationType =
  | 'identity_approved'
  | 'identity_rejected'
  | 'identity_pending'
  | 'product_approved'
  | 'product_rejected'
  | 'product_pending'
  | 'order_new'
  | 'order_cancelled'
  | 'payout_completed'
  | 'payout_failed'
  | 'system'
  | 'info'
  | 'order_placed'
  | 'order_accepted'
  | 'order_rejected'
  | 'order_shipped'
  | 'order_in_transit'
  | 'order_out_for_delivery'
  | 'order_delivered'
  | 'order_failed_delivery'
  | 'order_picked_up'
  | 'label_ready'
  | 'return_requested'
  | 'return_approved'
  | 'return_rejected'
  | 'refund_processed'
  | 'warehouse_approved'
  | 'warehouse_rejected'
  | 'warehouse_pending';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  is_read: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CreateNotificationInput {
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

/** Notification types that are only relevant to sellers, not buyers. */
export const SELLER_ONLY_TYPES: NotificationType[] = [
  'product_approved',
  'product_rejected',
  'identity_approved',
  'identity_rejected',
  'identity_pending',
  'payout_completed',
  'payout_failed',
  'warehouse_approved',
  'warehouse_rejected',
  'warehouse_pending',
];

/* ------------------------------------------------------------------ */
/*  Queries                                                            */
/* ------------------------------------------------------------------ */

/** Fetch all notifications for a user, newest first. */
export async function fetchNotifications(userId: string, limit = 50, offset = 0): Promise<{ data: Notification[]; error: string | null }> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  return { data: (data as Notification[]) ?? [], error: error?.message ?? null };
}

/** Get count of unread notifications. */
export async function getUnreadCount(userId: string): Promise<{ count: number; error: string | null }> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  return { count: count ?? 0, error: error?.message ?? null };
}

/** Get unread count excluding seller-only notification types. */
export async function getBuyerUnreadCount(userId: string): Promise<{ count: number; error: string | null }> {
  const quotedSellerTypes = SELLER_ONLY_TYPES.map((type) => `'${type}'`).join(',');
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)
    .not('type', 'in', `(${quotedSellerTypes})`);

  return { count: count ?? 0, error: error?.message ?? null };
}

/** Mark a single notification as read. userId scopes update to owner. */
export async function markAsRead(notificationId: string, userId?: string): Promise<{ success: boolean; error: string | null }> {
  let query = supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);
  if (userId) query = query.eq('user_id', userId);
  const { error } = await query;

  return { success: !error, error: error?.message ?? null };
}

/** Mark ALL notifications for a user as read. */
export async function markAllAsRead(userId: string): Promise<{ success: boolean; error: string | null }> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  return { success: !error, error: error?.message ?? null };
}

export async function createNotification(
  input: CreateNotificationInput,
): Promise<{ data: Notification | null; error: string | null }> {
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: input.user_id,
      type: input.type,
      title: input.title,
      message: input.message,
      metadata: input.metadata || {},
      is_read: false,
    })
    .select('*')
    .single();

  return { data: (data as Notification) ?? null, error: error?.message ?? null };
}

export async function createNotifications(
  inputs: CreateNotificationInput[],
): Promise<{ success: boolean; error: string | null }> {
  if (inputs.length === 0) {
    return { success: true, error: null };
  }

  const payload = inputs.map((input) => ({
    user_id: input.user_id,
    type: input.type,
    title: input.title,
    message: input.message,
    metadata: input.metadata || {},
    is_read: false,
  }));

  const { error } = await supabase.from('notifications').insert(payload);
  return { success: !error, error: error?.message ?? null };
}

/* ------------------------------------------------------------------ */
/*  Realtime                                                           */
/* ------------------------------------------------------------------ */

/**
 * Subscribe to new notifications for a user via Supabase Realtime.
 * Returns a channel reference so the caller can unsubscribe.
 */
export function subscribeToNotifications(
  userId: string,
  onInsert: (notification: Notification) => void,
  onUpdate?: (notification: Notification) => void,
): RealtimeChannel {
  // Use a unique channel name per subscriber so multiple components
  // (e.g. NotificationBell + Notifications page) can both listen without
  // colliding on the same channel — Supabase Realtime rejects adding new
  // .on() callbacks to an already-subscribed channel with the same name.
  const uniqueId = (globalThis.crypto && 'randomUUID' in globalThis.crypto)
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const channel = supabase
    .channel(`notifications:${userId}:${uniqueId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onInsert(payload.new as Notification);
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        if (onUpdate) onUpdate(payload.new as Notification);
      },
    )
    .subscribe();

  return channel;
}

/** Unsubscribe from a notification channel. */
export function unsubscribeFromNotifications(channel: RealtimeChannel) {
  supabase.removeChannel(channel);
}

/* ------------------------------------------------------------------ */
/*  Email via send-email edge function (Resend)                        */
/* ------------------------------------------------------------------ */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://aiiefgjfftmerayihpbv.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

/**
 * Resolve a Bearer token for invoking the send-email edge function.
 * Prefers the current Supabase session JWT; falls back to the anon key so that
 * unauthenticated flows (e.g. guest checkout, contact form) can still pass the
 * function's auth gate.
 */
async function getEdgeFunctionAuthToken(): Promise<string> {
  try {
    const { data } = await supabase.auth.getSession();
    const access = data?.session?.access_token;
    if (access) return access;
  } catch {
    /* ignore — fall back to anon */
  }
  return SUPABASE_ANON_KEY;
}

/** Send a legacy raw email (backward compat, used by non-order flows). */
export async function sendOrderEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const token = await getEdgeFunctionAuthToken();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error || `HTTP ${res.status}` };
    return { success: true };
  } catch (err: any) {
    console.error('[sendOrderEmail] Failed:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Email data passed to the send-email edge function for template rendering.
 * All fields are optional except order_id.
 */
export interface OrderEmailData {
  order_id: string;
  order_date?: string;
  customer_name?: string;
  currency?: string;
  order_total?: string;
  items?: Array<{
    name: string;
    quantity: number;
    price: string;
    variant?: string;
  }>;
  carrier?: string;
  service_level?: string;
  tracking_number?: string;
  delivery_date?: string;
  reason?: string;
  extra_note?: string;
  extra_section?: string;
  payment_method?: string;
  // ── Account-event field (KYC / product lifecycle) ──
  entity_name?: string;
  // ── Admin-only fields (shown only in admin emails) ──
  buyer_address?: string;
  buyer_email?: string;
  buyer_phone?: string;
  seller_name?: string;
  seller_email?: string;
  seller_address?: string;
  product_subtotal?: string;
  platform_charge?: string;
  shipping_charge_actual?: string;
  shipping_charge_extra?: string;
  shipping_charge_total?: string;
  carrier_actual_name?: string;
  platform_profit?: string;
}

type RecipientType = 'buyer' | 'seller' | 'admin';

/**
 * Send structured event-based email via the send-email edge function.
 * The edge function renders the universal template per recipient type.
 */
async function sendStructuredEmail(params: {
  eventType: string;
  data: OrderEmailData;
  recipients: Array<{
    email: string | string[];
    recipientType: RecipientType;
    recipientName: string;
  }>;
  /** Optional file attachment (buyer-only, applied by the edge function). */
  attachment?: { filename: string; base64: string; contentType?: string };
}): Promise<{ success: boolean; error?: string }> {
  try {
    const token = await getEdgeFunctionAuthToken();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error || `HTTP ${res.status}` };
    return { success: true };
  } catch (err: any) {
    console.error('[sendStructuredEmail] Failed:', err);
    return { success: false, error: err.message };
  }
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
        // Ignore context parse errors.
      }
    }

    return `${fallback} (HTTP ${context.status})`;
  }

  const message = String(maybeError.message || '').trim();
  if (message) return message;
  return fallback;
}

async function sendStructuredPush(params: {
  /** Optional order id. When omitted, edge function treats as a non-order
   *  push (admin-only, used for account/product/payout notifications). */
  orderId?: string;
  recipientUserIds: string[];
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.access_token) {
      return { success: false, error: 'Authentication required for push notification dispatch' };
    }

    const { data, error } = await supabase.functions.invoke('send-push-notification', {
      body: {
        orderId: params.orderId || '',
        recipientUserIds: params.recipientUserIds,
        type: params.type,
        title: params.title,
        message: params.message,
        metadata: params.metadata || {},
      },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      const detailedMessage = await extractFunctionErrorMessage(error, 'Push dispatch failed');
      return { success: false, error: detailedMessage };
    }

    const payload = (data || {}) as { success?: boolean; error?: string };
    if (payload.success === false) {
      return { success: false, error: payload.error || 'Push dispatch failed' };
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Push dispatch failed';
    return { success: false, error: message };
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers — look up emails / names + admin IDs                       */
/* ------------------------------------------------------------------ */

/** Cached admin user IDs + emails + names (refreshed once per page load). */
let _adminCache: { ids: string[]; emails: string[]; names: string[] } | null = null;
let _adminCacheExpiresAt = 0;
const ADMIN_CACHE_TTL_MS = 5 * 60 * 1000;

async function getAdminUsersCache(): Promise<{ ids: string[]; emails: string[]; names: string[] }> {
  if (_adminCache && Date.now() < _adminCacheExpiresAt) return _adminCache;
  const { data } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .eq('role', 'admin');
  const ids = (data || []).map(d => d.id).filter(Boolean);
  const emails = (data || []).map(d => d.email).filter(Boolean);
  const names = (data || []).map(d => d.full_name || 'Admin').filter(Boolean);
  _adminCache = { ids, emails, names };
  _adminCacheExpiresAt = Date.now() + ADMIN_CACHE_TTL_MS;
  return _adminCache;
}

/** Look up emails + names + IDs for a list of user IDs from the profiles table. */
async function lookupProfiles(userIds: string[]): Promise<Array<{ id: string; email: string; name: string }>> {
  if (userIds.length === 0) return [];
  const { data } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .in('id', userIds);
  return (data || [])
    .filter(d => d.email)
    .map(d => ({ id: d.id, email: d.email, name: d.full_name || 'Seller' }));
}

/* ------------------------------------------------------------------ */
/*  Order Lifecycle Notification Helper                                */
/* ------------------------------------------------------------------ */

/**
 * Notify buyer + seller(s) + admin about an order event.
 * Creates in-app notifications AND sends structured email to ALL recipients.
 *
 * The email is rendered server-side by the send-email edge function using
 * the universal template. Callers pass structured `emailData` instead of
 * raw HTML — no hardcoding.
 *
 * Recipients config:
 *  - buyerId / buyerEmail / buyerName → buyer in-app + email
 *  - sellerIds                        → seller in-app + email (profiles auto-looked up)
 *  - adminNotify                      → admin in-app + email (admins auto-looked up)
 */
export async function notifyOrderEvent(params: {
  type: NotificationType;
  orderId: string;
  orderNumber: string;
  buyerId?: string;
  buyerEmail?: string;
  buyerName?: string;
  sellerIds?: string[];
  adminNotify?: boolean;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  emailData?: OrderEmailData;
  /** Optional invoice/file attachment. Edge function applies it to the buyer only. */
  emailAttachment?: { filename: string; base64: string; contentType?: string };
  /** Override push/in-app text & type for seller recipients (e.g. `order_new`). */
  sellerOverride?: { type?: NotificationType; title?: string; message?: string };
  /** Override push/in-app text & type for admin recipients. */
  adminOverride?: { type?: NotificationType; title?: string; message?: string };
}): Promise<void> {
  const {
    type, orderId, orderNumber, buyerId, buyerEmail, buyerName,
    sellerIds = [], adminNotify = false,
    title, message, metadata = {},
    emailData,
    emailAttachment,
    sellerOverride, adminOverride,
  } = params;

  const baseMeta = { order_id: orderId, order_number: orderNumber, ...metadata };
  const adminUsers = adminNotify ? await getAdminUsersCache() : null;

  const sellerType = sellerOverride?.type || type;
  const sellerTitle = sellerOverride?.title || title;
  const sellerMessage = sellerOverride?.message || message;
  const adminType = adminOverride?.type || type;
  const adminTitle = adminOverride?.title || title;
  const adminMessage = adminOverride?.message || message;

  // ── In-app notifications ──
  const inputs: CreateNotificationInput[] = [];
  if (buyerId) {
    inputs.push({ user_id: buyerId, type, title, message, metadata: baseMeta });
  }
  for (const sid of sellerIds) {
    inputs.push({ user_id: sid, type: sellerType, title: sellerTitle, message: sellerMessage, metadata: baseMeta });
  }
  if (adminUsers) {
    for (const aid of adminUsers.ids) {
      inputs.push({ user_id: aid, type: adminType, title: adminTitle, message: adminMessage, metadata: baseMeta });
    }
  }

  if (inputs.length > 0) {
    createNotifications(inputs).catch(err =>
      console.error('[notifyOrderEvent] in-app failed:', err),
    );
  }

  // Group recipients by their effective (type, title, message) so each role
  // receives the right push copy. The edge function fans out one push per
  // dispatch but accepts an array of recipients.
  type PushGroup = { type: NotificationType; title: string; message: string; recipients: Set<string> };
  const groups = new Map<string, PushGroup>();
  const addPushRecipient = (uid: string, t: NotificationType, ttl: string, msg: string) => {
    if (!uid) return;
    const key = `${t}::${ttl}::${msg}`;
    let g = groups.get(key);
    if (!g) {
      g = { type: t, title: ttl, message: msg, recipients: new Set() };
      groups.set(key, g);
    }
    g.recipients.add(uid);
  };
  if (buyerId) addPushRecipient(buyerId, type, title, message);
  for (const sid of sellerIds) addPushRecipient(sid, sellerType, sellerTitle, sellerMessage);
  if (adminUsers) {
    for (const aid of adminUsers.ids) addPushRecipient(aid, adminType, adminTitle, adminMessage);
  }

  for (const g of groups.values()) {
    if (g.recipients.size === 0) continue;
    sendStructuredPush({
      orderId,
      recipientUserIds: Array.from(g.recipients),
      type: g.type,
      title: g.title,
      message: g.message,
      metadata: baseMeta,
    }).catch(err =>
      console.error('[notifyOrderEvent] push failed:', err),
    );
  }

  // ── Email notifications (structured, with idempotency via edge function) ──
  if (emailData) {
    const recipients: Array<{ email: string | string[]; recipientType: RecipientType; recipientName: string; recipientUserId?: string }> = [];

    // Enrich emailData with seller info for admin emails (looked up once, used below)
    let sellerProfiles: Array<{ id: string; email: string; name: string }> = [];
    if (sellerIds.length > 0) {
      sellerProfiles = await lookupProfiles(sellerIds);
      // Add seller details to emailData (only rendered in admin emails by the template)
      if (sellerProfiles.length > 0 && !emailData.seller_name) {
        emailData.seller_name = sellerProfiles.map(s => s.name).join(', ');
        emailData.seller_email = sellerProfiles.map(s => s.email).join(', ');
      }
    }

    // Buyer
    if (buyerEmail) {
      recipients.push({ email: buyerEmail, recipientType: 'buyer', recipientName: buyerName || 'Customer', recipientUserId: buyerId });
    }

    // Sellers
    for (const sp of sellerProfiles) {
      recipients.push({ email: sp.email, recipientType: 'seller', recipientName: sp.name, recipientUserId: sp.id });
    }

    // Admins
    if (adminUsers) {
      for (let i = 0; i < adminUsers.emails.length; i++) {
        recipients.push({
          email: adminUsers.emails[i],
          recipientType: 'admin',
          recipientName: adminUsers.names[i] || 'Admin',
          recipientUserId: adminUsers.ids[i],
        });
      }
    }

    if (recipients.length > 0) {
      sendStructuredEmail({
        eventType: type,
        data: emailData,
        recipients,
        attachment: emailAttachment,
      }).catch(err =>
        console.error('[notifyOrderEvent] email failed:', err),
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Account / Product / Payout Notification Helper                     */
/* ------------------------------------------------------------------ */

/**
 * Notify one or more users about a non-order ("account") event such as
 * KYC approve/reject, product approve/reject, or payout success/failure.
 *
 * Caller MUST be an admin — the underlying `send-push-notification` edge
 * function rejects non-order push dispatches from non-admin senders.
 *
 * In-app notifications and (optional) email are always attempted; push
 * dispatch is wrapped in a `.catch` so a push failure never blocks the
 * primary admin action that triggered this call.
 */
export async function notifyAccountEvent(params: {
  type: NotificationType;
  recipientUserIds: string[];
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  /** Optional email dispatch. If omitted, only in-app + push are sent. */
  email?: {
    eventType: string;
    data: OrderEmailData;
    /** Pre-built recipients. If omitted, resolved from recipientUserIds. */
    recipients?: Array<{ email: string | string[]; recipientType: 'buyer' | 'seller' | 'admin'; recipientName: string }>;
    /** Recipient type used when auto-resolving emails from recipientUserIds. */
    recipientType?: 'buyer' | 'seller' | 'admin';
  };
}): Promise<void> {
  const { type, recipientUserIds, title, message, metadata = {}, email } = params;

  const dedupedRecipients = Array.from(
    new Set(recipientUserIds.filter((id): id is string => Boolean(id))),
  );
  if (dedupedRecipients.length === 0) return;

  // In-app notifications
  const inputs: CreateNotificationInput[] = dedupedRecipients.map((uid) => ({
    user_id: uid,
    type,
    title,
    message,
    metadata,
  }));
  createNotifications(inputs).catch((err) =>
    console.error('[notifyAccountEvent] in-app failed:', err),
  );

  // Push dispatch (no orderId — edge function takes the admin/system path)
  sendStructuredPush({
    recipientUserIds: dedupedRecipients,
    type,
    title,
    message,
    metadata,
  }).catch((err) =>
    console.error('[notifyAccountEvent] push failed:', err),
  );

  // Optional structured email
  if (email) {
    (async () => {
      let recipients = email.recipients;
      if (!recipients || recipients.length === 0) {
        const profiles = await lookupProfiles(dedupedRecipients);
        recipients = profiles.map((p) => ({
          email: p.email,
          recipientType: email.recipientType || 'seller',
          recipientName: p.name,
        }));
      }
      if (recipients.length > 0) {
        await sendStructuredEmail({
          eventType: email.eventType,
          data: email.data,
          recipients,
        });
      }
    })().catch((err) =>
      console.error('[notifyAccountEvent] email failed:', err),
    );
  }
}

/**
 * Fan out an admin-facing alert to every admin user. Used for "new KYC
 * submission" and "product pending review" events triggered by sellers.
 *
 * The seller's session JWT is used to invoke `send-push-notification`,
 * which permits non-admin senders for an explicit allowlist of types
 * (`identity_pending`, `product_pending`) when every recipient is an admin.
 *
 * Resolves admin IDs from `profiles.role = 'admin'` at call time so newly
 * added admins are included automatically. Never throws.
 */
export async function notifyAdminsOfEvent(params: {
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  /** Optional email to every admin. */
  email?: { eventType: string; data: OrderEmailData };
}): Promise<void> {
  try {
    const adminUsers = await getAdminUsersCache();
    if (adminUsers.ids.length === 0) return;
    await notifyAccountEvent({
      type: params.type,
      recipientUserIds: adminUsers.ids,
      title: params.title,
      message: params.message,
      metadata: params.metadata,
      email: params.email
        ? {
            eventType: params.email.eventType,
            data: params.email.data,
            recipients: adminUsers.emails.map((email, i) => ({
              email,
              recipientType: 'admin' as const,
              recipientName: adminUsers.names[i] || 'Admin',
            })),
          }
        : undefined,
    });
  } catch (err) {
    console.error('[notifyAdminsOfEvent] failed:', err);
  }
}

