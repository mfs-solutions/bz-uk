import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Database = ReturnType<typeof createClient>;

async function deliverUkOrderEmail(
  db: Database,
  url: string,
  serviceKey: string,
  orderId: string,
) {
  const { data: order, error: orderError } = await db.from("orders")
    .select("id,user_id,total_amount,currency,payment_method,shipping_address,shipping_carrier,shipping_service_level,expected_delivery_date,created_at")
    .eq("id", orderId).single();
  if (orderError || !order) throw orderError || new Error("Order not found");
  const { data: items, error: itemsError } = await db.from("order_items")
    .select("product_name,quantity,price,seller_id,customer_unit_price,customer_line_total,seller_unit_price,seller_line_total,seller_currency")
    .eq("order_id", orderId);
  if (itemsError || !items?.length) throw itemsError || new Error("Order has no items");
  const sellerIds = [...new Set(items.map((item) => item.seller_id).filter((id): id is string => Boolean(id)))];
  const { data: profiles, error: profilesError } = await db.from("profiles")
    .select("id,email,full_name,role").or(`id.in.(${[order.user_id, ...sellerIds].join(",")}),role.eq.admin`);
  if (profilesError) throw profilesError;
  const buyer = profiles?.find((profile) => profile.id === order.user_id);
  if (!buyer?.email) throw new Error("Order buyer email not found");
  const address = order.shipping_address && typeof order.shipping_address === "object"
    ? order.shipping_address as Record<string, unknown> : {};
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = address[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  };
  const buyerName = pick("full_name", "name", "fullName") || buyer?.full_name || "Customer";
  const buyerAddress = [
    buyerName,
    pick("address_line1", "addressLine1", "line1", "street", "address"),
    pick("address_line2", "addressLine2", "line2"),
    [pick("city", "town"), pick("state", "region"), pick("postal_code", "postalCode", "zip")]
      .filter(Boolean).join(", "),
    pick("country", "countryName"),
    pick("phone", "mobile") ? `Phone: ${pick("phone", "mobile")}` : "",
  ].filter(Boolean).join("\n");
  const currency = String(order.currency).toUpperCase();
  const common = {
    order_id: order.id.slice(0, 8).toUpperCase(),
    order_date: new Date(order.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
    customer_name: buyerName,
  };
  const buyerData = {
    ...common,
    currency,
    order_total: Number(order.total_amount).toFixed(2),
    payment_method: "Card",
    carrier: order.shipping_carrier || undefined,
    service_level: order.shipping_service_level || undefined,
    delivery_date: order.expected_delivery_date
      ? new Date(order.expected_delivery_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : undefined,
    items: items.map((item) => ({
      name: item.product_name || "Item",
      quantity: item.quantity,
      price: `${currency} ${Number(item.customer_line_total ?? ((item.customer_unit_price ?? item.price ?? 0) * item.quantity)).toFixed(2)}`,
    })),
  };
  const send = async (data: Record<string, unknown>, recipients: Array<Record<string, string>>) => {
    if (!recipients.length) return;
    const response = await fetch(`${url}/functions/v1/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ eventType: "order_placed", data, recipients }),
    });
    if (!response.ok) throw new Error(`Order email service returned ${response.status}`);
    const result = await response.json() as { success?: boolean; sent?: number; skipped?: number; failed?: number };
    if (result.success !== true || (result.sent || 0) + (result.skipped || 0) < recipients.length) {
      throw new Error(`Order email delivery incomplete: sent=${result.sent}, skipped=${result.skipped}, failed=${result.failed}`);
    }
  };
  if (buyer?.email) {
    await send(buyerData, [{
      email: buyer.email, recipientType: "buyer", recipientName: buyer.full_name || "Customer", recipientUserId: buyer.id,
    }]);
  }
  for (const sellerId of sellerIds) {
    const seller = profiles?.find((profile) => profile.id === sellerId);
    if (!seller?.email) throw new Error("Order seller email not found");
    const sellerItems = items.filter((item) => item.seller_id === sellerId);
    await send({
      ...common,
      buyer_address: buyerAddress,
      items: sellerItems.map((item) => ({
        name: item.product_name || "Item",
        quantity: item.quantity,
        price: `${String(item.seller_currency || "INR").toUpperCase()} ${Number(item.seller_line_total ?? ((item.seller_unit_price ?? 0) * item.quantity)).toFixed(2)}`,
      })),
    }, [{
      email: seller.email, recipientType: "seller", recipientName: seller.full_name || "Seller", recipientUserId: seller.id,
    }]);
  }
  const admins = (profiles || []).filter((profile) => profile.role === "admin" && profile.email)
    .map((profile) => ({
      email: profile.email, recipientType: "admin", recipientName: profile.full_name || "Admin", recipientUserId: profile.id,
    }));
  await send(buyerData, admins);
}

export async function sendUkOrderEmail(
  db: Database,
  url: string,
  serviceKey: string,
  orderId: string,
  snapshotId: string,
) {
  const { data: claimed, error: claimError } = await db.rpc("claim_uk_hosted_order_email", {
    p_snapshot_id: snapshotId,
  });
  if (claimError) throw claimError;
  if (claimed !== true) {
    const { data: snapshot, error } = await db.from("uk_hosted_checkout_sessions")
      .select("email_notifications_sent_at").eq("id", snapshotId).single();
    if (error) throw error;
    if (snapshot.email_notifications_sent_at) return;
    throw new Error("UK order email delivery is already in progress");
  }

  try {
    await deliverUkOrderEmail(db, url, serviceKey, orderId);
    const { error } = await db.rpc("complete_uk_hosted_order_email", {
      p_snapshot_id: snapshotId,
      p_sent: true,
    });
    if (error) throw error;
  } catch (error) {
    const { error: releaseError } = await db.rpc("complete_uk_hosted_order_email", {
      p_snapshot_id: snapshotId,
      p_sent: false,
    });
    if (releaseError) {
      throw new AggregateError([error, releaseError], "Order email failed and its retry claim could not be released");
    }
    throw error;
  }
}

export async function sendUkOrderPush(
  db: Database,
  url: string,
  serviceKey: string,
  orderId: string,
  snapshotId: string,
) {
  const { data: claimed, error: claimError } = await db.rpc("claim_uk_hosted_order_push", {
    p_snapshot_id: snapshotId,
  });
  if (claimError) throw claimError;
  if (claimed !== true) {
    const { data: snapshot, error } = await db.from("uk_hosted_checkout_sessions")
      .select("push_notifications_sent_at").eq("id", snapshotId).single();
    if (error) throw error;
    if (snapshot.push_notifications_sent_at) return;
    throw new Error("UK order push delivery is already in progress");
  }

  try {
    const [{ data: order, error: orderError }, { data: items, error: itemsError },
      { data: admins, error: adminError }] = await Promise.all([
      db.from("orders").select("id,user_id,order_number").eq("id", orderId).single(),
      db.from("order_items").select("seller_id").eq("order_id", orderId),
      db.from("profiles").select("id").eq("role", "admin"),
    ]);
    if (orderError || !order) throw orderError || new Error("Order not found for push notification");
    if (itemsError) throw itemsError;
    if (adminError) throw adminError;

    const recipientUserIds = [...new Set([
      order.user_id,
      ...(items || []).map((item) => item.seller_id).filter((id): id is string => Boolean(id)),
      ...(admins || []).map((admin) => admin.id),
    ])];
    if (recipientUserIds.length > 50) {
      throw new Error("UK order has too many push notification recipients");
    }

    const response = await fetch(`${url}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        orderId,
        recipientUserIds,
        title: "Order placed successfully",
        message: "Your UK order has been placed and is being processed.",
        type: "order_placed",
        metadata: { order_id: orderId, order_number: order.order_number, snapshot_id: snapshotId },
      }),
    });
    if (!response.ok) {
      throw new Error(`Push notification service returned ${response.status}`);
    }
    const result = await response.json() as { success?: boolean };
    if (result.success !== true) throw new Error("UK order push notification was not delivered");

    const { error: completeError } = await db.rpc("complete_uk_hosted_order_push", {
      p_snapshot_id: snapshotId,
      p_sent: true,
    });
    if (completeError) throw completeError;
  } catch (error) {
    const { error: releaseError } = await db.rpc("complete_uk_hosted_order_push", {
      p_snapshot_id: snapshotId,
      p_sent: false,
    });
    if (releaseError) {
      throw new AggregateError([error, releaseError], "Push notification failed and its retry claim could not be released");
    }
    throw error;
  }
}
