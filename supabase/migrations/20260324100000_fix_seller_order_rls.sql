-- Fix: Sellers cannot see or update orders
-- Root cause: orders.seller_id is never set during checkout (only order_items.seller_id is populated).
-- Existing seller RLS on orders checks orders.seller_id = auth.uid() which always fails.
-- Solution: Add policies that check order_items.seller_id instead.

-- ============================================================
-- 1. SELECT policy on orders – sellers can read any order that
--    contains at least one order_item with their seller_id.
-- ============================================================
CREATE POLICY "Sellers read orders via order_items"
ON orders FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM order_items
    WHERE order_items.order_id = orders.id
      AND order_items.seller_id = auth.uid()
  )
);

-- ============================================================
-- 2. UPDATE policy on orders – sellers can update status/tracking
--    on orders that contain their items.
-- ============================================================
CREATE POLICY "Sellers update orders via order_items"
ON orders FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM order_items
    WHERE order_items.order_id = orders.id
      AND order_items.seller_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM order_items
    WHERE order_items.order_id = orders.id
      AND order_items.seller_id = auth.uid()
  )
);

-- ============================================================
-- 3. UPDATE policy on order_items – sellers can update their own items.
-- ============================================================
CREATE POLICY "Sellers update their order_items"
ON order_items FOR UPDATE
USING (auth.uid() = seller_id)
WITH CHECK (auth.uid() = seller_id);
