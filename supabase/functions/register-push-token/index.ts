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
  // Capacitor / Ionic mobile WebView origins (Android uses https://localhost when androidScheme is 'https')
  'https://localhost',
  'capacitor://localhost',
  'ionic://localhost',
];

const ALLOWED_PLATFORMS = new Set(['android', 'ios', 'web']);

type PushTokenAction = 'register' | 'unregister';
type PushPlatform = 'android' | 'ios' | 'web';

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
    headers: {
      ...getCorsHeaders(req),
      'Content-Type': 'application/json',
    },
  });
}

function resolveAction(raw: unknown): PushTokenAction {
  const normalized = String(raw || 'register').trim().toLowerCase();
  if (normalized === 'unregister') return 'unregister';
  return 'register';
}

function resolvePlatform(raw: unknown): PushPlatform {
  const normalized = String(raw || '').trim().toLowerCase();
  if (ALLOWED_PLATFORMS.has(normalized)) {
    return normalized as PushPlatform;
  }
  return 'web';
}

function isValidPushToken(token: string): boolean {
  if (token.length < 32 || token.length > 4096) return false;
  if (/\s/.test(token)) return false;
  return true;
}

async function authenticateUser(req: Request, supabaseUrl: string, serviceRoleKey: string): Promise<string | null> {
  const authHeader = req.headers.get('Authorization') || '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return null;

  const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${jwt}`,
    },
  });

  if (!authRes.ok) return null;

  const authUser = await authRes.json() as { id?: string };
  return authUser?.id || null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, req);
  }

  try {
    const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '').trim();
    const serviceRoleKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: 'Server configuration error' }, 500, req);
    }

    const userId = await authenticateUser(req, supabaseUrl, serviceRoleKey);
    if (!userId) {
      return json({ error: 'Unauthorized' }, 401, req);
    }

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return json({ error: 'Invalid request payload' }, 400, req);
    }

    const action = resolveAction(body.action);
    const token = String(body.token || '').trim();

    if (!isValidPushToken(token)) {
      return json({ error: 'Invalid push token' }, 400, req);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    if (action === 'unregister') {
      const { error: deleteError } = await adminClient
        .from('device_push_tokens')
        .delete()
        .eq('user_id', userId)
        .eq('token', token);

      if (deleteError) {
        return json({ error: 'Failed to remove push token' }, 500, req);
      }

      return json({ success: true, action }, 200, req);
    }

    const platform = resolvePlatform(body.platform);

    // Ensure one device token maps to only one account at a time.
    const { error: cleanupError } = await adminClient
      .from('device_push_tokens')
      .delete()
      .neq('user_id', userId)
      .eq('token', token);

    if (cleanupError) {
      return json({ error: 'Failed to clean existing push token ownership' }, 500, req);
    }

    const { error: upsertError } = await adminClient
      .from('device_push_tokens')
      .upsert(
        {
          user_id: userId,
          token,
          platform,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,token' },
      );

    if (upsertError) {
      return json({ error: 'Failed to save push token' }, 500, req);
    }

    return json({ success: true, action, platform }, 200, req);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    return json({ error: message }, 500, req);
  }
});
