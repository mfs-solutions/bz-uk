-- ============================================================================
-- Add a per-row unit price snapshot to cart_items.
--
-- WHY: The buyer cart shows a per-variant price (the markup-resolved price the
-- buyer saw on the product page, e.g. a specific size/colour combination). That
-- price lived only in React state. On a page refresh the cart is re-hydrated
-- from cart_items, which had no price column, so the variant price was lost and
-- the UI fell back to the base product price (visible bug: price changed from
-- the variant price to the base price after reload).
--
-- This column stores the markup-resolved unit price captured at add-to-cart
-- time so the displayed price is stable across refreshes.
--
-- SAFETY:
--   * Additive, nullable column — no backfill, no constraint, no default.
--   * Existing rows keep NULL; the app treats NULL as "no snapshot" and falls
--     back to the live public price (unchanged behaviour for old rows).
--   * NOT used for charging. Order creation (create_order_secure) ignores cart
--     prices entirely and recomputes every financial field server-side, so a
--     stale snapshot can never affect what a buyer is actually charged.
--   * No RLS change: cart_items policies already scope rows to the owner.
-- ============================================================================

ALTER TABLE public.cart_items
  ADD COLUMN IF NOT EXISTS unit_price numeric;

COMMENT ON COLUMN public.cart_items.unit_price IS
  'Display-only snapshot of the markup-resolved per-variant unit price captured at add-to-cart time. Stabilises the cart price across refreshes. NOT used for charging; create_order_secure recomputes all financials server-side.';
