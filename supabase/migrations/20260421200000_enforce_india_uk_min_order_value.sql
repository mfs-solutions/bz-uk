-- Enforce minimum order value for India-origin products shipping to United Kingdom.
-- Rule: If destination is UK and order contains India-origin products,
--       subtotal of India-origin products must be at least INR 3200.

CREATE OR REPLACE FUNCTION public.enforce_india_to_uk_min_order_value()
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
  per_order AS (
    SELECT
      ao.order_id,
      UPPER(REGEXP_REPLACE(COALESCE(
        o.shipping_address->>'countryCode',
        o.shipping_address->>'country_code',
        o.shipping_address->>'country',
        ''
      ), '\\s+', '', 'g')) AS destination_token,
      COALESCE(SUM(
        CASE
          WHEN (
            UPPER(REGEXP_REPLACE(COALESCE(
              c.iso2,
              c.country_code,
              c.short_code,
              p.origin_country,
              ''
            ), '\\s+', '', 'g')) IN ('IN', 'IND', 'INDIA')
            OR UPPER(REGEXP_REPLACE(COALESCE(p.origin_country, ''), '\\s+', '', 'g')) IN ('IN', 'IND', 'INDIA')
          ) THEN (
            CASE
              WHEN (SELECT COUNT(*) FROM product_variants pv_count WHERE pv_count.product_id = p.id) > 1
                THEN COALESCE(
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
          ) * oi.quantity
          ELSE 0
        END
      ), 0) AS india_origin_subtotal_inr
    FROM affected_orders ao
    JOIN orders o ON o.id = ao.order_id
    JOIN order_items oi ON oi.order_id = ao.order_id
    JOIN products p ON p.id = oi.product_id
    LEFT JOIN countries c ON c.id = p.origin_country_id
    GROUP BY ao.order_id, destination_token
  )
  SELECT order_id, india_origin_subtotal_inr
  INTO v_violation
  FROM per_order
  WHERE destination_token IN ('UK', 'GB', 'GBR', 'UNITEDKINGDOM', 'ENGLAND', 'SCOTLAND', 'WALES', 'NORTHERNIRELAND')
    AND india_origin_subtotal_inr > 0
    AND india_origin_subtotal_inr < 3200
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Minimum order value for India-origin products shipping to UK is INR 3200. Current eligible subtotal is INR %.',
      ROUND(v_violation.india_origin_subtotal_inr, 2)
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_india_to_uk_min_order_value ON public.order_items;

CREATE TRIGGER trg_enforce_india_to_uk_min_order_value
AFTER INSERT ON public.order_items
REFERENCING NEW TABLE AS new_items
FOR EACH STATEMENT
EXECUTE FUNCTION public.enforce_india_to_uk_min_order_value();
