-- Fix: Circular RLS between orders ↔ order_items causes 500 errors.
--
-- Problem: "Sellers read orders via order_items" (on orders) subqueries order_items,
-- but "Users read own order_items" and "order_items_read" (on order_items) subquery
-- back into orders → infinite loop → 500.
--
-- Solution: Replace the direct subquery with a SECURITY DEFINER function that
-- reads order_items WITHOUT triggering RLS, breaking the cycle.

-- 1. Drop the circular policies from the previous migration
DROP POLICY IF EXISTS "Sellers read orders via order_items" ON orders;
DROP POLICY IF EXISTS "Sellers update orders via order_items" ON orders;

-- 2. Create a SECURITY DEFINER helper that bypasses RLS on order_items
CREATE OR REPLACE FUNCTION public.seller_has_order_items(p_order_id uuid, p_seller_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM order_items
    WHERE order_items.order_id = p_order_id
      AND order_items.seller_id = p_seller_id
  );
$$;

-- 3. Re-create the SELECT policy using the helper (no circular subquery)
CREATE POLICY "Sellers read orders via order_items"
ON orders FOR SELECT
USING ( seller_has_order_items(id, auth.uid()) );

-- 4. Re-create the UPDATE policy using the helper
CREATE POLICY "Sellers update orders via order_items"
ON orders FOR UPDATE
USING ( seller_has_order_items(id, auth.uid()) )
WITH CHECK ( seller_has_order_items(id, auth.uid()) );
