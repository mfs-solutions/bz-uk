-- ============================================================
-- Fix: Sellers see "No Orders Found" while admin shows orders
--      attributed to them.
--
-- Root cause:
--   * RLS on order_items only grants SELECT to a seller when
--     order_items.seller_id = auth.uid().
--   * RLS on orders uses helper seller_has_order_items(order_id, seller_id)
--     which checks the SAME column.
--   * Legacy / partially-failed inserts left order_items.seller_id NULL
--     (or stamped only after migration 20260422160000). For those rows,
--     even though order_items.product_id maps to a product owned by the
--     seller, the seller cannot read the row -> orders also invisible.
--
-- Fix:
--   1. Backfill order_items.seller_id from products.seller_id where NULL.
--   2. Re-run single-seller orders.seller_id backfill (now that step 1
--      filled in the gaps).
--   3. Add defense-in-depth RLS policy on order_items allowing a seller
--      to SELECT rows whose product they own, regardless of seller_id.
--   4. Update seller_has_order_items() helper so the orders RLS policy
--      also resolves via product ownership.
-- ============================================================

-- ---------- 1. Backfill order_items.seller_id from products ----------
UPDATE public.order_items oi
SET    seller_id = p.seller_id
FROM   public.products p
WHERE  oi.product_id = p.id
  AND  oi.seller_id  IS NULL
  AND  p.seller_id   IS NOT NULL;

-- ---------- 2. Backfill orders.seller_id for single-seller orders ----------
UPDATE public.orders o
SET    seller_id = sub.single_seller_id
FROM (
  SELECT oi.order_id,
         (array_agg(DISTINCT oi.seller_id))[1] AS single_seller_id
  FROM   public.order_items oi
  WHERE  oi.seller_id IS NOT NULL
  GROUP  BY oi.order_id
  HAVING COUNT(DISTINCT oi.seller_id) = 1
) sub
WHERE o.id = sub.order_id
  AND o.seller_id IS NULL;

-- ---------- 3. Defense-in-depth RLS on order_items via product ownership ----------
DROP POLICY IF EXISTS "Sellers read order_items via product ownership"
  ON public.order_items;

CREATE POLICY "Sellers read order_items via product ownership"
  ON public.order_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM   public.products p
      WHERE  p.id = order_items.product_id
        AND  p.seller_id = auth.uid()
    )
  );

-- ---------- 4. Update seller_has_order_items() to honour product ownership ----------
CREATE OR REPLACE FUNCTION public.seller_has_order_items(
  p_order_id  uuid,
  p_seller_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.order_items oi
    LEFT   JOIN public.products p ON p.id = oi.product_id
    WHERE  oi.order_id = p_order_id
      AND  (oi.seller_id = p_seller_id OR p.seller_id = p_seller_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.seller_has_order_items(uuid, uuid)
  TO authenticated;
