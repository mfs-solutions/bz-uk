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

function toString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLocation(payload: {
  place?: string;
  city?: string;
  state?: string;
  country?: string;
  countryCode?: string;
  provider?: string;
}) {
  return {
    place: toString(payload.place),
    city: toString(payload.city),
    state: toString(payload.state),
    country: toString(payload.country),
    countryCode: toString(payload.countryCode).toUpperCase(),
    provider: toString(payload.provider),
  };
}

async function reverseViaOpenCage(latitude: number, longitude: number) {
  const apiKey = Deno.env.get('OPENCAGE_API_KEY')?.trim();
  if (!apiKey) return null;

  const url = new URL('https://api.opencagedata.com/geocode/v1/json');
  url.searchParams.set('q', `${latitude},${longitude}`);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('no_annotations', '1');
  url.searchParams.set('limit', '1');

  const response = await fetch(url.toString());
  if (!response.ok) return null;

  const body = await response.json();
  const top = Array.isArray(body?.results) ? body.results[0] : null;
  if (!top?.components) return null;

  const components = top.components;
  return normalizeLocation({
    place: components.suburb || components.neighbourhood || components.road || components.city_district,
    city: components.city || components.town || components.village || components.county,
    state: components.state,
    country: components.country,
    countryCode: components.country_code,
    provider: 'opencage',
  });
}

async function reverseViaNominatim(latitude: number, longitude: number) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`,
    {
      headers: {
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) return null;

  const body = await response.json();
  const address = body?.address || {};

  return normalizeLocation({
    place: address.suburb || address.neighbourhood || address.road || address.city_district,
    city: address.city || address.town || address.village || address.hamlet || address.county,
    state: address.state || address.region,
    country: address.country,
    countryCode: address.country_code,
    provider: 'nominatim',
  });
}

Deno.serve(async (req) => {
  _activeReq = req;
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  // ── Auth: valid Supabase JWT or service role key required ──
  const _authHeader = req.headers.get('Authorization') || '';
  const _token = _authHeader.replace(/^Bearer\s+/i, '').trim();
  const _svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() || '';
  if (!_token) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (_svcKey && _token !== _svcKey) {
    const _supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').trim().replace(/\/+$/, '');
    const _verifyResp = await fetch(`${_supabaseUrl}/auth/v1/user`, {
      headers: { apikey: _svcKey, Authorization: `Bearer ${_token}` },
    });
    if (!_verifyResp.ok) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const payload = await req.json();
    const latitude = Number(payload?.latitude);
    const longitude = Number(payload?.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return json({ error: 'Invalid latitude/longitude' }, { status: 400 });
    }

    const fromOpenCage = await reverseViaOpenCage(latitude, longitude);
    if (fromOpenCage?.country) {
      return json({ data: fromOpenCage });
    }

    const fromNominatim = await reverseViaNominatim(latitude, longitude);
    if (fromNominatim?.country) {
      return json({ data: fromNominatim });
    }

    return json({ error: 'Unable to resolve location details' }, { status: 502 });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
});
