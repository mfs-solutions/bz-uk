export {};

declare const Deno: {
  env: { get: (name: string) => string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

// ─── Constants ─────────────────────────────────────────────────

/**
 * Ordered progression of shipment statuses.
 * A status update is only applied if the new status index > current index,
 * preventing regressions (e.g. going from delivered back to in_transit).
 */
const STATUS_PROGRESSION = [
  'label_created',
  'pre_transit',
  'in_transit',
  'out_for_delivery',
  'delivered',
];

/** Maps Shippo tracking status strings to internal status values. */
const SHIPPO_STATUS_MAP: Record<string, string> = {
  PRE_TRANSIT: 'pre_transit',
  TRANSIT: 'in_transit',
  DELIVERED: 'delivered',
  RETURNED: 'returned',
  FAILURE: 'failed',
  UNKNOWN: 'in_transit',
};

/** Maps internal shipment status to order status. */
const ORDER_STATUS_MAP: Record<string, string> = {
  in_transit: 'in_transit',
  out_for_delivery: 'out_for_delivery',
  delivered: 'delivered',
  returned: 'returned',
  failed: 'failed',
};

/** Human-readable labels for buyer/seller notifications. */
const STATUS_LABELS: Record<string, string> = {
  pre_transit: 'Shipment is pre-transit — carrier has received shipment info',
  in_transit: 'Your package is in transit',
  out_for_delivery: 'Your package is out for delivery',
  delivered: 'Your package has been delivered',
  returned: 'Your package has been returned to sender',
  failed: 'Delivery attempt failed',
};

// ─── Helpers ───────────────────────────────────────────────────

function supabaseUrl(): string {
  return (Deno.env.get('SUPABASE_URL') || '').trim().replace(/\/+$/, '');
}

function supabaseHeaders(): Record<string, string> {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() || '';
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
}

async function insertRow(table: string, row: Record<string, unknown>): Promise<boolean> {
  const response = await fetch(`${supabaseUrl()}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });
  if (!response.ok) {
    const details = await response.text();
    console.error(`Failed to insert into ${table}: ${details}`);
    return false;
  }
  return true;
}

async function patchRows(table: string, filter: string, patch: Record<string, unknown>): Promise<boolean> {
  const response = await fetch(`${supabaseUrl()}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    const details = await response.text();
    console.error(`Failed to patch ${table} (${filter}): ${details}`);
    return false;
  }
  return true;
}

async function queryRows<T = Record<string, unknown>>(table: string, query: string): Promise<T[]> {
  const response = await fetch(`${supabaseUrl()}/rest/v1/${table}?${query}`, {
    method: 'GET',
    headers: { ...supabaseHeaders(), Accept: 'application/json' },
  });
  if (!response.ok) return [];
  return (await response.json()) as T[];
}

// ─── Crypto ────────────────────────────────────────────────────

/**
 * Generate a SHA-256 hex digest of the webhook payload for dedup.
 * Uses the Web Crypto API available in Deno.
 */
async function generateEventHash(payload: Record<string, unknown>): Promise<string> {
  const raw = JSON.stringify(payload);
  const encoded = new TextEncoder().encode(raw);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Constant-time string comparison to prevent timing attacks on token validation.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);
  let result = 0;
  for (let i = 0; i < aBuf.length; i++) {
    result |= aBuf[i] ^ bBuf[i];
  }
  return result === 0;
}

// ─── Status helpers ────────────────────────────────────────────

function shouldProgressStatus(currentStatus: string, newStatus: string): boolean {
  const currentIdx = STATUS_PROGRESSION.indexOf(currentStatus);
  const newIdx = STATUS_PROGRESSION.indexOf(newStatus);
  // If either status is outside the progression (e.g. returned, failed), allow it
  if (currentIdx === -1 || newIdx === -1) return true;
  return newIdx > currentIdx;
}

// ─── Notifications ─────────────────────────────────────────────

type NotifType = 'info' | 'order_shipped' | 'order_delivered' | 'order_picked_up' | 'label_ready' | 'refund_processed';

async function notifyUser(
  userId: string,
  title: string,
  message: string,
  metadata: Record<string, unknown>,
  notifType: NotifType = 'info',
): Promise<void> {
  await insertRow('notifications', {
    user_id: userId,
    type: notifType,
    title,
    message,
    is_read: false,
    metadata,
  });
}

/** Best-effort email via send-email edge function (legacy raw mode) */
async function sendEmailNotification(
  email: string | string[],
  subject: string,
  html: string,
): Promise<void> {
  try {
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() || '';
    const resp = await fetch(`${supabaseUrl()}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ to: email, subject, html }),
    });
    if (!resp.ok) console.warn('[shippo-webhook] send-email failed:', resp.status);
  } catch (err) {
    console.warn('[shippo-webhook] send-email error:', err);
  }
}

/** Send structured event-based email via send-email edge function */
async function sendStructuredEmail(
  eventType: string,
  data: Record<string, unknown>,
  recipients: Array<{ email: string | string[]; recipientType: string; recipientName: string }>,
): Promise<void> {
  try {
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() || '';
    const resp = await fetch(`${supabaseUrl()}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ eventType, data, recipients }),
    });
    if (!resp.ok) console.warn('[shippo-webhook] structured send-email failed:', resp.status);
  } catch (err) {
    console.warn('[shippo-webhook] structured send-email error:', err);
  }
}

/** Map shipment status to notification type */
function statusToNotifType(status: string): NotifType {
  if (status === 'delivered') return 'order_delivered';
  if (status === 'picked_up') return 'order_picked_up';
  if (status === 'in_transit' || status === 'shipped') return 'order_shipped';
  return 'info';
}

/** Look up admin user IDs + emails + names */
async function getAdminUsers(): Promise<{ ids: string[]; emails: string[]; names: string[] }> {
  const rows = await queryRows<{ id: string; email: string; full_name: string }>(
    'profiles',
    'select=id,email,full_name&role=eq.admin',
  );
  return {
    ids: rows.map(r => r.id).filter(Boolean),
    emails: rows.map(r => r.email).filter(Boolean),
    names: rows.map(r => r.full_name || 'Admin'),
  };
}

/** Look up email + name for a user ID */
async function getUserProfile(userId: string): Promise<{ email: string | null; name: string }> {
  const rows = await queryRows<{ email: string; full_name: string }>(
    'profiles',
    `select=email,full_name&id=eq.${userId}&limit=1`,
  );
  return { email: rows[0]?.email || null, name: rows[0]?.full_name || 'User' };
}

async function sendStatusNotifications(
  shipment: { id: string; seller_id: string; order_id: string | null },
  mappedStatus: string,
  trackingNumber: string,
): Promise<void> {
  const label = STATUS_LABELS[mappedStatus];
  if (!label) return;

  const notifType = statusToNotifType(mappedStatus);
  const meta = {
    shipment_id: shipment.id,
    tracking_number: trackingNumber,
    status: mappedStatus,
  };

  // Map status to event type for structured email
  const eventTypeMap: Record<string, string> = {
    delivered: 'order_delivered',
    picked_up: 'order_picked_up',
    in_transit: 'order_in_transit',
    shipped: 'order_shipped',
  };
  const eventType = eventTypeMap[mappedStatus] || 'order_shipped';

  // Gather order info for email data
  let buyerId: string | null = null;
  let buyerEmail: string | null = null;
  let buyerName = 'Customer';
  let orderId = shipment.order_id || shipment.id;

  if (shipment.order_id) {
    const orders = await queryRows<{ user_id: string; shipping_address: Record<string, unknown>; order_number: string }>(
      'orders',
      `select=user_id,shipping_address,order_number&id=eq.${shipment.order_id}&limit=1`,
    );
    if (orders[0]) {
      buyerId = orders[0].user_id;
      buyerEmail = (orders[0].shipping_address as any)?.email || null;
      buyerName = (orders[0].shipping_address as any)?.name || (orders[0].shipping_address as any)?.full_name || 'Customer';
      orderId = orders[0].order_number || orderId;
    }
  }

  const emailData: Record<string, unknown> = {
    order_id: orderId,
    carrier: 'Shippo',
    tracking_number: trackingNumber,
  };

  // ── In-app notifications ──
  // Seller
  await notifyUser(shipment.seller_id, `Shipment ${mappedStatus.replace(/_/g, ' ')}`, `Tracking ${trackingNumber}: ${label}`, meta, notifType);

  // Buyer
  if (buyerId && buyerId !== shipment.seller_id) {
    await notifyUser(buyerId, `Order update: ${mappedStatus.replace(/_/g, ' ')}`, label, meta, notifType);
  }

  // Admin (for delivered, picked_up, in_transit)
  let adminIds: string[] = [];
  let adminEmails: string[] = [];
  let adminNames: string[] = [];
  if (['delivered', 'picked_up', 'in_transit'].includes(mappedStatus)) {
    const admins = await getAdminUsers();
    adminIds = admins.ids;
    adminEmails = admins.emails;
    adminNames = admins.names;
    for (const aid of adminIds) {
      await notifyUser(aid, `Shipment ${mappedStatus.replace(/_/g, ' ')}`, `Tracking ${trackingNumber}: ${label}`, meta, notifType);
    }
  }

  // ── Structured email (idempotency handled by send-email edge function) ──
  const recipients: Array<{ email: string | string[]; recipientType: string; recipientName: string; recipientUserId?: string }> = [];

  // Seller email
  const sellerProfile = await getUserProfile(shipment.seller_id);
  if (sellerProfile.email) {
    recipients.push({ email: sellerProfile.email, recipientType: 'seller', recipientName: sellerProfile.name, recipientUserId: shipment.seller_id });
  }

  // Buyer email
  if (buyerEmail && buyerId) {
    recipients.push({ email: buyerEmail, recipientType: 'buyer', recipientName: buyerName, recipientUserId: buyerId });
  }

  // Admin emails
  for (let i = 0; i < adminIds.length; i++) {
    if (adminEmails[i]) {
      recipients.push({ email: adminEmails[i], recipientType: 'admin', recipientName: adminNames[i] || 'Admin', recipientUserId: adminIds[i] });
    }
  }

  if (recipients.length > 0) {
    await sendStructuredEmail(eventType, emailData, recipients);
  }
}

// ─── Event Handlers ────────────────────────────────────────────

async function handleTrackUpdated(
  body: Record<string, unknown>,
  eventHash: string,
): Promise<void> {
  const trackData = (body.data || body) as Record<string, unknown>;
  const trackingNumber = String(trackData.tracking_number || '').trim();

  if (!trackingNumber) {
    console.warn('[shippo-webhook] track_updated: No tracking_number in payload');
    return;
  }

  // Find shipment in DB
  const shipmentRows = await queryRows<{
    id: string;
    seller_id: string;
    order_id: string | null;
    status: string;
  }>(
    'shippo_shipments',
    `select=id,seller_id,order_id,status&tracking_number=eq.${encodeURIComponent(trackingNumber)}&limit=1`,
  );
  const shipment = shipmentRows[0] || null;

  // Store webhook event
  await insertRow('shippo_webhook_events', {
    shipment_id: shipment?.id || null,
    seller_id: shipment?.seller_id || null,
    event_type: 'track_updated',
    tracking_number: trackingNumber,
    current_status: String(
      (trackData.tracking_status as Record<string, unknown>)?.status || '',
    ),
    payload: body,
    event_hash: eventHash,
    processed: false,
  });

  if (!shipment) {
    console.warn(`[shippo-webhook] No shipment found for tracking ${trackingNumber}`);
    return;
  }

  // Process tracking history — insert events (dedup via DB unique index)
  const trackingHistory = (trackData.tracking_history || []) as Record<string, unknown>[];
  for (const event of trackingHistory) {
    const eventStatus = String(
      (event.status as Record<string, unknown>)?.status || event.status || '',
    );
    const eventAt = String(event.status_date || new Date().toISOString());
    // The unique index (shipment_id, status, event_at) handles dedup — insert will
    // silently fail for duplicates, which is the desired behavior
    await insertRow('shippo_tracking_events', {
      shipment_id: shipment.id,
      seller_id: shipment.seller_id,
      status: eventStatus,
      status_details: String(event.status_details || ''),
      location: typeof event.location === 'object'
        ? JSON.stringify(event.location)
        : String(event.location || ''),
      event_at: eventAt,
      raw_payload: event,
    });
  }

  // Update shipment status (with regression guard)
  const trackingStatus = trackData.tracking_status as Record<string, unknown> | null;
  if (trackingStatus) {
    const shippoStatus = String(trackingStatus.status || '');
    const mappedStatus = SHIPPO_STATUS_MAP[shippoStatus] || 'in_transit';

    if (shouldProgressStatus(shipment.status, mappedStatus)) {
      await patchRows('shippo_shipments', `id=eq.${shipment.id}`, {
        status: mappedStatus,
        updated_at: new Date().toISOString(),
      });

      // Sync order status
      if (shipment.order_id) {
        const orderStatus = ORDER_STATUS_MAP[mappedStatus];
        if (orderStatus) {
          await patchRows('orders', `id=eq.${shipment.order_id}`, {
            status: orderStatus,
            ...(mappedStatus === 'delivered' ? { completed_at: new Date().toISOString() } : {}),
          });
        }
      }

      // Send in-app notifications to buyer and seller
      await sendStatusNotifications(shipment, mappedStatus, trackingNumber);
    }
  }

  // Mark webhook event as processed
  const processedEvents = await queryRows<{ id: string }>(
    'shippo_webhook_events',
    `select=id&event_hash=eq.${eventHash}&limit=1`,
  );
  if (processedEvents[0]) {
    await patchRows('shippo_webhook_events', `id=eq.${processedEvents[0].id}`, {
      processed: true,
    });
  }
}

async function handleTransactionCreated(
  body: Record<string, unknown>,
  eventHash: string,
): Promise<void> {
  const txData = (body.data || body) as Record<string, unknown>;
  const transactionId = String(txData.object_id || '').trim();
  const trackingNumber = String(txData.tracking_number || '').trim();
  const labelUrl = String(txData.label_url || '').trim();
  const txStatus = String(txData.status || '').trim();

  // Store webhook event
  await insertRow('shippo_webhook_events', {
    shipment_id: null,
    seller_id: null,
    event_type: 'transaction_created',
    tracking_number: trackingNumber || null,
    current_status: txStatus,
    payload: body,
    event_hash: eventHash,
    processed: false,
  });

  if (!transactionId) return;

  // Link to existing shipment record by transaction ID
  const shipmentRows = await queryRows<{ id: string; seller_id: string }>(
    'shippo_shipments',
    `select=id,seller_id&shippo_transaction_id=eq.${encodeURIComponent(transactionId)}&limit=1`,
  );

  if (shipmentRows[0]) {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (trackingNumber) updates.tracking_number = trackingNumber;
    if (labelUrl) updates.label_url = labelUrl;
    if (txStatus === 'SUCCESS') updates.status = 'label_created';
    else if (txStatus === 'ERROR') updates.status = 'failed';

    await patchRows('shippo_shipments', `id=eq.${shipmentRows[0].id}`, updates);
  }

  // Mark processed
  const webhookEvents = await queryRows<{ id: string }>(
    'shippo_webhook_events',
    `select=id&event_hash=eq.${eventHash}&limit=1`,
  );
  if (webhookEvents[0]) {
    await patchRows('shippo_webhook_events', `id=eq.${webhookEvents[0].id}`, {
      processed: true,
      shipment_id: shipmentRows[0]?.id || null,
      seller_id: shipmentRows[0]?.seller_id || null,
    });
  }
}

async function handleTransactionUpdated(
  body: Record<string, unknown>,
  eventHash: string,
): Promise<void> {
  const txData = (body.data || body) as Record<string, unknown>;
  const transactionId = String(txData.object_id || '').trim();
  const trackingNumber = String(txData.tracking_number || '').trim();
  const labelUrl = String(txData.label_url || '').trim();
  const txStatus = String(txData.status || '').trim();

  // Store webhook event
  await insertRow('shippo_webhook_events', {
    shipment_id: null,
    seller_id: null,
    event_type: 'transaction_updated',
    tracking_number: trackingNumber || null,
    current_status: txStatus,
    payload: body,
    event_hash: eventHash,
    processed: false,
  });

  if (!transactionId) return;

  // Find matching shipment
  const shipmentRows = await queryRows<{ id: string; seller_id: string; order_id: string | null }>(
    'shippo_shipments',
    `select=id,seller_id,order_id&shippo_transaction_id=eq.${encodeURIComponent(transactionId)}&limit=1`,
  );

  if (shipmentRows[0]) {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (trackingNumber) updates.tracking_number = trackingNumber;
    if (labelUrl) updates.label_url = labelUrl;

    if (txStatus === 'REFUNDED') {
      updates.status = 'refunded';
    } else if (txStatus === 'ERROR') {
      updates.status = 'failed';
    }

    await patchRows('shippo_shipments', `id=eq.${shipmentRows[0].id}`, updates);

    // Notify seller, buyer, admin on refund
    if (txStatus === 'REFUNDED') {
      const refundMeta = { shipment_id: shipmentRows[0].id, transaction_id: transactionId };
      const refundTrack = trackingNumber || transactionId;

      // In-app: Seller
      await notifyUser(
        shipmentRows[0].seller_id,
        'Label refunded',
        `Shipping label for tracking ${refundTrack} has been refunded.`,
        refundMeta,
        'refund_processed',
      );

      // Look up order for buyer info
      let buyerId: string | null = null;
      let buyerEmail: string | null = null;
      let buyerName = 'Customer';
      let orderId = shipmentRows[0].order_id || shipmentRows[0].id;

      if (shipmentRows[0].order_id) {
        const refundOrders = await queryRows<{ user_id: string; shipping_address: Record<string, unknown>; order_number: string }>(
          'orders',
          `select=user_id,shipping_address,order_number&id=eq.${shipmentRows[0].order_id}&limit=1`,
        );
        if (refundOrders[0]) {
          buyerId = refundOrders[0].user_id;
          buyerEmail = (refundOrders[0].shipping_address as any)?.email || null;
          buyerName = (refundOrders[0].shipping_address as any)?.name || 'Customer';
          orderId = refundOrders[0].order_number || orderId;
        }
      }

      // In-app: Buyer
      if (buyerId) {
        await notifyUser(
          buyerId,
          'Refund processed',
          `A refund has been processed for your order (tracking ${refundTrack}).`,
          refundMeta,
          'refund_processed',
        );
      }

      // In-app: Admin
      const { ids: adminIds, emails: adminEmails, names: adminNames } = await getAdminUsers();
      for (const aid of adminIds) {
        await notifyUser(aid, 'Label refunded', `Shipping label for tracking ${refundTrack} has been refunded.`, refundMeta, 'refund_processed');
      }

      // Structured email to all recipients (idempotency handled by send-email)
      const recipients: Array<{ email: string | string[]; recipientType: string; recipientName: string; recipientUserId?: string }> = [];

      const sellerProfile = await getUserProfile(shipmentRows[0].seller_id);
      if (sellerProfile.email) {
        recipients.push({ email: sellerProfile.email, recipientType: 'seller', recipientName: sellerProfile.name, recipientUserId: shipmentRows[0].seller_id });
      }
      if (buyerEmail && buyerId) {
        recipients.push({ email: buyerEmail, recipientType: 'buyer', recipientName: buyerName, recipientUserId: buyerId });
      }
      for (let i = 0; i < adminIds.length; i++) {
        if (adminEmails[i]) {
          recipients.push({ email: adminEmails[i], recipientType: 'admin', recipientName: adminNames[i] || 'Admin', recipientUserId: adminIds[i] });
        }
      }

      if (recipients.length > 0) {
        await sendStructuredEmail('refund_processed', {
          order_id: orderId,
          tracking_number: refundTrack,
          carrier: 'Shippo',
        }, recipients);
      }
    }
  }

  // Mark processed
  const webhookEvents = await queryRows<{ id: string }>(
    'shippo_webhook_events',
    `select=id&event_hash=eq.${eventHash}&limit=1`,
  );
  if (webhookEvents[0]) {
    await patchRows('shippo_webhook_events', `id=eq.${webhookEvents[0].id}`, {
      processed: true,
      shipment_id: shipmentRows[0]?.id || null,
      seller_id: shipmentRows[0]?.seller_id || null,
    });
  }
}

// ─── Main Handler ──────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // ── Webhook authentication ──
  // Shippo does not send HMAC signatures. We validate via a shared secret
  // passed as a query parameter in the registered webhook URL:
  //   https://<project>.supabase.co/functions/v1/shippo-webhook?token=<SECRET>
  // The same secret is stored as SHIPPO_WEBHOOK_SECRET in Supabase env.
  const webhookSecret = Deno.env.get('SHIPPO_WEBHOOK_SECRET')?.trim();
  if (webhookSecret) {
    const url = new URL(req.url);
    const providedToken = url.searchParams.get('token') || '';
    if (!providedToken || !timingSafeEqual(providedToken, webhookSecret)) {
      console.error('[shippo-webhook] Invalid or missing webhook token');
      return new Response('Unauthorized', { status: 401 });
    }
  } else {
    console.warn('[shippo-webhook] SHIPPO_WEBHOOK_SECRET not set — webhook validation disabled');
  }

  // ── Parse body ──
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // ── Dedup check via SHA-256 hash ──
  const eventHash = await generateEventHash(body);
  const existingEvents = await queryRows<{ id: string }>(
    'shippo_webhook_events',
    `select=id&event_hash=eq.${eventHash}&limit=1`,
  );
  if (existingEvents.length > 0) {
    return new Response(JSON.stringify({ ok: true, message: 'Duplicate event' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Route by event type ──
  const eventType = String(body.event || '').trim();

  try {
    switch (eventType) {
      case 'track_updated':
        await handleTrackUpdated(body, eventHash);
        break;

      case 'transaction_created':
        await handleTransactionCreated(body, eventHash);
        break;

      case 'transaction_updated':
        await handleTransactionUpdated(body, eventHash);
        break;

      case 'batch_created':
      case 'batch_purchased':
        // Store the event for audit but no specific handling needed
        await insertRow('shippo_webhook_events', {
          shipment_id: null,
          seller_id: null,
          event_type: eventType,
          tracking_number: null,
          current_status: null,
          payload: body,
          event_hash: eventHash,
          processed: true,
        });
        break;

      default:
        // Unknown event type — store for audit
        console.warn(`[shippo-webhook] Unknown event type: ${eventType}`);
        await insertRow('shippo_webhook_events', {
          shipment_id: null,
          seller_id: null,
          event_type: eventType || 'unknown',
          tracking_number: null,
          current_status: null,
          payload: body,
          event_hash: eventHash,
          processed: true,
        });
        break;
    }
  } catch (err) {
    console.error(`[shippo-webhook] Error processing ${eventType}:`, err);
    // Still return 200 — Shippo retries on 5XX and we don't want infinite retries
    // The webhook event was already stored (or will be on next attempt)
  }

  // Return 200 quickly — Shippo expects response within 3 seconds
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});