-- Backend-configured minimum-order rules by origin -> destination route.
-- This replaces hardcoded route thresholds inside triggers/application logic.

CREATE TABLE IF NOT EXISTS public.checkout_min_order_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_iso2 text NOT NULL,
  destination_iso2 text NOT NULL,
  min_order_inr numeric(12,2) NOT NULL CHECK (min_order_inr > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checkout_min_order_rules_route_unique UNIQUE (origin_iso2, destination_iso2)
);

INSERT INTO public.checkout_min_order_rules (origin_iso2, destination_iso2, min_order_inr, is_active)
VALUES ('IN', 'GB', 100, true)
ON CONFLICT (origin_iso2, destination_iso2)
DO UPDATE
SET
  min_order_inr = EXCLUDED.min_order_inr,
  is_active = EXCLUDED.is_active,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.get_active_checkout_min_order_rules()
RETURNS TABLE (
  origin_iso2 text,
  destination_iso2 text,
  min_order_inr numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    UPPER(TRIM(r.origin_iso2)) AS origin_iso2,
    UPPER(TRIM(r.destination_iso2)) AS destination_iso2,
    r.min_order_inr
  FROM public.checkout_min_order_rules r
  WHERE r.is_active = true
  ORDER BY r.origin_iso2, r.destination_iso2;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_checkout_min_order_rules() TO anon;
GRANT EXECUTE ON FUNCTION public.get_active_checkout_min_order_rules() TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_checkout_min_order_value()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      ), '\\s+', '', 'g')) AS destination_token
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
              UPPER(REGEXP_REPLACE(COALESCE(c.iso2, ''), '\\s+', '', 'g')) = dt.destination_token
              OR UPPER(REGEXP_REPLACE(COALESCE(c.country_code, ''), '\\s+', '', 'g')) = dt.destination_token
              OR UPPER(REGEXP_REPLACE(COALESCE(c.short_code, ''), '\\s+', '', 'g')) = dt.destination_token
              OR UPPER(REGEXP_REPLACE(COALESCE(c.country_name, ''), '\\s+', '', 'g')) = dt.destination_token
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
              UPPER(REGEXP_REPLACE(COALESCE(c2.iso2, ''), '\\s+', '', 'g')) = UPPER(REGEXP_REPLACE(p.origin_country, '\\s+', '', 'g'))
              OR UPPER(REGEXP_REPLACE(COALESCE(c2.country_code, ''), '\\s+', '', 'g')) = UPPER(REGEXP_REPLACE(p.origin_country, '\\s+', '', 'g'))
              OR UPPER(REGEXP_REPLACE(COALESCE(c2.short_code, ''), '\\s+', '', 'g')) = UPPER(REGEXP_REPLACE(p.origin_country, '\\s+', '', 'g'))
              OR UPPER(REGEXP_REPLACE(COALESCE(c2.country_name, ''), '\\s+', '', 'g')) = UPPER(REGEXP_REPLACE(p.origin_country, '\\s+', '', 'g'))
            )
          LIMIT 1
        ),
        CASE
          WHEN UPPER(REGEXP_REPLACE(COALESCE(p.origin_country, ''), '\\s+', '', 'g')) IN ('IN', 'IND', 'INDIA') THEN 'IN'
          WHEN UPPER(REGEXP_REPLACE(COALESCE(p.origin_country, ''), '\\s+', '', 'g')) IN ('UK', 'GB', 'GBR', 'UNITEDKINGDOM', 'ENGLAND', 'SCOTLAND', 'WALES', 'NORTHERNIRELAND') THEN 'GB'
          ELSE ''
        END
      ))) AS origin_iso2,
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
      ) * oi.quantity AS line_total_inr
    FROM order_items oi
    JOIN affected_orders ao ON ao.order_id = oi.order_id
    JOIN products p ON p.id = oi.product_id
    LEFT JOIN countries c_origin ON c_origin.id = p.origin_country_id
  ),
  route_totals AS (
    SELECT
      rd.order_id,
      UPPER(TRIM(r.origin_iso2)) AS origin_iso2,
      UPPER(TRIM(r.destination_iso2)) AS destination_iso2,
      r.min_order_inr,
      COALESCE(SUM(
        CASE
          WHEN oil.origin_iso2 = UPPER(TRIM(r.origin_iso2)) THEN oil.line_total_inr
          ELSE 0
        END
      ), 0) AS route_subtotal_inr
    FROM resolved_destinations rd
    JOIN checkout_min_order_rules r
      ON r.is_active = true
      AND UPPER(TRIM(r.destination_iso2)) = rd.destination_iso2
    JOIN order_item_lines oil
      ON oil.order_id = rd.order_id
    GROUP BY
      rd.order_id,
      UPPER(TRIM(r.origin_iso2)),
      UPPER(TRIM(r.destination_iso2)),
      r.min_order_inr
  )
  SELECT
    order_id,
    origin_iso2,
    destination_iso2,
    min_order_inr,
    route_subtotal_inr
  INTO v_violation
  FROM route_totals
  WHERE route_subtotal_inr > 0
    AND route_subtotal_inr < min_order_inr
  ORDER BY min_order_inr DESC
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Minimum order for route % -> % is INR %. Current eligible subtotal is INR %.',
      v_violation.origin_iso2,
      v_violation.destination_iso2,
      ROUND(v_violation.min_order_inr, 2),
      ROUND(v_violation.route_subtotal_inr, 2)
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_india_to_uk_min_order_value ON public.order_items;
DROP TRIGGER IF EXISTS trg_enforce_checkout_min_order_value ON public.order_items;

CREATE TRIGGER trg_enforce_checkout_min_order_value
AFTER INSERT ON public.order_items
REFERENCING NEW TABLE AS new_items
FOR EACH STATEMENT
EXECUTE FUNCTION public.enforce_checkout_min_order_value();
