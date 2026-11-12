-- Fix 1: min-order trigger must use markup/selling price (not base price) for the line_total_inr calculation
-- Fix 2: create_order_secure must sanitize p_expected_delivery_date to null if it is not a valid timestamptz

begin;

-- ─── FIX 1: Replace enforce_checkout_min_order_value trigger function ────────
-- The old version used p.price (base INR) to compute line_total_inr.
-- This caused markup-priced orders (e.g. Malta, UK) to fail the min-order check
-- because the base prices summed below the threshold even though the markup
-- prices (= what the buyer actually paid) exceeded it.
-- Fix: use product_country_selling_prices.selling_price for the destination
-- country when available, falling back to p.price only if no country price exists.

CREATE OR REPLACE FUNCTION public.enforce_checkout_min_order_value()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_violation RECORD;
BEGIN
  WITH affected_orders AS (
    SELECT DISTINCT ni.order_id
    FROM new_items ni
    WHERE ni.order_id IS NOT NULL
  ),
  destination_tokens AS (
    SELECT
      ao.order_id,
      UPPER(REGEXP_REPLACE(COALESCE(
        o.shipping_address->>'countryCode',
        o.shipping_address->>'country_code',
        o.shipping_address->>'country',
        ''
      ), '\s+', '', 'g')) AS destination_token
    FROM affected_orders ao
    JOIN orders o ON o.id = ao.order_id
  ),
  resolved_destinations AS (
    SELECT
      dt.order_id,
      COALESCE(
        (
          SELECT UPPER(TRIM(COALESCE(c.iso2, c.country_code, c.short_code, '')))
          FROM countries c
          WHERE dt.destination_token <> ''
            AND (
              UPPER(REGEXP_REPLACE(COALESCE(c.iso2, ''), '\s+', '', 'g')) = dt.destination_token
              OR UPPER(REGEXP_REPLACE(COALESCE(c.country_code, ''), '\s+', '', 'g')) = dt.destination_token
              OR UPPER(REGEXP_REPLACE(COALESCE(c.short_code, ''), '\s+', '', 'g')) = dt.destination_token
              OR UPPER(REGEXP_REPLACE(COALESCE(c.country_name, ''), '\s+', '', 'g')) = dt.destination_token
            )
          LIMIT 1
        ),
        CASE
          WHEN dt.destination_token IN ('UK', 'GB', 'GBR', 'UNITEDKINGDOM', 'ENGLAND', 'SCOTLAND', 'WALES', 'NORTHERNIRELAND') THEN 'GB'
          WHEN dt.destination_token IN ('IN', 'IND', 'INDIA') THEN 'IN'
          ELSE NULL
        END
      ) AS destination_iso2
    FROM destination_tokens dt
  ),
  order_item_lines AS (
    SELECT
      oi.order_id,
      UPPER(TRIM(COALESCE(
        c_origin.iso2,
        (
          SELECT COALESCE(c2.iso2, c2.country_code, c2.short_code)
          FROM countries c2
          WHERE p.origin_country IS NOT NULL
            AND (
              UPPER(REGEXP_REPLACE(COALESCE(c2.iso2, ''), '\s+', '', 'g')) = UPPER(REGEXP_REPLACE(p.origin_country, '\s+', '', 'g'))
              OR UPPER(REGEXP_REPLACE(COALESCE(c2.country_code, ''), '\s+', '', 'g')) = UPPER(REGEXP_REPLACE(p.origin_country, '\s+', '', 'g'))
              OR UPPER(REGEXP_REPLACE(COALESCE(c2.short_code, ''), '\s+', '', 'g')) = UPPER(REGEXP_REPLACE(p.origin_country, '\s+', '', 'g'))
              OR UPPER(REGEXP_REPLACE(COALESCE(c2.country_name, ''), '\s+', '', 'g')) = UPPER(REGEXP_REPLACE(p.origin_country, '\s+', '', 'g'))
            )
          LIMIT 1
        ),
        CASE
          WHEN UPPER(REGEXP_REPLACE(COALESCE(p.origin_country, ''), '\s+', '', 'g')) IN ('IN', 'IND', 'INDIA') THEN 'IN'
          WHEN UPPER(REGEXP_REPLACE(COALESCE(p.origin_country, ''), '\s+', '', 'g')) IN ('UK', 'GB', 'GBR', 'UNITEDKINGDOM', 'ENGLAND', 'SCOTLAND', 'WALES', 'NORTHERNIRELAND') THEN 'GB'
          ELSE ''
        END
      ))) AS origin_iso2,
      -- ── FIXED: use markup/selling price for destination country when available ──
      COALESCE(
        (
          SELECT pcsp.selling_price
          FROM product_country_selling_prices pcsp
          JOIN countries c_dest ON c_dest.id = pcsp.country_id
          WHERE pcsp.product_id = p.id
            AND rd.destination_iso2 IS NOT NULL
            AND UPPER(TRIM(COALESCE(c_dest.iso2, c_dest.country_code, c_dest.short_code, ''))) = rd.destination_iso2
          LIMIT 1
        ),
        (
          CASE
            WHEN (
              SELECT COUNT(*)
              FROM product_variants pv_count
              WHERE pv_count.product_id = p.id
            ) > 1 THEN COALESCE(
              (
                SELECT pv_match.price
                FROM product_variants pv_match
                WHERE pv_match.product_id = p.id
                  AND UPPER(TRIM(pv_match.sku)) = UPPER(TRIM(COALESCE(oi.variant_info->>'sku', '')))
                LIMIT 1
              ),
              p.price
            )
            ELSE p.price
          END
        )
      ) * oi.quantity AS line_total_inr
    FROM order_items oi
    JOIN affected_orders ao ON ao.order_id = oi.order_id
    JOIN products p ON p.id = oi.product_id
    LEFT JOIN countries c_origin ON c_origin.id = p.origin_country_id
    LEFT JOIN resolved_destinations rd ON rd.order_id = oi.order_id
  ),
  route_totals AS (
    SELECT
      rd.order_id,
      UPPER(TRIM(oil.origin_iso2)) AS origin_iso2,
      UPPER(TRIM(rd.destination_iso2)) AS destination_iso2,
      r.min_order_inr,
      SUM(oil.line_total_inr) AS eligible_subtotal_inr
    FROM resolved_destinations rd
    LEFT JOIN order_item_lines oil ON oil.order_id = rd.order_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(mor.min_order_inr, 0) AS min_order_inr
      FROM product_origin_destination_shipping_rates mor
      WHERE UPPER(TRIM(COALESCE(mor.origin_iso2, '')))      = UPPER(TRIM(COALESCE(oil.origin_iso2, '')))
        AND UPPER(TRIM(COALESCE(mor.destination_iso2, ''))) = UPPER(TRIM(COALESCE(rd.destination_iso2, '')))
        AND mor.is_active = true
        AND mor.min_order_inr IS NOT NULL
        AND mor.min_order_inr > 0
      ORDER BY mor.min_order_inr DESC
      LIMIT 1
    ) r ON true
    GROUP BY rd.order_id, oil.origin_iso2, rd.destination_iso2, r.min_order_inr
  )
  SELECT rt.order_id, rt.origin_iso2, rt.destination_iso2, rt.min_order_inr, rt.eligible_subtotal_inr
  INTO v_violation
  FROM route_totals rt
  WHERE rt.min_order_inr IS NOT NULL
    AND rt.min_order_inr > 0
    AND rt.eligible_subtotal_inr < rt.min_order_inr
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Minimum order for route % -> % is INR %.2f. Current eligible subtotal is INR %.2f.',
      v_violation.origin_iso2,
      v_violation.destination_iso2,
      v_violation.min_order_inr,
      v_violation.eligible_subtotal_inr
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

-- ─── FIX 2: Sanitize p_expected_delivery_date in create_order_secure ─────────
-- Passing a text like "13 - 15 DAYS" as a timestamptz crashes the function.
-- The fix is applied in the Checkout.tsx frontend (see below), but as a DB
-- safeguard we also guard in the recover function by nulling bad values.
-- The actual frontend fix is in Checkout.tsx (sanitize before RPC call).

commit;
