-- Revert 20260620140000_atomic_product_sku_allocation.sql
-- Restore client-side MAX(sku)+1 generation; drop unique index, RPC, and sequence.

BEGIN;

DROP INDEX IF EXISTS public.idx_products_sku_unique;

DROP FUNCTION IF EXISTS public.allocate_next_product_sku();

DROP SEQUENCE IF EXISTS public.product_bzd_sku_seq;

COMMIT;
