// @ts-nocheck
export {};

declare const Deno: {
  env: { get: (name: string) => string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

// ─── Constants ─────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  'https://bzead.uk',
  'https://www.bzead.uk',
  'https://bzead.in',
  'https://www.bzead.in',
  'https://bzead.asia',
  'https://www.bzead.asia',
  'https://bzead.eu',
  'https://www.bzead.eu',
  'https://www.bzead.com',
  'https://bzead.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  // Capacitor / Ionic mobile WebView origins (Android uses https://localhost when androidScheme is 'https')
  'https://localhost',
  'capacitor://localhost',
  'ionic://localhost',
];

const SENDER_NAME = 'BZEAD';
const SENDER_EMAIL = (Deno.env.get('RESEND_FROM_EMAIL')?.trim() || 'no-reply@mail.bzead.com');
const DEFAULT_REPLY_TO = (Deno.env.get('RESEND_REPLY_TO')?.trim() || 'support@bzead.com');

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500; // exponential backoff base
const RATE_LIMIT_PER_MINUTE = 240; // 4/sec — well under Resend's 10 req/s limit
const RATE_LIMIT_INTERVAL_MS = Math.ceil(60_000 / RATE_LIMIT_PER_MINUTE); // 250ms between emails

// ─── Supabase REST Helpers ─────────────────────────────────────

function supabaseUrl(): string {
  return (Deno.env.get('SUPABASE_URL') || '').trim().replace(/\/+$/, '');
}

function supabaseHeaders(): Record<string, string> {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() || '';
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

// ─── Email Idempotency ────────────────────────────────────────

/**
 * Check if an email was already sent for this (order_id, event_type, recipient_type, email).
 * Returns true if a 'sent' record exists → caller should skip.
 */
async function checkEmailAlreadySent(
  orderId: string,
  eventType: string,
  recipientType: string,
  email: string,
): Promise<boolean> {
  try {
    const url = `${supabaseUrl()}/rest/v1/email_logs?` +
      `select=id&order_id=eq.${encodeURIComponent(orderId)}` +
      `&event_type=eq.${encodeURIComponent(eventType)}` +
      `&recipient_type=eq.${encodeURIComponent(recipientType)}` +
      `&email=eq.${encodeURIComponent(email)}` +
      `&status=eq.sent&limit=1`;
    const resp = await fetch(url, {
      method: 'GET',
      headers: { ...supabaseHeaders(), Accept: 'application/json' },
    });
    if (!resp.ok) return false; // on error, allow sending (fail-open)
    const rows = await resp.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Log an email attempt (sent / failed / skipped) into email_logs.
 * Uses upsert with the unique index to handle duplicates gracefully.
 */
async function logEmailEvent(
  orderId: string,
  eventType: string,
  recipientType: string,
  email: string,
  status: 'sent' | 'failed' | 'skipped',
  errorMessage?: string,
): Promise<void> {
  try {
    await fetch(`${supabaseUrl()}/rest/v1/email_logs`, {
      method: 'POST',
      headers: {
        ...supabaseHeaders(),
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        order_id: orderId,
        event_type: eventType,
        recipient_type: recipientType,
        email,
        status,
        error_message: errorMessage || null,
      }),
    });
  } catch (err) {
    console.error('[send-email] Failed to log email event:', err);
  }
}

/**
 * Handle email failure: log as failed, trigger in-app notification.
 * Does NOT retry with another provider — Resend API only.
 */
async function handleEmailFailure(
  orderId: string,
  eventType: string,
  recipientType: string,
  email: string,
  errorMessage: string,
  recipientUserId?: string,
): Promise<void> {
  await logEmailEvent(orderId, eventType, recipientType, email, 'failed', errorMessage);
  console.error(`[send-email] FAILED: ${eventType} → ${recipientType} (${email}): ${errorMessage}`);

  // Trigger in-app notification about the failure (for admin visibility)
  if (recipientUserId) {
    try {
      await fetch(`${supabaseUrl()}/rest/v1/notifications`, {
        method: 'POST',
        headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({
          user_id: recipientUserId,
          type: 'info',
          title: 'Email delivery failed',
          message: `Email for "${eventType.replace(/_/g, ' ')}" (order ${orderId}) could not be delivered. You have been notified in-app instead.`,
          is_read: false,
          metadata: { order_id: orderId, event_type: eventType, email_error: errorMessage },
        }),
      });
    } catch {
      // Best-effort — don't fail the whole flow
    }
  }
}

// ─── Event Config ──────────────────────────────────────────────

type EventType =
  | 'order_placed'
  | 'order_accepted'
  | 'order_rejected'
  | 'order_cancelled'
  | 'label_ready'
  | 'order_shipped'
  | 'order_picked_up'
  | 'order_in_transit'
  | 'order_delivered'
  | 'return_requested'
  | 'return_approved'
  | 'return_rejected'
  | 'refund_processed';

type RecipientType = 'buyer' | 'seller' | 'admin';

interface EventConfig {
  subject: Record<RecipientType, string>;
  message: Record<RecipientType, string>;
  recipients: RecipientType[];
}

const EVENT_CONFIG: Record<EventType, EventConfig> = {
  order_placed: {
    subject: {
      buyer: 'Order Confirmation — #{{order_id}}',
      seller: 'New Order Received — #{{order_id}}',
      admin: 'New Order Placed — #{{order_id}}',
    },
    message: {
      buyer: 'Thank you for your order! Your order <strong>#{{order_id}}</strong> has been placed successfully and is being processed. We will notify you once your order is shipped.',
      seller: 'A new order <strong>#{{order_id}}</strong> has been placed by <strong>{{customer_name}}</strong>. Please review and accept the order at your earliest convenience.',
      admin: 'A new order <strong>#{{order_id}}</strong> has been placed by <strong>{{customer_name}}</strong>. Order value: {{currency}} {{order_total}}.',
    },
    recipients: ['buyer', 'seller', 'admin'],
  },
  order_accepted: {
    subject: {
      buyer: 'Order Accepted — #{{order_id}}',
      seller: 'Order Accepted — #{{order_id}}',
      admin: 'Order Accepted — #{{order_id}}',
    },
    message: {
      buyer: 'Great news! Your order <strong>#{{order_id}}</strong> has been accepted by the seller and is being prepared for shipment.',
      seller: 'You have accepted order <strong>#{{order_id}}</strong>. Please proceed with packing and shipping.',
      admin: 'Order <strong>#{{order_id}}</strong> has been accepted by the seller and is being prepared.',
    },
    recipients: ['buyer', 'admin'],
  },
  order_rejected: {
    subject: {
      buyer: 'Order Rejected — #{{order_id}}',
      seller: 'Order Rejection Confirmed — #{{order_id}}',
      admin: 'Order Rejected — #{{order_id}}',
    },
    message: {
      buyer: 'We\'re sorry — your order <strong>#{{order_id}}</strong> has been rejected by the seller.{{#reason}} Reason: {{reason}}.{{/reason}} A refund will be processed if payment was collected.',
      seller: 'You have rejected order <strong>#{{order_id}}</strong>.{{#reason}} Reason: {{reason}}.{{/reason}}',
      admin: 'Order <strong>#{{order_id}}</strong> has been rejected by the seller.{{#reason}} Reason: {{reason}}.{{/reason}}',
    },
    recipients: ['buyer', 'seller', 'admin'],
  },
  order_cancelled: {
    subject: {
      buyer: 'Order Cancelled — #{{order_id}}',
      seller: 'Order Cancelled — #{{order_id}}',
      admin: 'Order Cancelled — #{{order_id}}',
    },
    message: {
      buyer: 'Your order <strong>#{{order_id}}</strong> has been cancelled.{{#reason}} Reason: {{reason}}.{{/reason}} If payment was collected, a refund will be processed.',
      seller: 'Order <strong>#{{order_id}}</strong> from <strong>{{customer_name}}</strong> has been cancelled.{{#reason}} Reason: {{reason}}.{{/reason}}',
      admin: 'Order <strong>#{{order_id}}</strong> has been cancelled.{{#reason}} Reason: {{reason}}.{{/reason}}',
    },
    recipients: ['buyer', 'seller', 'admin'],
  },
  label_ready: {
    subject: {
      buyer: 'Shipping Label Ready — #{{order_id}}',
      seller: 'Shipping Label Ready — #{{order_id}}',
      admin: 'Shipping Label Created — #{{order_id}}',
    },
    message: {
      buyer: 'A shipping label has been created for your order <strong>#{{order_id}}</strong>. Your order will be dispatched soon.',
      seller: 'A shipping label has been created for order <strong>#{{order_id}}</strong>. Tracking: <strong>{{tracking_number}}</strong>. Please download the label, pack the order and hand it to the carrier.',
      admin: 'Shipping label created for order <strong>#{{order_id}}</strong>. Tracking: <strong>{{tracking_number}}</strong>. Carrier: {{carrier}}.',
    },
    recipients: ['seller', 'admin'],
  },
  order_shipped: {
    subject: {
      buyer: 'Your Order Has Been Shipped — #{{order_id}}',
      seller: 'Order Shipped — #{{order_id}}',
      admin: 'Order Shipped — #{{order_id}}',
    },
    message: {
      buyer: 'Your order <strong>#{{order_id}}</strong> has been shipped! Tracking: <strong>{{tracking_number}}</strong>. Carrier: {{carrier}}.{{#delivery_date}} Estimated delivery: {{delivery_date}}.{{/delivery_date}}',
      seller: 'Order <strong>#{{order_id}}</strong> has been shipped. Tracking: <strong>{{tracking_number}}</strong>.',
      admin: 'Order <strong>#{{order_id}}</strong> has been shipped. Tracking: <strong>{{tracking_number}}</strong>. Carrier: {{carrier}}.',
    },
    recipients: ['buyer', 'seller', 'admin'],
  },
  order_picked_up: {
    subject: {
      buyer: 'Order Picked Up by Courier — #{{order_id}}',
      seller: 'Order Picked Up — #{{order_id}}',
      admin: 'Order Picked Up — #{{order_id}}',
    },
    message: {
      buyer: 'Your order <strong>#{{order_id}}</strong> has been picked up by the courier and is on its way! Tracking: <strong>{{tracking_number}}</strong>.',
      seller: 'Order <strong>#{{order_id}}</strong> has been picked up by the carrier. Tracking: <strong>{{tracking_number}}</strong>.',
      admin: 'Order <strong>#{{order_id}}</strong> picked up. Tracking: <strong>{{tracking_number}}</strong>. Carrier: {{carrier}}.',
    },
    recipients: ['buyer', 'seller', 'admin'],
  },
  order_in_transit: {
    subject: {
      buyer: 'Order In Transit — #{{order_id}}',
      seller: 'Order In Transit — #{{order_id}}',
      admin: 'Order In Transit — #{{order_id}}',
    },
    message: {
      buyer: 'Your order <strong>#{{order_id}}</strong> is now in transit. Tracking: <strong>{{tracking_number}}</strong>.{{#delivery_date}} Estimated delivery: {{delivery_date}}.{{/delivery_date}}',
      seller: 'Order <strong>#{{order_id}}</strong> is in transit. Tracking: <strong>{{tracking_number}}</strong>.',
      admin: 'Order <strong>#{{order_id}}</strong> is in transit. Tracking: {{tracking_number}}.',
    },
    recipients: ['buyer', 'seller'],
  },
  order_delivered: {
    subject: {
      buyer: 'Order Delivered — #{{order_id}}',
      seller: 'Order Delivered — #{{order_id}}',
      admin: 'Order Delivered — #{{order_id}}',
    },
    message: {
      buyer: 'Your order <strong>#{{order_id}}</strong> has been delivered! We hope you love your purchase. If you have any issues, please contact support.',
      seller: 'Order <strong>#{{order_id}}</strong> has been delivered to the customer.',
      admin: 'Order <strong>#{{order_id}}</strong> has been delivered. Tracking: {{tracking_number}}.',
    },
    recipients: ['buyer', 'seller', 'admin'],
  },
  return_requested: {
    subject: {
      buyer: 'Return Request Received — #{{order_id}}',
      seller: 'Return Request — #{{order_id}}',
      admin: 'Return Request — #{{order_id}}',
    },
    message: {
      buyer: 'Your return request for order <strong>#{{order_id}}</strong> has been received and is under review.{{#reason}} Reason: {{reason}}.{{/reason}}',
      seller: 'A return has been requested for order <strong>#{{order_id}}</strong> by <strong>{{customer_name}}</strong>.{{#reason}} Reason: {{reason}}.{{/reason}} Please review and respond.',
      admin: 'Return requested for order <strong>#{{order_id}}</strong>.{{#reason}} Reason: {{reason}}.{{/reason}}',
    },
    recipients: ['seller', 'admin'],
  },
  return_approved: {
    subject: {
      buyer: 'Return Approved — #{{order_id}}',
      seller: 'Return Approved — #{{order_id}}',
      admin: 'Return Approved — #{{order_id}}',
    },
    message: {
      buyer: 'Your return request for order <strong>#{{order_id}}</strong> has been approved. Please follow the return instructions provided.',
      seller: 'The return for order <strong>#{{order_id}}</strong> has been approved.{{#extra_note}} Note: {{extra_note}}.{{/extra_note}}',
      admin: 'Return approved for order <strong>#{{order_id}}</strong>.',
    },
    recipients: ['buyer', 'seller'],
  },
  return_rejected: {
    subject: {
      buyer: 'Return Rejected — #{{order_id}}',
      seller: 'Return Rejected — #{{order_id}}',
      admin: 'Return Rejected — #{{order_id}}',
    },
    message: {
      buyer: 'Your return request for order <strong>#{{order_id}}</strong> has been rejected.{{#reason}} Reason: {{reason}}.{{/reason}} If you believe this is an error, please contact support.',
      seller: 'The return for order <strong>#{{order_id}}</strong> has been rejected.{{#reason}} Reason: {{reason}}.{{/reason}}',
      admin: 'Return rejected for order <strong>#{{order_id}}</strong>.{{#reason}} Reason: {{reason}}.{{/reason}}',
    },
    recipients: ['buyer', 'seller', 'admin'],
  },
  refund_processed: {
    subject: {
      buyer: 'Refund Processed — #{{order_id}}',
      seller: 'Refund Issued — #{{order_id}}',
      admin: 'Refund Processed — #{{order_id}}',
    },
    message: {
      buyer: 'A refund has been processed for your order <strong>#{{order_id}}</strong>. The amount will be credited to your original payment method.{{#tracking_number}} Tracking: {{tracking_number}}.{{/tracking_number}}',
      seller: 'A refund has been issued for order <strong>#{{order_id}}</strong>.{{#tracking_number}} Tracking: {{tracking_number}}.{{/tracking_number}}',
      admin: 'Refund processed for order <strong>#{{order_id}}</strong>.{{#tracking_number}} Tracking: {{tracking_number}}.{{/tracking_number}}',
    },
    recipients: ['buyer', 'seller', 'admin'],
  },
};

// ─── Account Event Config (non-order: KYC + product lifecycle) ──
// These use a clean, order-free template (no "Order Details" box).
// `entity_name` carries the business/product name; `reason` is optional.

const ACCOUNT_EVENT_CONFIG: Record<string, { subject: string; message: string }> = {
  identity_pending: {
    subject: 'New KYC Submission Awaiting Review',
    message: 'A seller has submitted KYC verification documents and is awaiting your review.{{#entity_name}} Seller: <strong>{{entity_name}}</strong>.{{/entity_name}} Please review the submission in the admin dashboard.',
  },
  identity_approved: {
    subject: 'Your KYC Has Been Approved',
    message: 'Congratulations! Your KYC verification has been <strong>approved</strong>. You can now list products and start selling on BZEAD.',
  },
  identity_rejected: {
    subject: 'Your KYC Verification Update',
    message: 'Your KYC verification was <strong>not approved</strong>.{{#reason}} Reason: {{reason}}.{{/reason}} Please review your details and resubmit your documents.',
  },
  product_pending: {
    subject: 'New Product Pending Review',
    message: 'A new product{{#entity_name}} <strong>"{{entity_name}}"</strong>{{/entity_name}} has been submitted by a seller and needs your approval. Please review it in the admin dashboard.',
  },
  product_approved: {
    subject: 'Your Product Is Now Live',
    message: 'Good news! Your product{{#entity_name}} <strong>"{{entity_name}}"</strong>{{/entity_name}} has been <strong>approved</strong> and is now live on BZEAD.',
  },
  product_rejected: {
    subject: 'Product Listing Update',
    message: 'Your product{{#entity_name}} <strong>"{{entity_name}}"</strong>{{/entity_name}} was <strong>not approved</strong>.{{#reason}} Reason: {{reason}}.{{/reason}} Please review and resubmit your listing.',
  },
};

// ─── Template Data Interface ──────────────────────────────────

interface EmailData {
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

// ─── Helpers ───────────────────────────────────────────────────

function json(body: unknown, init?: ResponseInit): Response {
  const origin = (init as any)?._origin || 'https://www.bzead.com';
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
      ...(init?.headers || {}),
    },
  });
}

// ─── Template Engine ──────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Simple mustache-like template renderer.
 * Supports:
 *   {{var}}           — replaced with value (HTML-safe in text, raw in HTML)
 *   {{#var}}...{{/var}} — conditional section (rendered only if var is truthy)
 */
function renderTemplate(template: string, vars: Record<string, string | undefined>): string {
  // Conditional sections: {{#key}}content{{/key}}
  let result = template.replace(
    /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_, key, content) => {
      const val = vars[key];
      if (!val) return '';
      // Also replace vars inside the conditional block
      return content.replace(/\{\{(\w+)\}\}/g, (_m: string, k: string) => vars[k] ?? '');
    },
  );
  // Simple variable replacement
  result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
  return result;
}

function buildItemsHtml(items: EmailData['items']): string {
  if (!items || items.length === 0) return '';
  const rows = items.map(item =>
    `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:14px;">
        ${escapeHtml(item.name)}${item.variant ? `<br><span style="color:#888;font-size:12px;">${escapeHtml(item.variant)}</span>` : ''}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;font-size:14px;">${item.quantity}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-size:14px;">${escapeHtml(item.price)}</td>
    </tr>`
  ).join('');

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <thead>
        <tr style="background:#f8f8f8;">
          <th style="padding:8px 12px;text-align:left;font-size:13px;color:#555;border-bottom:2px solid #ddd;">Item</th>
          <th style="padding:8px 12px;text-align:center;font-size:13px;color:#555;border-bottom:2px solid #ddd;">Qty</th>
          <th style="padding:8px 12px;text-align:right;font-size:13px;color:#555;border-bottom:2px solid #ddd;">Price</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function buildAdminOnlySections(data: EmailData): string {
  const cur = data.currency || '';
  let html = '';

  // ── Buyer Details ──
  if (data.customer_name || data.buyer_email || data.buyer_address) {
    html += `
    <div style="background:#eef2ff;border-radius:6px;padding:16px 20px;margin-bottom:20px;border-left:4px solid #6366f1;">
      <h3 style="margin:0 0 12px;font-size:14px;color:#111;text-transform:uppercase;letter-spacing:0.5px;">Buyer Details</h3>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${data.customer_name ? `<tr><td style="padding:4px 0;font-size:14px;color:#555;width:120px;">Name:</td><td style="padding:4px 0;font-size:14px;">${escapeHtml(data.customer_name)}</td></tr>` : ''}
        ${data.buyer_email ? `<tr><td style="padding:4px 0;font-size:14px;color:#555;">Email:</td><td style="padding:4px 0;font-size:14px;">${escapeHtml(data.buyer_email)}</td></tr>` : ''}
        ${data.buyer_phone ? `<tr><td style="padding:4px 0;font-size:14px;color:#555;">Phone:</td><td style="padding:4px 0;font-size:14px;">${escapeHtml(data.buyer_phone)}</td></tr>` : ''}
        ${data.buyer_address ? `<tr><td style="padding:4px 0;font-size:14px;color:#555;vertical-align:top;">Address:</td><td style="padding:4px 0;font-size:14px;">${escapeHtml(data.buyer_address)}</td></tr>` : ''}
      </table>
    </div>`;
  }

  // ── Seller Details ──
  if (data.seller_name || data.seller_email || data.seller_address) {
    html += `
    <div style="background:#fef3c7;border-radius:6px;padding:16px 20px;margin-bottom:20px;border-left:4px solid #f59e0b;">
      <h3 style="margin:0 0 12px;font-size:14px;color:#111;text-transform:uppercase;letter-spacing:0.5px;">Seller Details</h3>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${data.seller_name ? `<tr><td style="padding:4px 0;font-size:14px;color:#555;width:120px;">Name:</td><td style="padding:4px 0;font-size:14px;">${escapeHtml(data.seller_name)}</td></tr>` : ''}
        ${data.seller_email ? `<tr><td style="padding:4px 0;font-size:14px;color:#555;">Email:</td><td style="padding:4px 0;font-size:14px;">${escapeHtml(data.seller_email)}</td></tr>` : ''}
        ${data.seller_address ? `<tr><td style="padding:4px 0;font-size:14px;color:#555;vertical-align:top;">Address:</td><td style="padding:4px 0;font-size:14px;">${escapeHtml(data.seller_address)}</td></tr>` : ''}
      </table>
    </div>`;
  }

  // ── Price Breakdown ──
  if (data.product_subtotal || data.platform_charge || data.shipping_charge_actual || data.platform_profit) {
    html += `
    <div style="background:#f0fdf4;border-radius:6px;padding:16px 20px;margin-bottom:20px;border-left:4px solid #22c55e;">
      <h3 style="margin:0 0 12px;font-size:14px;color:#111;text-transform:uppercase;letter-spacing:0.5px;">Price Breakdown (Admin)</h3>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${data.product_subtotal ? `<tr><td style="padding:4px 0;font-size:14px;color:#555;">Product Subtotal:</td><td style="padding:4px 0;font-size:14px;text-align:right;">${cur} ${escapeHtml(data.product_subtotal)}</td></tr>` : ''}
        ${data.platform_charge ? `<tr><td style="padding:4px 0;font-size:14px;color:#555;">Platform Charge (9%):</td><td style="padding:4px 0;font-size:14px;text-align:right;">${cur} ${escapeHtml(data.platform_charge)}</td></tr>` : ''}
        ${data.shipping_charge_actual ? `<tr><td style="padding:4px 0;font-size:14px;color:#555;">Shipping (Actual Carrier Cost):</td><td style="padding:4px 0;font-size:14px;text-align:right;">${cur} ${escapeHtml(data.shipping_charge_actual)}</td></tr>` : ''}
        ${data.shipping_charge_extra ? `<tr><td style="padding:4px 0;font-size:14px;color:#555;">Shipping (Extra Markup):</td><td style="padding:4px 0;font-size:14px;text-align:right;">${cur} ${escapeHtml(data.shipping_charge_extra)}</td></tr>` : ''}
        ${data.shipping_charge_total ? `<tr><td style="padding:4px 0;font-size:14px;color:#555;">Shipping (Charged to Buyer):</td><td style="padding:4px 0;font-size:14px;text-align:right;">${cur} ${escapeHtml(data.shipping_charge_total)}</td></tr>` : ''}
        ${data.carrier_actual_name ? `<tr><td style="padding:4px 0;font-size:14px;color:#555;">Shipping Carrier:</td><td style="padding:4px 0;font-size:14px;text-align:right;">${escapeHtml(data.carrier_actual_name)}</td></tr>` : ''}
        ${data.delivery_date ? `<tr><td style="padding:4px 0;font-size:14px;color:#555;">Est. Delivery Date:</td><td style="padding:4px 0;font-size:14px;text-align:right;">${escapeHtml(data.delivery_date)}</td></tr>` : ''}
      </table>
      ${data.platform_profit ? `
      <div style="margin-top:12px;padding-top:12px;border-top:2px solid #16a34a;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            <td style="padding:4px 0;font-size:15px;color:#15803d;font-weight:700;">Total Platform Profit:</td>
            <td style="padding:4px 0;font-size:15px;color:#15803d;font-weight:700;text-align:right;">${cur} ${escapeHtml(data.platform_profit)}</td>
          </tr>
        </table>
        <p style="margin:6px 0 0;font-size:12px;color:#6b7280;">= Product Subtotal × 9% + Shipping Extra Markup</p>
      </div>` : ''}
    </div>`;
  }

  return html;
}

function renderEmailHtml(
  recipientName: string,
  mainMessage: string,
  data: EmailData,
  recipientType?: RecipientType,
): string {
  const itemsHtml = buildItemsHtml(data.items);
  const isAdmin = recipientType === 'admin';
  const isSeller = recipientType === 'seller';

  const orderDetailsHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr><td style="padding:4px 0;font-size:14px;color:#555;">Order ID:</td><td style="padding:4px 0;font-size:14px;font-weight:600;">${escapeHtml(data.order_id)}</td></tr>
      ${data.order_date ? `<tr><td style="padding:4px 0;font-size:14px;color:#555;">Order Date:</td><td style="padding:4px 0;font-size:14px;">${escapeHtml(data.order_date)}</td></tr>` : ''}
      ${data.customer_name ? `<tr><td style="padding:4px 0;font-size:14px;color:#555;">Customer:</td><td style="padding:4px 0;font-size:14px;">${escapeHtml(data.customer_name)}</td></tr>` : ''}
      ${data.payment_method ? `<tr><td style="padding:4px 0;font-size:14px;color:#555;">Payment:</td><td style="padding:4px 0;font-size:14px;">${escapeHtml(data.payment_method)}</td></tr>` : ''}
      ${data.order_total ? `<tr><td style="padding:4px 0;font-size:14px;color:#555;">Total:</td><td style="padding:4px 0;font-size:14px;font-weight:600;">${data.currency || ''} ${escapeHtml(data.order_total)}</td></tr>` : ''}
    </table>`;

  // Seller-only: Ship-To block (renders buyer_address as multi-line)
  const sellerShipToHtml = (isSeller && data.buyer_address) ? `
    <div style="background:#fef3c7;border-radius:6px;padding:16px 20px;margin-bottom:20px;border-left:4px solid #f59e0b;">
      <h3 style="margin:0 0 12px;font-size:14px;color:#111;text-transform:uppercase;letter-spacing:0.5px;">Ship To</h3>
      <p style="margin:0;font-size:14px;color:#111;line-height:1.6;">${escapeHtml(data.buyer_address).replace(/\n/g, '<br>')}</p>
    </div>` : '';

  const hasShipping = data.carrier || data.tracking_number || data.delivery_date || data.service_level;
  const shippingHtml = hasShipping ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${data.carrier ? `<tr><td style="padding:4px 0;font-size:14px;color:#555;">Carrier:</td><td style="padding:4px 0;font-size:14px;">${escapeHtml(data.carrier)}</td></tr>` : ''}
      ${data.service_level ? `<tr><td style="padding:4px 0;font-size:14px;color:#555;">Service:</td><td style="padding:4px 0;font-size:14px;">${escapeHtml(data.service_level)}</td></tr>` : ''}
      ${data.tracking_number ? `<tr><td style="padding:4px 0;font-size:14px;color:#555;">Tracking:</td><td style="padding:4px 0;font-size:14px;font-weight:600;">${escapeHtml(data.tracking_number)}</td></tr>` : ''}
      ${data.delivery_date ? `<tr><td style="padding:4px 0;font-size:14px;color:#555;">Est. Delivery:</td><td style="padding:4px 0;font-size:14px;">${escapeHtml(data.delivery_date)}</td></tr>` : ''}
    </table>` : '';

  // Admin-only sections (buyer/seller details + price breakdown)
  const adminSectionsHtml = isAdmin ? buildAdminOnlySections(data) : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

        <!-- Header -->
        <tr><td style="background:#111827;padding:24px 32px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:1px;">BZEAD</h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px;">
          <p style="margin:0 0 20px;font-size:16px;color:#333;">Hi ${escapeHtml(recipientName)},</p>
          <p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.6;">${mainMessage}</p>

          <!-- Order Details -->
          <div style="background:#f9fafb;border-radius:6px;padding:16px 20px;margin-bottom:20px;">
            <h3 style="margin:0 0 12px;font-size:14px;color:#111;text-transform:uppercase;letter-spacing:0.5px;">Order Details</h3>
            ${orderDetailsHtml}
          </div>

          ${itemsHtml ? `
          <!-- Items -->
          <div style="margin-bottom:20px;">
            <h3 style="margin:0 0 12px;font-size:14px;color:#111;text-transform:uppercase;letter-spacing:0.5px;">Items</h3>
            ${itemsHtml}
          </div>` : ''}

          ${sellerShipToHtml}

          ${shippingHtml ? `
          <!-- Shipping -->
          <div style="background:#f9fafb;border-radius:6px;padding:16px 20px;margin-bottom:20px;">
            <h3 style="margin:0 0 12px;font-size:14px;color:#111;text-transform:uppercase;letter-spacing:0.5px;">Shipping Details</h3>
            ${shippingHtml}
          </div>` : ''}

          ${adminSectionsHtml}

          ${data.extra_section ? `
          <!-- Extra -->
          <div style="background:#fef3c7;border-radius:6px;padding:16px 20px;margin-bottom:20px;">
            <p style="margin:0;font-size:14px;color:#92400e;">${data.extra_section}</p>
          </div>` : ''}
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9fafb;padding:24px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 8px;font-size:13px;color:#6b7280;text-align:center;">
            Need help? Contact us at
            <a href="mailto:info@beauzead.com" style="color:#2563eb;text-decoration:none;">info@beauzead.com</a>
            | +44 7555 394997
          </p>
          <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;">Thank you,<br><strong>BZEAD Team</strong></p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Clean, order-free email shell for account events (KYC, product lifecycle).
 * Shares the BZEAD header/footer but omits the order-details box.
 */
function renderAccountEmailHtml(recipientName: string, mainMessage: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

        <!-- Header -->
        <tr><td style="background:#111827;padding:24px 32px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:1px;">BZEAD</h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px;">
          <p style="margin:0 0 20px;font-size:16px;color:#333;">Hi ${escapeHtml(recipientName)},</p>
          <p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.6;">${mainMessage}</p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9fafb;padding:24px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 8px;font-size:13px;color:#6b7280;text-align:center;">
            Need help? Contact us at
            <a href="mailto:info@beauzead.com" style="color:#2563eb;text-decoration:none;">info@beauzead.com</a>
            | +44 7555 394997
          </p>
          <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;">Thank you,<br><strong>BZEAD Team</strong></p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Build subject + HTML for a given event and recipient type.
 */
function buildEmail(
  eventType: EventType,
  recipientType: RecipientType,
  recipientName: string,
  data: EmailData,
): { subject: string; html: string } {
  // Account (non-order) events use a clean, order-free template.
  const accountCfg = ACCOUNT_EVENT_CONFIG[eventType as string];
  if (accountCfg) {
    const vars: Record<string, string | undefined> = {
      entity_name: data.entity_name,
      reason: data.reason,
    };
    const subject = renderTemplate(`BZEAD — ${accountCfg.subject}`, vars);
    const messageHtml = renderTemplate(accountCfg.message, vars);
    return { subject, html: renderAccountEmailHtml(recipientName, messageHtml) };
  }

  const config = EVENT_CONFIG[eventType];
  if (!config) {
    return {
      subject: `BZEAD - Order Update #${data.order_id}`,
      html: renderEmailHtml(recipientName, `There is an update on order <strong>#${data.order_id}</strong>.`, data, recipientType),
    };
  }

  const vars: Record<string, string | undefined> = {
    order_id: data.order_id,
    order_date: data.order_date,
    customer_name: data.customer_name,
    currency: data.currency,
    order_total: data.order_total,
    carrier: data.carrier,
    service_level: data.service_level,
    tracking_number: data.tracking_number,
    delivery_date: data.delivery_date,
    reason: data.reason,
    extra_note: data.extra_note,
    payment_method: data.payment_method,
  };

  const subject = renderTemplate(`BZEAD — ${config.subject[recipientType]}`, vars);
  const messageHtml = renderTemplate(config.message[recipientType], vars);
  const html = renderEmailHtml(recipientName, messageHtml, data, recipientType);

  return { subject, html };
}

// ─── Resend API SendEmail (with retry) ────────────────────────

// Hard cap on a single Resend API call so a hung request can never kill the
// worker with a 503 before the failure is logged.
const RESEND_TIMEOUT_MS = 20_000;

function resendApiKey(): string {
  return Deno.env.get('RESEND_API_KEY')?.trim() || '';
}

async function sendViaResend(
  to: string | string[],
  subject: string,
  html: string,
  text?: string,
  replyTo?: string,
  attachments?: Array<{ filename: string; base64: string; contentType?: string }>,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = resendApiKey();
  if (!apiKey) {
    return { success: false, error: 'Resend API key not configured (RESEND_API_KEY)' };
  }

  const recipients = Array.isArray(to) ? to : [to];
  const finalReplyTo = replyTo || DEFAULT_REPLY_TO;

  // Strip trailing whitespace + collapse blank lines (kept from the SMTP era —
  // harmless for the HTTP API and keeps output identical to what was tested).
  const cleanHtml = html.replace(/[ \t]+$/gm, '').replace(/\n{2,}/g, '\n');

  const payload: Record<string, unknown> = {
    from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
    to: recipients,
    subject,
    html: cleanHtml,
    text: text || 'This email requires an HTML-capable client.',
  };
  if (finalReplyTo) {
    payload.reply_to = finalReplyTo;
  }
  if (attachments && attachments.length > 0) {
    payload.attachments = attachments.map((a) => ({
      filename: a.filename,
      content: a.base64, // Resend expects base64-encoded content
      content_type: a.contentType || 'application/pdf',
    }));
  }

  // Retry loop with exponential backoff
  let lastError = '';
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      await new Promise(r => setTimeout(r, delay));
      console.info(`[send-email] Retry attempt ${attempt}/${MAX_RETRIES} after ${delay}ms`);
    }

    try {
      const resp: Response = await Promise.race([
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Resend request timed out after ${RESEND_TIMEOUT_MS}ms`)), RESEND_TIMEOUT_MS),
        ),
      ]);

      const bodyText = await resp.text();
      let bodyObj: { id?: string } | null = null;
      try { bodyObj = JSON.parse(bodyText); } catch { /* non-JSON body */ }

      if (resp.ok) {
        const messageId = bodyObj?.id ? String(bodyObj.id) : `resend-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        console.info(`[send-email] Sent to ${recipients.join(',')} | Subject: ${subject.slice(0, 60)} | MessageId: ${messageId}`);
        return { success: true, messageId };
      }

      lastError = `Resend ${resp.status}: ${bodyText.slice(0, 300)}`;
      // Don't retry on auth/validation errors — they will never succeed
      if (resp.status === 400 || resp.status === 401 || resp.status === 403 || resp.status === 422) {
        console.error('[send-email] Non-retryable Resend error:', lastError);
        return { success: false, error: lastError };
      }
      console.warn(`[send-email] Retryable Resend error (attempt ${attempt}):`, lastError);
    } catch (err: any) {
      lastError = (err && err.message) ? String(err.message).slice(0, 300) : String(err).slice(0, 300);
      console.warn(`[send-email] Retryable Resend error (attempt ${attempt}):`, lastError);
    }
  }

  console.error(`[send-email] Failed after ${MAX_RETRIES} retries:`, lastError);
  return { success: false, error: `Failed after ${MAX_RETRIES} retries: ${lastError}` };
}

// ─── Batch / Queue Processor (rate-limited + idempotent) ──────

interface QueueItem {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{ filename: string; base64: string; contentType?: string }>;
  // Idempotency metadata
  orderId?: string;
  eventType?: string;
  recipientType?: string;
  recipientUserId?: string;
}

interface QueueResult {
  to: string | string[];
  success: boolean;
  status: 'sent' | 'failed' | 'skipped';
  error?: string;
}

async function processQueue(queue: QueueItem[]): Promise<{ sent: number; failed: number; skipped: number; results: QueueResult[] }> {
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const results: QueueResult[] = [];

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    const primaryEmail = Array.isArray(item.to) ? item.to[0] : item.to;

    // ── Idempotency check ──
    if (item.orderId && item.eventType && item.recipientType) {
      const alreadySent = await checkEmailAlreadySent(
        item.orderId, item.eventType, item.recipientType, primaryEmail,
      );
      if (alreadySent) {
        console.info(`[send-email] SKIPPED (idempotent): ${item.eventType} → ${item.recipientType} (${primaryEmail})`);
        await logEmailEvent(item.orderId, item.eventType, item.recipientType, primaryEmail, 'skipped');
        results.push({ to: item.to, success: true, status: 'skipped' });
        skipped++;
        continue;
      }
    }

    // ── Rate limit delay (except first item) ──
    if (i > 0) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_INTERVAL_MS));
    }

    // ── Send via Resend API ──
    const result = await sendViaResend(item.to, item.subject, item.html, item.text, undefined, item.attachments);

    if (result.success) {
      if (item.orderId && item.eventType && item.recipientType) {
        await logEmailEvent(item.orderId, item.eventType, item.recipientType, primaryEmail, 'sent');
      }
      results.push({ to: item.to, success: true, status: 'sent' });
      sent++;
    } else {
      if (item.orderId && item.eventType && item.recipientType) {
        await handleEmailFailure(
          item.orderId, item.eventType, item.recipientType, primaryEmail,
          result.error || 'Unknown Resend API error', item.recipientUserId,
        );
      }
      results.push({ to: item.to, success: false, status: 'failed', error: result.error });
      failed++;
    }
  }

  return { sent, failed, skipped, results };
}

// ─── Main Handler ──────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405, _origin: allowedOrigin } as any);
  }

  // ── Auth: service role key or valid Supabase user JWT required ──
  const _authHeader = req.headers.get('Authorization') || '';
  const _token = _authHeader.replace(/^Bearer\s+/i, '').trim();
  const _svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() || '';
  if (!_token) {
    return json({ error: 'Unauthorized' }, { status: 401, _origin: allowedOrigin } as any);
  }
  if (_svcKey && _token !== _svcKey) {
    const _supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').trim().replace(/\/+$/, '');
    const _verifyResp = await fetch(`${_supabaseUrl}/auth/v1/user`, {
      headers: { apikey: _svcKey, Authorization: `Bearer ${_token}` },
    });
    if (!_verifyResp.ok) {
      return json({ error: 'Unauthorized' }, { status: 401, _origin: allowedOrigin } as any);
    }
  }
  // ── Body size limit (512 KB) ──
  const _cl = Number(req.headers.get('content-length') || '0');
  if (_cl > 524_288) {
    return json({ error: 'Request too large' }, { status: 413, _origin: allowedOrigin } as any);
  }

  try {
    const body = await req.json();

    // ── Mode 1: Structured event-based email ──
    if (body.eventType && body.recipients) {
      const { eventType, data, recipients, attachment } = body as {
        eventType: EventType;
        data: EmailData;
        recipients: Array<{
          email: string | string[];
          recipientType: RecipientType;
          recipientName: string;
          recipientUserId?: string;
        }>;
        attachment?: { filename: string; base64: string; contentType?: string };
      };

      if (!data?.order_id) {
        return json({ error: 'Missing data.order_id' }, { status: 400, _origin: allowedOrigin } as any);
      }

      const queue: QueueItem[] = [];
      for (const r of recipients) {
        if (!r.email || (Array.isArray(r.email) && r.email.length === 0)) continue;
        const { subject, html } = buildEmail(eventType, r.recipientType, r.recipientName, data);
        // Attach the invoice PDF to the buyer's order-confirmation email only.
        const attachments =
          attachment && attachment.base64 && eventType === 'order_placed' && r.recipientType === 'buyer'
            ? [attachment]
            : undefined;
        queue.push({
          to: r.email,
          subject,
          html,
          attachments,
          orderId: data.order_id,
          eventType,
          recipientType: r.recipientType,
          recipientUserId: r.recipientUserId,
        });
      }

      if (queue.length === 0) {
        return json({ success: true, sent: 0, skipped: 0, message: 'No valid recipients' }, { _origin: allowedOrigin } as any);
      }

      const result = await processQueue(queue);
      console.info(`[send-email] Event: ${eventType} | Order: ${data.order_id} | Sent: ${result.sent} | Failed: ${result.failed} | Skipped: ${result.skipped}`);
      return json({ success: result.failed === 0, ...result }, { _origin: allowedOrigin } as any);
    }

    // ── Mode 2: Legacy raw email (backward compat) ──
    const { to, subject, html, text, replyTo } = body as {
      to: string | string[];
      subject: string;
      html: string;
      text?: string;
      replyTo?: string;
    };

    if (!to || !subject || !html) {
      return json({ error: 'Missing required fields: to, subject, html' }, { status: 400, _origin: allowedOrigin } as any);
    }
    if (typeof subject === 'string' && subject.length > 200) {
      return json({ error: 'Subject exceeds 200 characters' }, { status: 400, _origin: allowedOrigin } as any);
    }
    if (typeof html === 'string' && html.length > 204_800) {
      return json({ error: 'HTML body too large (max 200 KB)' }, { status: 400, _origin: allowedOrigin } as any);
    }

    const result = await sendViaResend(to, subject, html, text, replyTo);

    if (!result.success) {
      return json({ error: result.error }, { status: 502, _origin: allowedOrigin } as any);
    }

    return json({ success: true, messageId: result.messageId }, { _origin: allowedOrigin } as any);
  } catch (err: any) {
    console.error('[send-email] Unhandled error:', err);
    return json({ error: err.message || 'Internal server error' }, { status: 500, _origin: allowedOrigin } as any);
  }
});
