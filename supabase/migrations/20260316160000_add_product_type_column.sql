-- Add product_type column to products table (Level 3 category reference)
alter table public.products
  add column if not exists product_type uuid references public.categories(id) on delete set null;

comment on column public.products.product_type
  is 'FK to categories.id where level = 3 (product type / subcategory level 3)';
