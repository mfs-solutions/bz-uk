begin;

alter table if exists public.tax_rules
  add column if not exists tax_type text,
  add column if not exists country_code text,
  add column if not exists category_id uuid references public.categories(id) on delete cascade,
  add column if not exists product_id uuid references public.products(id) on delete cascade,
  add column if not exists priority integer not null default 100;

update public.tax_rules
set tax_type = coalesce(nullif(tax_type, ''), upper(name));

alter table if exists public.tax_rules
  alter column tax_type set default 'GST';

create index if not exists idx_tax_rules_active_country
  on public.tax_rules (is_active, country, country_code, priority);

create index if not exists idx_tax_rules_active_category
  on public.tax_rules (is_active, category_id, priority)
  where category_id is not null;

create index if not exists idx_tax_rules_active_product
  on public.tax_rules (is_active, product_id, priority)
  where product_id is not null;

-- Country-wide baseline seed rules (percentage stored as whole percent)
insert into public.tax_rules (name, tax_type, percentage, country, country_code, is_active, priority)
select 'GST', 'GST', 18, 'India', 'IND', true, 100
where not exists (
  select 1
  from public.tax_rules tr
  where lower(tr.country) = 'india'
    and upper(coalesce(tr.tax_type, tr.name)) = 'GST'
    and tr.category_id is null
    and tr.product_id is null
    and tr.is_active = true
);

insert into public.tax_rules (name, tax_type, percentage, country, country_code, is_active, priority)
select 'VAT', 'VAT', 20, 'United Kingdom', 'GBR', true, 100
where not exists (
  select 1
  from public.tax_rules tr
  where lower(tr.country) in ('united kingdom', 'uk')
    and upper(coalesce(tr.tax_type, tr.name)) = 'VAT'
    and tr.category_id is null
    and tr.product_id is null
    and tr.is_active = true
);

commit;
