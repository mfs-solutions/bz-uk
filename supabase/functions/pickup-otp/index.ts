// @ts-nocheck — This file runs in the Deno runtime on Supabase Edge Functions.
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

function getCorsHeaders(req?: Request) {
  const origin = req?.headers.get('origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

let _activeReq: Request | undefined;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(_activeReq), 'Content-Type': 'application/json' },
  });
}

function generateOtp(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 10000).padStart(4, '0');
}

function deriveFallbackSequenceFromUserId(userId: string): number {
  const hexTail = userId.replace(/-/g, '').slice(-8);
  const parsed = Number.parseInt(hexTail, 16);
  if (Number.isFinite(parsed) && parsed > 0) {
    return (parsed % 9_999_999) + 1;
  }
  return 1;
}

const OTP_MAX_FAILED_ATTEMPTS = 5;
const OTP_LOCKOUT_MS = 10 * 60 * 1000;

async function sendOtpSms(phone: string, otp: string): Promise<{ success: boolean; error?: string }> {
  const provider = String(Deno.env.get('PICKUP_OTP_PROVIDER') || '').trim().toLowerCase();

  if (provider === 'twilio') {
    const sid = String(Deno.env.get('TWILIO_ACCOUNT_SID') || '').trim();
    const token = String(Deno.env.get('TWILIO_AUTH_TOKEN') || '').trim();
    const from = String(Deno.env.get('TWILIO_FROM_NUMBER') || '').trim();
    if (!sid || !token || !from) {
      return { success: false, error: 'Twilio OTP provider is not fully configured' };
    }

    const body = new URLSearchParams({
      To: phone,
      From: from,
      Body: `Your pickup location OTP is ${otp}. It expires in 10 minutes.`,
    });

    const auth = btoa(`${sid}:${token}`);
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return { success: false, error: `Twilio send failed (${resp.status}): ${text}` };
    }

    return { success: true };
  }

  return { success: false, error: 'No supported OTP provider configured for production' };
}

Deno.serve(async (req: Request) => {
  _activeReq = req;
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';

    // Authenticate the caller
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${jwt}`,
      },
    });
    if (!authRes.ok) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const user = await authRes.json() as { id?: string };
    if (!user?.id) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const body = await req.json();
    const action = String(body.action || '').trim();

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    if (action === 'send_otp') {
      const phone = String(body.phone || '').trim();
      const warehouseType = String(body.warehouseType || 'domestic').trim();

      if (!phone || !/^[0-9+\-() ]{6,20}$/.test(phone)) {
        return json({ error: 'Valid phone number is required' }, 400);
      }
      if (!['domestic', 'international'].includes(warehouseType)) {
        return json({ error: 'warehouseType must be domestic or international' }, 400);
      }

      // Rate limit: max 1 OTP per minute per seller per warehouse type
      const { data: recent } = await adminClient
        .from('pickup_location_otps')
        .select('created_at')
        .eq('seller_id', user.id)
        .eq('warehouse_type', warehouseType)
        .eq('verified', false)
        .gte('created_at', new Date(Date.now() - 60_000).toISOString())
        .limit(1)
        .maybeSingle();

      if (recent) {
        return json({ error: 'Please wait before requesting a new OTP' }, 429);
      }

      // Delete old unverified OTPs for this seller + type
      await adminClient
        .from('pickup_location_otps')
        .delete()
        .eq('seller_id', user.id)
        .eq('warehouse_type', warehouseType)
        .eq('verified', false);

      const otp = generateOtp();

      // Insert OTP record
      const { error: insertError } = await adminClient
        .from('pickup_location_otps')
        .insert({
          seller_id: user.id,
          phone,
          otp_code: otp,
          warehouse_type: warehouseType,
          verified: false,
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        });

      if (insertError) {
        return json({ error: 'Failed to generate OTP' }, 500);
      }

      const isDev = (Deno.env.get('ENVIRONMENT') || '').toLowerCase() !== 'production';

      if (!isDev) {
        const smsResult = await sendOtpSms(phone, otp);
        if (!smsResult.success) {
          return json({ error: smsResult.error || 'Failed to send OTP SMS' }, 500);
        }
      }

      const maskedPhone = phone.length > 4
        ? phone.slice(0, phone.length - 4).replace(/\d/g, '*') + phone.slice(-4)
        : phone;

      return json({
        success: true,
        message: `OTP sent to ${maskedPhone}`,
        maskedPhone,
        // Only include actual OTP in non-production for testing
        ...(isDev ? { devOtp: otp } : {}),
        expiresInSeconds: 600,
      });
    }

    if (action === 'verify_otp') {
      const otpCode = String(body.otpCode || '').trim();
      const warehouseType = String(body.warehouseType || 'domestic').trim();

      if (!otpCode || otpCode.length !== 4) {
        return json({ error: 'A 4-digit OTP code is required' }, 400);
      }

      // Find matching unexpired OTP
      const { data: otpRecord, error: fetchError } = await adminClient
        .from('pickup_location_otps')
        .select('id, otp_code, expires_at, failed_attempts, locked_until')
        .eq('seller_id', user.id)
        .eq('warehouse_type', warehouseType)
        .eq('verified', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError || !otpRecord) {
        return json({ error: 'No pending OTP found. Please request a new one.' }, 400);
      }

      if (new Date(otpRecord.expires_at) < new Date()) {
        return json({ error: 'OTP has expired. Please request a new one.' }, 400);
      }

      const lockedUntil = otpRecord.locked_until ? new Date(otpRecord.locked_until) : null;
      if (lockedUntil && lockedUntil.getTime() > Date.now()) {
        const retryAfterSec = Math.ceil((lockedUntil.getTime() - Date.now()) / 1000);
        return json({ error: 'Too many invalid attempts. Please request a new OTP later.', retryAfterSec }, 429);
      }

      if (otpRecord.otp_code !== otpCode) {
        const failedAttempts = Number(otpRecord.failed_attempts || 0) + 1;
        const shouldLock = failedAttempts >= OTP_MAX_FAILED_ATTEMPTS;
        await adminClient
          .from('pickup_location_otps')
          .update({
            failed_attempts: failedAttempts,
            locked_until: shouldLock ? new Date(Date.now() + OTP_LOCKOUT_MS).toISOString() : null,
          })
          .eq('id', otpRecord.id);
        return json({ error: 'Invalid OTP. Please try again.' }, 400);
      }

      // Mark OTP as verified
      await adminClient
        .from('pickup_location_otps')
        .update({ verified: true, failed_attempts: 0, locked_until: null })
        .eq('id', otpRecord.id);

      return json({ success: true, verified: true });
    }

    if (action === 'get_seller_sequence') {
      const fallbackSequence = deriveFallbackSequenceFromUserId(user.id);

      // Get or create the seller's sequence number for facility code generation
      const { data: existing, error: existingError } = await adminClient
        .from('seller_sequences')
        .select('id')
        .eq('seller_id', user.id)
        .maybeSingle();

      if (existingError) {
        return json({ sequence: fallbackSequence, source: 'fallback' });
      }

      if (existing) {
        return json({ sequence: existing.id });
      }

      // Insert new sequence entry
      const { data: newSeq, error: seqError } = await adminClient
        .from('seller_sequences')
        .insert({ seller_id: user.id })
        .select('id')
        .single();

      if (seqError) {
        return json({ sequence: fallbackSequence, source: 'fallback' });
      }

      return json({ sequence: newSeq?.id || fallbackSequence });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return json({ error: message }, 500);
  }
});
