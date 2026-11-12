export {};

declare const Deno: {
  env: {
    get: (name: string) => string | undefined;
  };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

// ─── Webhook for international shipping tracking updates ───────
// Shiprocket sends POST requests with tracking event data.
// URL must NOT contain shiprocket/sr/kr/kartrocket keywords.
// Security: x-api-key header verified against INTL_WEBHOOK_SECRET.
// Must always return HTTP 200.

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
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

async function insertRow(table: string, row: Record<string, unknown>): Promise<boolean> {
  const response = await fetch(`${supabaseUrl()}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });
  if (!response.ok) {
    const details = await response.text();
    console.error(`[intl-webhook] Failed to insert into ${table}: ${details}`);
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
    console.error(`[intl-webhook] Failed to patch ${table}: ${details}`);
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

async function insertRows(table: string, rows: Record<string, unknown>[]): Promise<boolean> {
  if (rows.length === 0) return true;
  const response = await fetch(`${supabaseUrl()}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!response.ok) {
    const details = await response.text();
    console.error(`[intl-webhook] Failed to bulk insert into ${table}: ${details}`);
    return false;
  }
  return true;
}

/** Simple hash for dedup — deterministic string from key fields */
function eventDedupKey(shipmentId: string, eventAt: string | null, srStatus: string, location: string): string {
  return `${shipmentId}|${eventAt || ''}|${srStatus}|${location}`;
}

// ─── Status Mapping ────────────────────────────────────────────

// Shiprocket webhook status_id → internal order status
function mapShiprocketStatusToOrderStatus(statusId: number, statusLabel: string): string | null {
  // Status IDs from Shiprocket docs:
  // 1=NEW, 3=PICKUP_SCHEDULED, 4=PICKUP_QUEUED, 5=MANIFEST_GENERATED
  // 6=SHIPPED, 7=DELIVERED, 8=ATTEMPTED, 9=OUT_FOR_DELIVERY
  // 12=PICKUP_ERROR, 13=RTO_INITIATED, 14=RTO_DELIVERED
  // 15=CANCELLED, 16=RTO_ACKNOWLEDGED, 17=RETURN_INITIATED
  // 18=IN_TRANSIT (webhook tracking ID; NOT cancellation_requested)
  // 19=OUT_FOR_PICKUP, 20=IN_TRANSIT
  // 42=PICKED_UP, 43=SELF_FULFILLED, 44=DISPOSED_OFF

  if (statusId === 7) return 'delivered';
  if (statusId === 9) return 'out_for_delivery';
  if (statusId === 8) return 'failed_delivery'; // NDR — delivery attempted but failed
  if ([6, 18, 19, 20, 42].includes(statusId)) return 'in_transit';
  if ([15].includes(statusId)) return 'cancelled';
  if ([13, 14, 16].includes(statusId)) return 'returned';
  if (statusId === 17) return 'return_requested';
  if ([3, 4, 5].includes(statusId)) return 'processing';

  // Fallback based on status label
  const normalized = statusLabel.trim().toUpperCase();
  if (normalized === 'DELIVERED') return 'delivered';
  if (normalized.includes('UNDELIVERED') || normalized.includes('NDR') || normalized.includes('FAILED')) return 'failed_delivery';
  if (normalized.includes('IN TRANSIT') || normalized === 'SHIPPED') return 'in_transit';
  if (normalized.includes('CANCEL')) return 'cancelled';
  if (normalized.includes('RETURN') || normalized.includes('RTO')) return 'returned';
  if (normalized.includes('OUT FOR DELIVERY')) return 'out_for_delivery';

  return null;
}

function mapShiprocketStatusToShipmentStatus(statusId: number, statusLabel: string): string {
  if (statusId === 7) return 'delivered';
  if (statusId === 9) return 'out_for_delivery';
  if (statusId === 8) return 'failed'; // NDR — delivery attempted but failed
  if ([6, 18, 19, 20, 42].includes(statusId)) return 'in_transit';
  if ([15].includes(statusId)) return 'cancelled';
  if ([13, 14, 16].includes(statusId)) return 'rto';
  if (statusId === 17) return 'return_requested';
  if ([3, 4, 5].includes(statusId)) return 'manifest_generated';
  return statusLabel.toLowerCase().replace(/\s+/g, '_') || 'unknown';
}

// ─── Status Hierarchy (prevents backward regression) ──────────
// Higher number = more advanced status. Webhook must never regress.
const ORDER_STATUS_RANK: Record<string, number> = {
  processing: 10,
  in_transit: 20,
  out_for_delivery: 30,
  failed_delivery: 35,
  delivered: 50,
  cancelled: 40,
  return_requested: 42,
  returned: 45,
};

function shouldUpdateOrderStatus(currentStatus: string | null, newStatus: string): boolean {
  if (!currentStatus) return true;
  const currentRank = ORDER_STATUS_RANK[currentStatus] ?? 0;
  const newRank = ORDER_STATUS_RANK[newStatus] ?? 0;
  // Allow forward progression, terminal states (delivered), and special transitions
  // Never regress from delivered/returned/cancelled to in_transit/out_for_delivery
  if (currentRank >= 40 && newRank < 40) return false; // Don't go from terminal back to transit
  return newRank >= currentRank;
}

// Shipment status rank (parallel to ORDER_STATUS_RANK, prevents regression)
const SHIPMENT_STATUS_RANK: Record<string, number> = {
  created: 5,
  manifest_generated: 10,
  awb_assigned: 12,
  in_transit: 20,
  out_for_delivery: 30,
  failed: 35,
  delivered: 50,
  cancelled: 40,
  return_requested: 42,
  rto: 45,
};

function shouldUpdateShipmentStatus(currentStatus: string | null, newStatus: string): boolean {
  if (!currentStatus) return true;
  const currentRank = SHIPMENT_STATUS_RANK[currentStatus] ?? 0;
  const newRank = SHIPMENT_STATUS_RANK[newStatus] ?? 0;
  if (currentRank >= 40 && newRank < 40) return false;
  return newRank >= currentRank;
}

// ─── Main Handler ──────────────────────────────────────────────

Deno.serve(async (req) => {
  // Only accept POST
  if (req.method !== 'POST') {
    return json({ status: 'ok' }, 200);
  }

  try {
    // Verify webhook security token
    const webhookSecret = Deno.env.get('INTL_WEBHOOK_SECRET')?.trim() || '';
    if (!webhookSecret) {
      console.error('[intl-webhook] INTL_WEBHOOK_SECRET is not configured — rejecting all requests');
      return json({ error: 'Webhook not configured' }, 500);
    }
    const apiKey = req.headers.get('x-api-key') || '';
    if (apiKey !== webhookSecret) {
      const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown';
      console.error(`[intl-webhook] REJECTED: invalid x-api-key from IP ${clientIp}`);
      return json({ error: 'Unauthorized' }, 401);
    }

    // Enforce max request size (1 MB)
    const contentLength = Number(req.headers.get('content-length') || '0');
    if (contentLength > 1_048_576) {
      console.error('[intl-webhook] Request body too large:', contentLength);
      return json({ error: 'Payload too large' }, 413);
    }

    const rawBody = await req.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = rawBody.trim() ? JSON.parse(rawBody) : {};
    } catch {
      console.error('[intl-webhook] Failed to parse body');
      return json({ status: 'ok' }, 200);
    }

    // Extract key fields from Shiprocket webhook payload
    const awb = String(payload.awb || '').trim();
    const courierName = String(payload.courier_name || '').trim();
    const currentStatus = String(payload.current_status || '').trim();
    const currentStatusId = Number(payload.current_status_id || 0);
    const shipmentStatus = String(payload.shipment_status || '').trim();
    const shipmentStatusId = Number(payload.shipment_status_id || 0);
    const srOrderId = payload.sr_order_id ? Number(payload.sr_order_id) : null;
    const externalOrderId = String(payload.order_id || '').trim();
    const isReturn = Number(payload.is_return || 0);
    const scans = Array.isArray(payload.scans) ? payload.scans : [];

    // Find local shipment record
    let shipment: { id: string; seller_id: string; order_id: string | null } | null = null;

    if (awb) {
      const rows = await queryRows<{ id: string; seller_id: string; order_id: string | null }>(
        'shiprocket_shipments',
        `select=id,seller_id,order_id&awb_number=eq.${encodeURIComponent(awb)}&limit=1`,
      );
      shipment = rows[0] || null;
    }

    if (!shipment && srOrderId) {
      const rows = await queryRows<{ id: string; seller_id: string; order_id: string | null }>(
        'shiprocket_shipments',
        `select=id,seller_id,order_id&sr_order_id=eq.${srOrderId}&limit=1`,
      );
      shipment = rows[0] || null;
    }

    const sellerId = shipment?.seller_id || null;

    // Dedup: skip if we already processed a webhook event with same AWB + status_id + scan count
    // This allows valid repeat events (e.g. multiple IN_TRANSIT at different locations)
    // while rejecting exact retransmissions (same payload re-sent by Shiprocket)
    const resolvedStatusId = currentStatusId || shipmentStatusId;
    const scanCount = scans.length;
    const firstScanDate = scans.length > 0 ? String((scans[0] as Record<string, unknown>).date || '') : '';
    if (awb && resolvedStatusId) {
      const existing = await queryRows(
        'shiprocket_webhook_events',
        `select=id,payload&awb_number=eq.${encodeURIComponent(awb)}&current_status_id=eq.${resolvedStatusId}&order=created_at.desc&limit=1`,
      );
      if (existing.length > 0) {
        // Compare scan count and first scan date to detect exact retransmissions
        const prevPayload = (existing[0] as any).payload || {};
        const prevScans = Array.isArray(prevPayload.scans) ? prevPayload.scans : [];
        const prevFirstDate = prevScans.length > 0 ? String(prevScans[0]?.date || '') : '';
        if (prevScans.length === scanCount && prevFirstDate === firstScanDate) {
          console.log(`[intl-webhook] Duplicate webhook skipped: AWB=${awb}, status_id=${resolvedStatusId}, scans=${scanCount}`);
          return json({ status: 'ok' }, 200);
        }
      }
    }

    // Store webhook event
    await insertRow('shiprocket_webhook_events', {
      shipment_id: shipment?.id || null,
      seller_id: sellerId,
      event_type: isReturn ? 'return' : 'tracking',
      awb_number: awb || null,
      sr_order_id: srOrderId,
      current_status: currentStatus || shipmentStatus,
      current_status_id: resolvedStatusId,
      payload,
      processed: true,
    });

    // Update shipment status (with regression guard)
    if (shipment?.id) {
      const resolvedStatus = mapShiprocketStatusToShipmentStatus(
        currentStatusId || shipmentStatusId,
        currentStatus || shipmentStatus,
      );

      // Query current shipment status to prevent backward regression
      const currentShipmentRows = await queryRows<{ status: string }>(
        'shiprocket_shipments',
        `select=status&id=eq.${encodeURIComponent(shipment.id)}&limit=1`,
      );
      const currentShipmentStatus = currentShipmentRows[0]?.status ?? null;

      if (shouldUpdateShipmentStatus(currentShipmentStatus, resolvedStatus)) {
        await patchRows(
          'shiprocket_shipments',
          `id=eq.${encodeURIComponent(shipment.id)}`,
          {
            status: resolvedStatus,
            courier_name: courierName || undefined,
            raw_payload: { latest_webhook: payload },
            // Store NDR details when delivery fails
            ...(resolvedStatus === 'failed' ? {
              ndr_reason: String(payload.ndr_reason || payload.remarks || currentStatus || '').trim() || null,
              ndr_action_required: true,
            } : {}),
          },
        );
      }

      // Sync order status
      if (shipment.order_id) {
        const orderStatus = mapShiprocketStatusToOrderStatus(
          currentStatusId || shipmentStatusId,
          currentStatus || shipmentStatus,
        );

        if (orderStatus) {
          // Guard: prevent status regression from out-of-order webhook events
          const currentOrder = await queryRows<{ status: string }>(
            'orders',
            `select=status&id=eq.${encodeURIComponent(shipment.order_id)}&limit=1`,
          );
          const currentOrderStatus = currentOrder[0]?.status ?? null;

          if (shouldUpdateOrderStatus(currentOrderStatus, orderStatus)) {
            const patch: Record<string, unknown> = {
              status: orderStatus,
              updated_at: new Date().toISOString(),
            };
            // Mirror the live shipment's AWB / courier onto the order so buyer + seller
            // pages always show the active shipment (handles re-ships where the original
            // AWB was cancelled and a new AWB was generated for the same order).
            if (awb) {
              patch.tracking_number = awb;
              patch.shipping_provider = 'shiprocket';
            }
            if (courierName) {
              patch.shipping_carrier = courierName;
            }
            if (orderStatus === 'delivered') {
              patch.completed_at = new Date().toISOString();
            }

            await patchRows('orders', `id=eq.${encodeURIComponent(shipment.order_id)}`, patch);

            // Notify buyer + seller on key status changes
            const notifMap: Record<string, { title: string; message: string; type: string }> = {
              delivered: {
                title: 'Order Delivered!',
                message: `Your order has been delivered successfully. AWB: ${awb}`,
                type: 'order_delivered',
              },
              out_for_delivery: {
                title: 'Out for Delivery',
                message: `Your order is out for delivery. AWB: ${awb}`,
                type: 'order_update',
              },
              in_transit: {
                title: 'Order Shipped',
                message: `Your order has been shipped and is in transit. AWB: ${awb}`,
                type: 'order_update',
              },
              failed_delivery: {
                title: 'Delivery Attempted',
                message: `Delivery of your order was attempted but unsuccessful. Our team is working on rescheduling. AWB: ${awb}`,
                type: 'order_update',
              },
            };
            const notif = notifMap[orderStatus];
            if (notif) {
              const orderRows = await queryRows<{ user_id: string; seller_id: string | null }>(
                'orders',
                `select=user_id,seller_id&id=eq.${encodeURIComponent(shipment.order_id)}&limit=1`,
              );
              const buyerId = orderRows[0]?.user_id;
              const sellerIdForNotif = orderRows[0]?.seller_id || sellerId;
              const recipients = new Set<string>();
              if (buyerId) recipients.add(buyerId);
              // Seller deserves a delivered ping too so they can release settlement etc.
              if (orderStatus === 'delivered' && sellerIdForNotif) recipients.add(sellerIdForNotif);
              for (const recipient of recipients) {
                await insertRow('notifications', {
                  user_id: recipient,
                  type: notif.type,
                  title: notif.title,
                  message: notif.message,
                  metadata: { order_id: shipment.order_id, awb_number: awb, status: orderStatus },
                  is_read: false,
                });
              }
            }
          } // end shouldUpdateOrderStatus guard
        }
      }

      // Store individual scan events as tracking events (batch optimized)
      if (sellerId && scans.length > 0) {
        // Batch fetch: get ALL existing tracking events for this shipment in one query
        const existingEvents = await queryRows<{ event_at: string; sr_status: string; location: string }>(
          'shiprocket_tracking_events',
          `select=event_at,sr_status,location&shipment_id=eq.${encodeURIComponent(shipment.id)}`,
        );
        const existingKeys = new Set(
          existingEvents.map(e => eventDedupKey(shipment!.id, e.event_at, e.sr_status || '', e.location || '')),
        );

        // Build batch of new events only
        const newEvents: Record<string, unknown>[] = [];
        for (const scan of scans) {
          const scanRecord = scan as Record<string, unknown>;
          const eventAt = scanRecord.date ? new Date(String(scanRecord.date)).toISOString() : null;
          const srStatus = String(scanRecord['sr-status'] || '');
          const location = String(scanRecord.location || '');
          const key = eventDedupKey(shipment.id, eventAt, srStatus, location);
          if (existingKeys.has(key)) continue;
          existingKeys.add(key); // prevent intra-batch duplicates
          newEvents.push({
            shipment_id: shipment.id,
            seller_id: sellerId,
            sr_status: srStatus,
            sr_status_id: Number(scanRecord['sr-status-id'] || scanRecord.status_id || 0) || null,
            sr_status_label: String(scanRecord['sr-status-label'] || ''),
            activity: String(scanRecord.activity || ''),
            location,
            event_at: eventAt,
            raw_payload: scanRecord,
          });
        }

        // Single bulk insert for all new events
        if (newEvents.length > 0) {
          await insertRows('shiprocket_tracking_events', newEvents);
        }
      }
    }

    // Always return 200 per Shiprocket requirements
    return json({ status: 'ok' }, 200);
  } catch (error) {
    console.error('[intl-webhook] Error:', error);
    // Still return 200 — Shiprocket requires it
    return json({ status: 'ok' }, 200);
  }
});
