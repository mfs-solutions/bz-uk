alter table public.cart_items
  add column if not exists selected_variant_sku text;

create index if not exists idx_cart_items_selected_variant_sku
  on public.cart_items(selected_variant_sku);