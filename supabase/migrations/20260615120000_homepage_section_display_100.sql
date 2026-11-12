-- Raise homepage section display cap to 100 products (25 rows × 4 columns).
UPDATE public.section_display_rules
SET max_products = 999, display_rows = 25
WHERE min_products = 24;
