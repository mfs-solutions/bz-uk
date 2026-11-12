-- Hotfix: the dedup logic in 20260526250000_cart_items_unique_includes_sku.sql
-- summed quantities across rows that were not real duplicates (the prior
-- unique key excluded selected_variant_sku and treated NULLs as distinct),
-- inflating cart quantities to nonsensical values (44 / 69 / 83 etc.) for
-- all rows touched by that migration.
--
-- Recovery: delete every cart_items row that bears the exact bulk-update
-- timestamp produced by that migration so affected users start fresh.

DELETE FROM public.cart_items
 WHERE updated_at = '2026-05-26 19:51:08.011806+00';
