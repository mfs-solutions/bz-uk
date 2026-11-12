// @ts-nocheck

declare const Deno: {
  env: { get: (name: string) => string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

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

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...getCorsHeaders(_activeReq),
      'Content-Type': 'application/json',
    },
    ...init,
  });
}

function sanitize(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

Deno.serve(async (req) => {
  _activeReq = req;
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, { status: 405 });
  }

  const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
  const fromEmail = Deno.env.get('CONTACT_FROM_EMAIL')?.trim() || Deno.env.get('RESEND_FROM_EMAIL')?.trim() || 'no-reply@mail.bzead.com';
  const toEmail = Deno.env.get('CONTACT_TO_EMAIL')?.trim() || 'info@bzead.com';

  if (!resendKey) {
    return json({ ok: false, error: 'RESEND_API_KEY not configured' }, { status: 500 });
  }

  let payload: { name?: string; email?: string; message?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON payload' }, { status: 400 });
  }

  const name = sanitize(payload.name);
  const email = sanitize(payload.email);
  const message = sanitize(payload.message);

  if (!name || name.length < 2) {
    return json({ ok: false, error: 'Please enter a valid name' }, { status: 400 });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: 'Please enter a valid email address' }, { status: 400 });
  }

  if (!message || message.length < 10) {
    return json({ ok: false, error: 'Message must be at least 10 characters' }, { status: 400 });
  }

  if (message.length > 3000) {
    return json({ ok: false, error: 'Message is too long' }, { status: 400 });
  }

  const subject = `[BZEAD Contact] New message from ${name}`;
  const text = [
    'You received a new contact form message.',
    '',
    `Name: ${name}`,
    `Email: ${email}`,
    '',
    'Message:',
    message,
  ].join('\n');

  const html = `
    <h2>New Contact Form Message</h2>
    <p><strong>Name:</strong> ${name}</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Message:</strong></p>
    <p style="white-space:pre-line;">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
  `;

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `BZEAD Contact <${fromEmail}>`,
        to: [toEmail],
        reply_to: email,
        subject,
        text,
        html,
      }),
    });

    if (!resp.ok) {
      const bodyText = await resp.text();
      const errorMsg = `Resend ${resp.status}: ${bodyText.slice(0, 300)}`;
      console.error('[send-contact-email] Resend error:', errorMsg);
      return json({ ok: false, error: errorMsg }, { status: 502 });
    }

    const data = await resp.json().catch(() => null);
    return json({ ok: true, id: data?.id || `resend-${Date.now()}` });
  } catch (err: any) {
    const errorMsg = (err && err.message) ? String(err.message).slice(0, 300) : 'Failed to send email via Resend';
    console.error('[send-contact-email] Resend error:', errorMsg);
    return json({ ok: false, error: errorMsg }, { status: 502 });
  }
});
