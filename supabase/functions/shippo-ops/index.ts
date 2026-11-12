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

const SHIPPO_API_BASE = 'https://api.goshippo.com';

type OperationName =
  | 'create_shipment'
  | 'get_rates'
  | 'create_label'
  | 'track_shipment'
  | 'validate_address'
  | 'refund_label'
  | 'create_return_label'
  | 'schedule_pickup';

type IncomingBody = {
  action?: OperationName;
  sellerId?: string;
  orderId?: string;
  requestData?: Record<string, unknown>;
};

type AuthedUser = {
  id: string;
  role?: string;
};

// ─── Helpers ───────────────────────────────────────────────────

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

function supabaseHeaders(): Record<string, string> {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() || '';
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
}

function supabaseUrl(): string {
  return (Deno.env.get('SUPABASE_URL') || '').trim().replace(/\/+$/, '');
}

// ─── Supabase DB Helpers ───────────────────────────────────────

async function insertRow(table: string, row: Record<string, unknown>): Promise<boolean> {
  const response = await fetch(`${supabaseUrl()}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });
  if (!response.ok) {
    const details = await response.text();
    console.error(`Failed to insert into ${table} (HTTP ${response.status}): ${details}`);
    return false;
  }
  return true;
}

async function upsertRow(table: string, row: Record<string, unknown>, _onConflict: string): Promise<boolean> {
  const response = await fetch(`${supabaseUrl()}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      ...supabaseHeaders(),
      Prefer: 'return=minimal,resolution=merge-duplicates',
    },
    body: JSON.stringify(row),
  });
  if (!response.ok) {
    const details = await response.text();
    console.error(`Failed to upsert into ${table} (${_onConflict}): ${details}`);
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

// ─── Auth ──────────────────────────────────────────────────────

async function resolveUser(req: Request): Promise<AuthedUser | null> {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const response = await fetch(`${supabaseUrl()}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() || '',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) return null;

  const user = (await response.json()) as { id?: string; user_metadata?: { role?: string } };
  if (!user?.id) return null;

  const profiles = await queryRows<{ role: string }>('profiles', `select=role&id=eq.${user.id}&limit=1`);
  const role = profiles[0]?.role || user.user_metadata?.role || 'user';

  return { id: user.id, role };
}

// ─── Shippo API Helpers ────────────────────────────────────────

function shippoHeaders(): Record<string, string> {
  const token = Deno.env.get('SHIPPO_API_TOKEN')?.trim() || '';
  return {
    Authorization: `ShippoToken ${token}`,
    'Content-Type': 'application/json',
  };
}

async function shippoFetch(
  path: string,
  method: string,
  body?: Record<string, unknown>,
  retries = 2,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url = `${SHIPPO_API_BASE}${path}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method,
        headers: shippoHeaders(),
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      const responseData = await response.json().catch(() => ({}));

      if (response.ok) {
        return { ok: true, status: response.status, data: responseData };
      }

      // Rate limit — retry after delay
      if (response.status === 429 && attempt < retries) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '2', 10);
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
        continue;
      }

      // Server error — retry
      if (response.status >= 500 && attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }

      return { ok: false, status: response.status, data: responseData };
    } catch (err) {
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      return { ok: false, status: 0, data: { error: String(err) } };
    }
  }

  return { ok: false, status: 0, data: { error: 'Max retries exceeded' } };
}

// ─── Operation Log ─────────────────────────────────────────────

async function logOperation(
  sellerId: string,
  orderId: string | null,
  operation: string,
  requestPayload: unknown,
  responsePayload: unknown,
  httpStatus: number,
  success: boolean,
  errorMessage?: string,
): Promise<void> {
  await insertRow('shippo_operation_logs', {
    seller_id: sellerId,
    order_id: orderId || null,
    operation,
    request_payload: requestPayload || {},
    response_payload: responsePayload || null,
    http_status: httpStatus,
    success,
    error_message: errorMessage || null,
  });
}

// ─── Operations ────────────────────────────────────────────────

async function handleGetRates(
  sellerId: string,
  orderId: string | null,
  requestData: Record<string, unknown>,
): Promise<Response> {
  const addressFrom = requestData.address_from as Record<string, unknown> | undefined;
  const addressTo = requestData.address_to as Record<string, unknown> | undefined;
  const parcel = requestData.parcel as Record<string, unknown> | undefined;

  if (!addressFrom || !addressTo || !parcel) {
    return json({ error: 'address_from, address_to, and parcel are required' }, { status: 400 });
  }

  // Validate required address fields
  for (const [label, addr] of [['address_from', addressFrom], ['address_to', addressTo]] as const) {
    if (!addr.country || !addr.city) {
      return json({ error: `${label} must include country and city` }, { status: 400 });
    }
  }

  // Validate parcel fields
  if (!parcel.weight || !parcel.length || !parcel.width || !parcel.height) {
    return json({ error: 'parcel must include weight, length, width, height' }, { status: 400 });
  }

  // Create shipment to get rates
  const shipmentPayload = {
    address_from: {
      name: addressFrom.name || 'Seller',
      street1: addressFrom.street1 || addressFrom.address || '',
      city: addressFrom.city,
      state: addressFrom.state || '',
      zip: addressFrom.zip || addressFrom.postal_code || '',
      country: addressFrom.country,
      phone: addressFrom.phone || '',
      email: addressFrom.email || '',
    },
    address_to: {
      name: addressTo.name || 'Customer',
      street1: addressTo.street1 || addressTo.address || '',
      city: addressTo.city,
      state: addressTo.state || '',
      zip: addressTo.zip || addressTo.postal_code || '',
      country: addressTo.country,
      phone: addressTo.phone || '',
      email: addressTo.email || '',
    },
    parcels: [{
      length: String(parcel.length),
      width: String(parcel.width),
      height: String(parcel.height),
      distance_unit: String(parcel.distance_unit || 'cm'),
      weight: String(parcel.weight),
      mass_unit: String(parcel.mass_unit || 'g'),
    }],
    async: false,
  };

  const result = await shippoFetch('/shipments/', 'POST', shipmentPayload);

  await logOperation(sellerId, orderId, 'get_rates', shipmentPayload, result.data, result.status, result.ok,
    result.ok ? undefined : JSON.stringify(result.data));

  if (!result.ok) {
    return json({ error: 'Failed to fetch shipping rates from Shippo', details: result.data }, { status: 502 });
  }

  const shipmentData = result.data as Record<string, unknown>;
  const rates = (shipmentData.rates || []) as Record<string, unknown>[];

  // Parse and structure rates
  const structuredRates = rates.map((rate) => {
    const estimatedDays = parseInt(String(rate.estimated_days || '0'), 10);
    const now = new Date();
    const estimatedDeliveryDate = estimatedDays > 0
      ? new Date(now.getTime() + estimatedDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      : null;

    return {
      rate_id: rate.object_id,
      courier_name: rate.provider || '',
      service_level: (rate.servicelevel as Record<string, unknown>)?.name || '',
      service_level_token: (rate.servicelevel as Record<string, unknown>)?.token || '',
      rate: parseFloat(String(rate.amount || '0')),
      currency: String(rate.currency || 'GBP'),
      estimated_delivery_days: estimatedDays,
      estimated_delivery_date: estimatedDeliveryDate,
      arrives_by: rate.arrives_by || null,
      duration_terms: rate.duration_terms || '',
    };
  });

  // Sort by price
  const sortedByPrice = [...structuredRates].sort((a, b) => a.rate - b.rate);
  const sortedBySpeed = [...structuredRates].sort((a, b) => a.estimated_delivery_days - b.estimated_delivery_days);

  return json({
    shipment_id: shipmentData.object_id,
    rates: structuredRates,
    cheapest: sortedByPrice[0] || null,
    fastest: sortedBySpeed[0] || null,
    total_rates: structuredRates.length,
  });
}

async function handleCreateShipment(
  sellerId: string,
  orderId: string | null,
  requestData: Record<string, unknown>,
): Promise<Response> {
  const addressFrom = requestData.address_from as Record<string, unknown> | undefined;
  const addressTo = requestData.address_to as Record<string, unknown> | undefined;
  const parcel = requestData.parcel as Record<string, unknown> | undefined;
  const rateId = requestData.rate_id as string | undefined;
  const selectionMode = String(requestData.selection_mode || 'cheapest');

  if (!addressFrom || !addressTo || !parcel) {
    return json({ error: 'address_from, address_to, and parcel are required' }, { status: 400 });
  }

  // Step 1: Create shipment to get rates
  // Build customs declaration for international shipments
  const fromCountry = String(addressFrom.country || '').toUpperCase();
  const toCountry = String(addressTo.country || '').toUpperCase();
  const isInternational = fromCountry !== toCountry;
  let customsDeclarationId: string | null = null;

  if (isInternational) {
    const lineItems = (requestData.line_items || []) as Array<Record<string, unknown>>;
    const customsItemIds: string[] = [];

    for (const item of lineItems) {
      const itemResult = await shippoFetch('/customs/items/', 'POST', {
        description: String(item.name || 'Product').slice(0, 200),
        quantity: Number(item.quantity || 1),
        net_weight: String(Number(parcel.weight || 0) / Math.max(lineItems.length, 1)),
        mass_unit: String(parcel.mass_unit || 'g'),
        value_amount: String(Number(item.price || 0) * Number(item.quantity || 1)),
        value_currency: String(item.currency || 'GBP'),
        origin_country: fromCountry,
        hs_code: String(item.hs_code || item.hsn_code || ''),
        sku_code: String(item.sku || ''),
      });
      if (itemResult.ok) {
        const itemData = itemResult.data as Record<string, unknown>;
        if (itemData.object_id) customsItemIds.push(String(itemData.object_id));
      }
    }

    // If no line_items provided, create a generic customs item from parcel data
    if (customsItemIds.length === 0) {
      const genericResult = await shippoFetch('/customs/items/', 'POST', {
        description: 'Merchandise',
        quantity: 1,
        net_weight: String(parcel.weight),
        mass_unit: String(parcel.mass_unit || 'g'),
        value_amount: String(requestData.declared_value || '10'),
        value_currency: String(requestData.declared_currency || 'GBP'),
        origin_country: fromCountry,
      });
      if (genericResult.ok) {
        const genericData = genericResult.data as Record<string, unknown>;
        if (genericData.object_id) customsItemIds.push(String(genericData.object_id));
      }
    }

    if (customsItemIds.length > 0) {
      const declResult = await shippoFetch('/customs/declarations/', 'POST', {
        contents_type: 'MERCHANDISE',
        non_delivery_option: 'RETURN',
        certify: true,
        certify_signer: String(addressFrom.name || 'Seller'),
        items: customsItemIds,
        incoterm: 'DDU',
      });
      if (declResult.ok) {
        const declData = declResult.data as Record<string, unknown>;
        customsDeclarationId = String(declData.object_id || '');
      }
    }
  }

  const shipmentPayload: Record<string, unknown> = {
    address_from: {
      name: addressFrom.name || 'Seller',
      street1: addressFrom.street1 || addressFrom.address || '',
      city: addressFrom.city,
      state: addressFrom.state || '',
      zip: addressFrom.zip || addressFrom.postal_code || '',
      country: addressFrom.country,
      phone: addressFrom.phone || '',
      email: addressFrom.email || '',
    },
    address_to: {
      name: addressTo.name || 'Customer',
      street1: addressTo.street1 || addressTo.address || '',
      city: addressTo.city,
      state: addressTo.state || '',
      zip: addressTo.zip || addressTo.postal_code || '',
      country: addressTo.country,
      phone: addressTo.phone || '',
      email: addressTo.email || '',
    },
    parcels: [{
      length: String(parcel.length),
      width: String(parcel.width),
      height: String(parcel.height),
      distance_unit: String(parcel.distance_unit || 'cm'),
      weight: String(parcel.weight),
      mass_unit: String(parcel.mass_unit || 'g'),
    }],
    async: false,
  };

  // Attach customs declaration for international shipments
  if (customsDeclarationId) {
    shipmentPayload.customs_declaration = customsDeclarationId;
  }

  const shipmentResult = await shippoFetch('/shipments/', 'POST', shipmentPayload);

  if (!shipmentResult.ok) {
    await logOperation(sellerId, orderId, 'create_shipment', shipmentPayload, shipmentResult.data, shipmentResult.status, false,
      JSON.stringify(shipmentResult.data));
    return json({ error: 'Failed to create shipment on Shippo', details: shipmentResult.data }, { status: 502 });
  }

  const shipmentData = shipmentResult.data as Record<string, unknown>;
  const rates = (shipmentData.rates || []) as Record<string, unknown>[];

  if (rates.length === 0) {
    await logOperation(sellerId, orderId, 'create_shipment', shipmentPayload, shipmentData, shipmentResult.status, false,
      'No rates returned');
    return json({ error: 'No shipping rates available for this route' }, { status: 422 });
  }

  // Step 2: Select rate
  let selectedRate: Record<string, unknown>;
  if (rateId) {
    const found = rates.find((r) => r.object_id === rateId);
    if (!found) {
      return json({ error: 'Specified rate_id not found in available rates' }, { status: 400 });
    }
    selectedRate = found;
  } else if (selectionMode === 'fastest') {
    selectedRate = [...rates].sort(
      (a, b) => parseInt(String(a.estimated_days || '999'), 10) - parseInt(String(b.estimated_days || '999'), 10)
    )[0];
  } else {
    // cheapest (default)
    selectedRate = [...rates].sort(
      (a, b) => parseFloat(String(a.amount || '999')) - parseFloat(String(b.amount || '999'))
    )[0];
  }

  // Step 3: Purchase label / create transaction
  const transactionPayload = {
    rate: selectedRate.object_id,
    label_file_type: 'PDF',
    async: false,
  };

  const transactionResult = await shippoFetch('/transactions/', 'POST', transactionPayload);

  await logOperation(sellerId, orderId, 'create_shipment', {
    shipment: shipmentPayload,
    selected_rate: selectedRate.object_id,
    selection_mode: rateId ? 'explicit' : selectionMode,
  }, transactionResult.data, transactionResult.status, transactionResult.ok,
    transactionResult.ok ? undefined : JSON.stringify(transactionResult.data));

  if (!transactionResult.ok) {
    return json({ error: 'Failed to purchase shipping label', details: transactionResult.data }, { status: 502 });
  }

  const txData = transactionResult.data as Record<string, unknown>;

  // Step 4: Persist to DB
  const shippoShipmentRow = {
    seller_id: sellerId,
    order_id: orderId || null,
    shippo_shipment_id: String(shipmentData.object_id || ''),
    shippo_transaction_id: String(txData.object_id || ''),
    tracking_number: String(txData.tracking_number || ''),
    label_url: String(txData.label_url || ''),
    courier_name: String(selectedRate.provider || ''),
    service_level: String((selectedRate.servicelevel as Record<string, unknown>)?.name || ''),
    rate_amount: parseFloat(String(selectedRate.amount || '0')),
    rate_currency: String(selectedRate.currency || 'GBP'),
    estimated_delivery_days: parseInt(String(selectedRate.estimated_days || '0'), 10),
    destination_country: String((addressTo.country || '') as string),
    status: 'label_created',
    raw_payload: {
      shipment: shipmentData,
      transaction: txData,
      selected_rate: selectedRate,
    },
  };

  await upsertRow('shippo_shipments', shippoShipmentRow, 'shippo_transaction_id');

  // Update orders table tracking
  if (orderId) {
    await patchRows('orders', `id=eq.${orderId}`, {
      tracking_number: txData.tracking_number || '',
      status: 'processing',
    });
  }

  return json({
    shipment_id: shipmentData.object_id,
    transaction_id: txData.object_id,
    tracking_number: txData.tracking_number,
    label_url: txData.label_url,
    courier_name: selectedRate.provider,
    service_level: (selectedRate.servicelevel as Record<string, unknown>)?.name || '',
    rate: parseFloat(String(selectedRate.amount || '0')),
    currency: selectedRate.currency,
    estimated_delivery_days: parseInt(String(selectedRate.estimated_days || '0'), 10),
    status: txData.status,
  });
}

async function handleCreateLabel(
  sellerId: string,
  orderId: string | null,
  requestData: Record<string, unknown>,
): Promise<Response> {
  const rateId = requestData.rate_id as string | undefined;
  const shipmentId = requestData.shipment_id as string | undefined;

  if (!rateId && !shipmentId) {
    return json({ error: 'rate_id or shipment_id is required' }, { status: 400 });
  }

  let targetRateId = rateId;

  // If only shipment_id given, fetch the shipment and pick the cheapest rate
  if (!targetRateId && shipmentId) {
    const shipmentResult = await shippoFetch(`/shipments/${shipmentId}`, 'GET');
    if (!shipmentResult.ok) {
      return json({ error: 'Failed to fetch shipment', details: shipmentResult.data }, { status: 502 });
    }
    const shipmentData = shipmentResult.data as Record<string, unknown>;
    const rates = (shipmentData.rates || []) as Record<string, unknown>[];
    if (rates.length === 0) {
      return json({ error: 'No rates available for this shipment' }, { status: 422 });
    }
    const cheapest = [...rates].sort(
      (a, b) => parseFloat(String(a.amount || '999')) - parseFloat(String(b.amount || '999'))
    )[0];
    targetRateId = cheapest.object_id as string;
  }

  const transactionPayload = {
    rate: targetRateId,
    label_file_type: 'PDF',
    async: false,
  };

  const result = await shippoFetch('/transactions/', 'POST', transactionPayload);

  await logOperation(sellerId, orderId, 'create_label', transactionPayload, result.data, result.status, result.ok,
    result.ok ? undefined : JSON.stringify(result.data));

  if (!result.ok) {
    return json({ error: 'Failed to create label', details: result.data }, { status: 502 });
  }

  const txData = result.data as Record<string, unknown>;

  // Persist to shippo_shipments
  const shippoShipmentRow: Record<string, unknown> = {
    seller_id: sellerId,
    order_id: orderId || null,
    shippo_transaction_id: String(txData.object_id || ''),
    tracking_number: String(txData.tracking_number || ''),
    label_url: String(txData.label_url || ''),
    status: 'label_created',
    raw_payload: { transaction: txData },
  };
  if (shipmentId) {
    shippoShipmentRow.shippo_shipment_id = shipmentId;
  }
  await upsertRow('shippo_shipments', shippoShipmentRow, 'shippo_transaction_id');

  // Update order tracking if orderId provided
  if (orderId && txData.tracking_number) {
    await patchRows('orders', `id=eq.${orderId}`, {
      tracking_number: String(txData.tracking_number),
      status: 'processing',
    });
  }

  return json({
    transaction_id: txData.object_id,
    tracking_number: txData.tracking_number,
    label_url: txData.label_url,
    status: txData.status,
    courier_name: txData.rate ? 'See shipment' : '',
  });
}

async function handleTrackShipment(
  sellerId: string,
  orderId: string | null,
  requestData: Record<string, unknown>,
): Promise<Response> {
  const trackingNumber = String(requestData.tracking_number || '').trim();
  const carrier = String(requestData.carrier || '').trim();

  if (!trackingNumber || !carrier) {
    return json({ error: 'tracking_number and carrier are required' }, { status: 400 });
  }

  const result = await shippoFetch(`/tracks/${carrier}/${trackingNumber}`, 'GET');

  await logOperation(sellerId, orderId, 'track_shipment',
    { tracking_number: trackingNumber, carrier },
    result.data, result.status, result.ok,
    result.ok ? undefined : JSON.stringify(result.data));

  if (!result.ok) {
    return json({ error: 'Failed to track shipment', details: result.data }, { status: 502 });
  }

  const trackData = result.data as Record<string, unknown>;
  const trackingStatus = trackData.tracking_status as Record<string, unknown> | null;
  const trackingHistory = (trackData.tracking_history || []) as Record<string, unknown>[];

  // Persist tracking events
  if (trackingHistory.length > 0) {
    const shipmentRows = await queryRows<{ id: string }>(
      'shippo_shipments',
      `select=id&tracking_number=eq.${trackingNumber}&limit=1`,
    );
    const dbShipmentId = shipmentRows[0]?.id || null;

    if (dbShipmentId) {
      for (const event of trackingHistory) {
        await insertRow('shippo_tracking_events', {
          shipment_id: dbShipmentId,
          seller_id: sellerId,
          status: String((event.status as Record<string, unknown>)?.status || ''),
          status_details: String((event.status_details as Record<string, unknown>)?.description || event.status_details || ''),
          location: String(event.location?.toString() || ''),
          event_at: event.status_date || new Date().toISOString(),
          raw_payload: event,
        });
      }

      // Update shipment status
      const currentStatus = String(trackingStatus?.status || '').toUpperCase();
      const statusMap: Record<string, string> = {
        DELIVERED: 'delivered',
        IN_TRANSIT: 'in_transit',
        OUT_FOR_DELIVERY: 'out_for_delivery',
        RETURNED: 'returned',
        FAILURE: 'failed',
      };

      await patchRows('shippo_shipments', `id=eq.${dbShipmentId}`, {
        status: statusMap[currentStatus] || 'in_transit',
        updated_at: new Date().toISOString(),
      });

      // Sync order status
      if (orderId && statusMap[currentStatus]) {
        await patchRows('orders', `id=eq.${orderId}`, {
          status: statusMap[currentStatus],
          ...(currentStatus === 'DELIVERED' ? { completed_at: new Date().toISOString() } : {}),
        });
      }
    }
  }

  return json({
    tracking_number: trackingNumber,
    carrier,
    status: trackingStatus?.status || 'UNKNOWN',
    status_details: trackingStatus?.status_details || '',
    status_date: trackingStatus?.status_date || null,
    eta: trackData.eta || null,
    tracking_history: trackingHistory.map((event) => ({
      status: (event.status as Record<string, unknown>)?.status || '',
      details: event.status_details || '',
      location: event.location || '',
      date: event.status_date || '',
    })),
  });
}

async function handleValidateAddress(
  sellerId: string,
  _orderId: string | null,
  requestData: Record<string, unknown>,
): Promise<Response> {
  const address = requestData.address as Record<string, unknown> | undefined;
  if (!address) {
    return json({ error: 'address is required' }, { status: 400 });
  }

  const addressPayload = {
    name: address.name || 'Validation',
    street1: address.street1 || address.address || '',
    city: address.city || '',
    state: address.state || '',
    zip: address.zip || address.postal_code || '',
    country: address.country || '',
    validate: true,
  };

  const result = await shippoFetch('/addresses/', 'POST', addressPayload);

  await logOperation(sellerId, null, 'validate_address', addressPayload, result.data, result.status, result.ok,
    result.ok ? undefined : JSON.stringify(result.data));

  if (!result.ok) {
    return json({ error: 'Address validation failed', details: result.data }, { status: 502 });
  }

  const addrData = result.data as Record<string, unknown>;
  const validationResults = addrData.validation_results as Record<string, unknown> | undefined;

  return json({
    is_valid: validationResults?.is_valid || false,
    messages: validationResults?.messages || [],
    address: {
      street1: addrData.street1,
      city: addrData.city,
      state: addrData.state,
      zip: addrData.zip,
      country: addrData.country,
    },
  });
}

// ─── Refund Label ──────────────────────────────────────────────

async function handleRefundLabel(
  sellerId: string,
  orderId: string | null,
  requestData: Record<string, unknown>,
): Promise<Response> {
  const transactionId = String(requestData.transaction_id || '').trim();

  if (!transactionId) {
    return json({ error: 'transaction_id is required' }, { status: 400 });
  }

  const result = await shippoFetch('/refunds/', 'POST', {
    transaction: transactionId,
    async: false,
  });

  await logOperation(sellerId, orderId, 'refund_label',
    { transaction_id: transactionId },
    result.data, result.status, result.ok,
    result.ok ? undefined : JSON.stringify(result.data));

  if (!result.ok) {
    return json({ error: 'Failed to refund label', details: result.data }, { status: 502 });
  }

  const refundData = result.data as Record<string, unknown>;

  // Update shippo_shipments status to 'refunded'
  await patchRows(
    'shippo_shipments',
    `shippo_transaction_id=eq.${encodeURIComponent(transactionId)}&seller_id=eq.${sellerId}`,
    { status: 'refunded', updated_at: new Date().toISOString() },
  );

  return json({
    refund_id: refundData.object_id,
    status: refundData.status,
    transaction: refundData.transaction,
  });
}

// ─── Create Return Label ───────────────────────────────────────

async function handleCreateReturnLabel(
  sellerId: string,
  orderId: string | null,
  requestData: Record<string, unknown>,
): Promise<Response> {
  // Look up the original shipment to swap from/to addresses
  const shipmentId = String(requestData.shipment_id || '').trim();
  const trackingNumber = String(requestData.tracking_number || '').trim();

  if (!shipmentId && !trackingNumber && !orderId) {
    return json({ error: 'shipment_id, tracking_number, or orderId is required' }, { status: 400 });
  }

  // Find original shipment in DB
  let filter = `select=id,shippo_shipment_id,raw_payload,courier_name&seller_id=eq.${sellerId}&limit=1`;
  if (shipmentId) filter += `&shippo_shipment_id=eq.${encodeURIComponent(shipmentId)}`;
  else if (trackingNumber) filter += `&tracking_number=eq.${encodeURIComponent(trackingNumber)}`;
  else if (orderId) filter += `&order_id=eq.${orderId}`;

  const shipments = await queryRows<{
    id: string;
    shippo_shipment_id: string;
    raw_payload: Record<string, unknown>;
    courier_name: string;
  }>('shippo_shipments', filter);

  if (shipments.length === 0) {
    return json({ error: 'Original shipment not found' }, { status: 404 });
  }

  const originalShipment = shipments[0];
  const shippoShipmentId = originalShipment.shippo_shipment_id;

  if (!shippoShipmentId) {
    return json({ error: 'No Shippo shipment ID on record — cannot create return label' }, { status: 422 });
  }

  // Fetch original shipment from Shippo to get addresses
  const originalResult = await shippoFetch(`/shipments/${shippoShipmentId}`, 'GET');
  if (!originalResult.ok) {
    return json({ error: 'Failed to fetch original shipment from Shippo', details: originalResult.data }, { status: 502 });
  }

  const originalData = originalResult.data as Record<string, unknown>;
  const origAddressFrom = originalData.address_from as Record<string, unknown>;
  const origAddressTo = originalData.address_to as Record<string, unknown>;
  const origParcels = originalData.parcels as Record<string, unknown>[];

  if (!origAddressFrom || !origAddressTo || !origParcels?.length) {
    return json({ error: 'Original shipment data incomplete' }, { status: 422 });
  }

  // Create return shipment — swap from/to
  const returnShipmentPayload: Record<string, unknown> = {
    address_from: origAddressTo,
    address_to: origAddressFrom,
    parcels: origParcels,
    async: false,
    extra: { is_return: true },
  };

  const returnShipmentResult = await shippoFetch('/shipments/', 'POST', returnShipmentPayload);
  if (!returnShipmentResult.ok) {
    await logOperation(sellerId, orderId, 'create_return_label',
      returnShipmentPayload, returnShipmentResult.data, returnShipmentResult.status, false,
      JSON.stringify(returnShipmentResult.data));
    return json({ error: 'Failed to create return shipment', details: returnShipmentResult.data }, { status: 502 });
  }

  const returnShipmentData = returnShipmentResult.data as Record<string, unknown>;
  const returnRates = (returnShipmentData.rates || []) as Record<string, unknown>[];

  if (returnRates.length === 0) {
    await logOperation(sellerId, orderId, 'create_return_label',
      returnShipmentPayload, returnShipmentData, returnShipmentResult.status, false,
      'No return rates available');
    return json({ error: 'No return shipping rates available' }, { status: 422 });
  }

  // Pick cheapest rate
  const cheapestRate = [...returnRates].sort(
    (a, b) => parseFloat(String(a.amount || '999')) - parseFloat(String(b.amount || '999'))
  )[0];

  // Purchase return label
  const txResult = await shippoFetch('/transactions/', 'POST', {
    rate: cheapestRate.object_id,
    label_file_type: 'PDF',
    async: false,
  });

  await logOperation(sellerId, orderId, 'create_return_label', {
    original_shipment_id: shippoShipmentId,
    return_shipment_id: returnShipmentData.object_id,
    selected_rate: cheapestRate.object_id,
  }, txResult.data, txResult.status, txResult.ok,
    txResult.ok ? undefined : JSON.stringify(txResult.data));

  if (!txResult.ok) {
    return json({ error: 'Failed to purchase return label', details: txResult.data }, { status: 502 });
  }

  const txData = txResult.data as Record<string, unknown>;

  // Persist return shipment to DB
  await upsertRow('shippo_shipments', {
    seller_id: sellerId,
    order_id: orderId || null,
    shippo_shipment_id: String(returnShipmentData.object_id || ''),
    shippo_transaction_id: String(txData.object_id || ''),
    tracking_number: String(txData.tracking_number || ''),
    label_url: String(txData.label_url || ''),
    courier_name: String(cheapestRate.provider || ''),
    service_level: String((cheapestRate.servicelevel as Record<string, unknown>)?.name || ''),
    rate_amount: parseFloat(String(cheapestRate.amount || '0')),
    rate_currency: String(cheapestRate.currency || 'GBP'),
    estimated_delivery_days: parseInt(String(cheapestRate.estimated_days || '0'), 10),
    status: 'label_created',
    raw_payload: {
      return_shipment: returnShipmentData,
      transaction: txData,
      original_shipment_id: shippoShipmentId,
    },
  }, 'shippo_transaction_id');

  return json({
    return_shipment_id: returnShipmentData.object_id,
    transaction_id: txData.object_id,
    tracking_number: txData.tracking_number,
    label_url: txData.label_url,
    courier_name: cheapestRate.provider,
    rate: parseFloat(String(cheapestRate.amount || '0')),
    currency: cheapestRate.currency,
    status: txData.status,
  });
}

// ─── Schedule Pickup ───────────────────────────────────────────

async function handleSchedulePickup(
  sellerId: string,
  orderId: string | null,
  requestData: Record<string, unknown>,
): Promise<Response> {
  const carrierAccount = String(requestData.carrier_account || '').trim();
  const transactionIds = requestData.transaction_ids as string[] | undefined;
  const requestedStartTime = String(requestData.requested_start_time || '').trim();
  const requestedEndTime = String(requestData.requested_end_time || '').trim();
  const location = requestData.location as Record<string, unknown> | undefined;

  if (!carrierAccount) {
    return json({ error: 'carrier_account is required' }, { status: 400 });
  }
  if (!transactionIds || transactionIds.length === 0) {
    return json({ error: 'transaction_ids array is required' }, { status: 400 });
  }
  if (!requestedStartTime || !requestedEndTime) {
    return json({ error: 'requested_start_time and requested_end_time are required' }, { status: 400 });
  }
  if (!location || !location.address) {
    return json({ error: 'location with address is required' }, { status: 400 });
  }

  const pickupPayload = {
    carrier_account: carrierAccount,
    location: {
      address: location.address,
      building_location_type: String(location.building_location_type || 'Front Door'),
      building_type: String(location.building_type || 'apartment'),
      instructions: String(location.instructions || ''),
    },
    transactions: transactionIds,
    requested_start_time: requestedStartTime,
    requested_end_time: requestedEndTime,
    metadata: String(requestData.metadata || ''),
    is_test: false,
  };

  const result = await shippoFetch('/pickups/', 'POST', pickupPayload);

  await logOperation(sellerId, orderId, 'schedule_pickup',
    pickupPayload, result.data, result.status, result.ok,
    result.ok ? undefined : JSON.stringify(result.data));

  if (!result.ok) {
    return json({ error: 'Failed to schedule pickup', details: result.data }, { status: 502 });
  }

  const pickupData = result.data as Record<string, unknown>;

  return json({
    pickup_id: pickupData.object_id,
    status: pickupData.status,
    confirmation_code: pickupData.confirmation_code || null,
    confirmed_start_time: pickupData.confirmed_start_time || null,
    confirmed_end_time: pickupData.confirmed_end_time || null,
    cancel_by_time: pickupData.cancel_by_time || null,
    timezone: pickupData.timezone || null,
    messages: pickupData.messages || [],
  });
}

// ─── Rate Limiting ─────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const rateLimitMap = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (rateLimitMap.get(key) || []).filter((t) => t > windowStart);
  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateLimitMap.set(key, timestamps);
    return true;
  }
  timestamps.push(now);
  rateLimitMap.set(key, timestamps);

  // Evict stale entries
  if (rateLimitMap.size > 500) {
    for (const [k, ts] of rateLimitMap) {
      if (ts.every((t) => t <= windowStart)) rateLimitMap.delete(k);
    }
  }
  return false;
}

// ─── Main Handler ──────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  _activeReq = req;

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  // Auth
  const user = await resolveUser(req);
  if (!user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit
  if (isRateLimited(user.id)) {
    return json({ error: 'Too many requests. Please wait and retry.' }, { status: 429 });
  }

  let body: IncomingBody;
  try {
    body = (await req.json()) as IncomingBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = body.action;
  const sellerId = body.sellerId || '';
  const orderId = body.orderId || null;
  const requestData = body.requestData || {};

  if (!action) {
    return json({ error: 'action is required' }, { status: 400 });
  }
  if (!sellerId) {
    return json({ error: 'sellerId is required' }, { status: 400 });
  }

  // Authorization: seller can only operate on own data, admin can act on any
  if (user.role !== 'admin' && user.id !== sellerId) {
    return json({ error: 'Forbidden: cannot act on another seller' }, { status: 403 });
  }

  // Validate Shippo token is configured
  const shippoToken = Deno.env.get('SHIPPO_API_TOKEN')?.trim();
  if (!shippoToken) {
    console.error('SHIPPO_API_TOKEN is not configured');
    return json({ error: 'Shippo integration is not configured' }, { status: 503 });
  }

  try {
    switch (action) {
      case 'get_rates':
        return await handleGetRates(sellerId, orderId, requestData);
      case 'create_shipment':
        return await handleCreateShipment(sellerId, orderId, requestData);
      case 'create_label':
        return await handleCreateLabel(sellerId, orderId, requestData);
      case 'track_shipment':
        return await handleTrackShipment(sellerId, orderId, requestData);
      case 'validate_address':
        return await handleValidateAddress(sellerId, orderId, requestData);
      case 'refund_label':
        return await handleRefundLabel(sellerId, orderId, requestData);
      case 'create_return_label':
        return await handleCreateReturnLabel(sellerId, orderId, requestData);
      case 'schedule_pickup':
        return await handleSchedulePickup(sellerId, orderId, requestData);
      default:
        return json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error(`[shippo-ops] Unhandled error for action=${action}:`, err);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
});
