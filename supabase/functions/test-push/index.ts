// test-push edge function — admin-only OneSignal test notification.
//
// Sends a hardcoded "Bzead test push" notification to a single user (by
// external_id = profiles.id). Use the admin Notifications page to fire
// this and verify end-to-end delivery without going to the OneSignal
// dashboard.
//
// Required Supabase secrets (already configured for send-push-notification):
//   ONESIGNAL_APP_ID
//   ONESIGNAL_REST_API_KEY
//
// Request body (POST, requires admin JWT):
//   { "recipientUserId": "<uuid>" }   // optional — defaults to caller (self-test)
//
// Response:
//   200 { success: true, recipients: <int> }
//   4xx/5xx { success: false, error: "..." }
export {};

declare const Deno: {
  env: { get: (name: string) => string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

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
  'https://localhost',
  'capacitor://localhost',
  'ionic://localhost',
];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ONESIGNAL_API_URL = 'https://api.onesignal.com/notifications';

function getCorsHeaders(req?: Request) {
  const origin = req?.headers.get('origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function json(body: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

async function authenticateUser(req: Request, supabaseUrl: string, serviceRoleKey: string): Promise<string | null> {
  const authHeader = req.headers.get('Authorization') || '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return null;
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: 'GET',
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) return null;
  const user = await res.json() as { id?: string };
  return user?.id || null;
}

async function isAdmin(adminClient: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
  const { data, error } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return false;
  return String((data as { role?: string }).role || '').toLowerCase() === 'admin';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }
  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405, req);
  }

  try {
    const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '').trim();
    const serviceRoleKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
    const appId = String(Deno.env.get('ONESIGNAL_APP_ID') || '').trim();
    const restApiKey = String(Deno.env.get('ONESIGNAL_REST_API_KEY') || '').trim();

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ success: false, error: 'Server configuration error' }, 500, req);
    }
    if (!appId || !restApiKey) {
      return json({ success: false, error: 'OneSignal credentials not configured' }, 500, req);
    }

    const callerId = await authenticateUser(req, supabaseUrl, serviceRoleKey);
    if (!callerId) {
      return json({ success: false, error: 'Unauthorized' }, 401, req);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    if (!(await isAdmin(adminClient, callerId))) {
      return json({ success: false, error: 'Admin only' }, 403, req);
    }

    const rawBody = await req.json().catch(() => null) as { recipientUserId?: unknown } | null;
    const requested = String(rawBody?.recipientUserId || '').trim();
    const recipientId = requested || callerId;
    if (!UUID_REGEX.test(recipientId)) {
      return json({ success: false, error: 'Invalid recipientUserId' }, 400, req);
    }

    const response = await fetch(ONESIGNAL_API_URL, {
      method: 'POST',
      headers: {
        // OneSignal v2 REST keys (os_v2_app_...) use Basic auth.
        'Authorization': `Basic ${restApiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        app_id: appId,
        target_channel: 'push',
        include_aliases: { external_id: [recipientId] },
        headings: { en: 'Bzead test push' },
        contents: { en: 'If you can read this, push delivery is working.' },
        data: { type: 'test', recipientUserId: recipientId },
      }),
    });

    const text = await response.text();
    let parsed: { recipients?: number; errors?: unknown; id?: string } | null = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* ignore */ }

    if (!response.ok) {
      const errs = (parsed as { errors?: unknown } | null)?.errors;
      const msg = Array.isArray(errs) ? errs.join('; ') : (text || `OneSignal HTTP ${response.status}`);
      return json({ success: false, error: String(msg).slice(0, 500), httpStatus: response.status }, 502, req);
    }

    const recipients = Number(parsed?.recipients || 0) || 0;
    return json({
      success: true,
      recipients,
      notificationId: parsed?.id || null,
      recipientUserId: recipientId,
      note: recipients === 0
        ? 'OneSignal accepted the request but no subscribed device was found for this user. They must open the app/site at least once and accept push permission.'
        : 'Notification dispatched to OneSignal.',
    }, 200, req);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unexpected server error';
    return json({ success: false, error: msg }, 500, req);
  }
});
