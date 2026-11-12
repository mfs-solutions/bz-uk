begin;

create table if not exists public.domestic_courier_type (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.domestic_shippingcharge_type (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.international_courier_type (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_domestic_shipping (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  courier_type_id uuid references public.domestic_courier_type(id) on delete set null,
  shipping_charge_type_id uuid references public.domestic_shippingcharge_type(id) on delete set null,
  flat_shipping_charge numeric(12,2) not null default 0,
  expected_delivery_days integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_product_domestic_shipping_product_id
  on public.product_domestic_shipping(product_id);

create table if not exists public.product_domestic_state_charges (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  state_id uuid references public.states(id) on delete set null,
  state_name text not null default '',
  shipping_charge numeric(12,2) not null default 0,
  expected_delivery_days integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_product_domestic_state_charges_product_id
  on public.product_domestic_state_charges(product_id);

create table if not exists public.product_international_shipping (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  country_id uuid references public.countries(id) on delete set null,
  country_name text not null default '',
  courier_type_id uuid references public.international_courier_type(id) on delete set null,
  min_quantity integer not null default 1,
  shipping_charge numeric(12,2) not null default 0,
  expected_delivery_days integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_product_international_shipping_product_id
  on public.product_international_shipping(product_id);

insert into public.domestic_shippingcharge_type (name)
select v.name
from (values
  ('Single Shipping Charge for Country Level'),
  ('Statewise Shipping Charge')
) as v(name)
where not exists (
  select 1 from public.domestic_shippingcharge_type d where d.name = v.name
);

insert into public.domestic_courier_type (name)
select 'Standard Domestic Courier'
where not exists (
  select 1 from public.domestic_courier_type d where d.name = 'Standard Domestic Courier'
);

insert into public.international_courier_type (name)
select 'Standard International Courier'
where not exists (
  select 1 from public.international_courier_type i where i.name = 'Standard International Courier'
);

create or replace function public.calculate_checkout_pricing(
  p_items jsonb,
  p_country text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with normalized_country as (
    select upper(regexp_replace(coalesce(p_country, ''), '\\s+', '', 'g')) as country_token
  ),
  destination_country as (
    select c.id
    from public.countries c
    cross join normalized_country nc
    where c.is_active = true
      and (
        upper(regexp_replace(coalesce(c.country_name, ''), '\\s+', '', 'g')) = nc.country_token
        or upper(regexp_replace(coalesce(c.country_code, ''), '\\s+', '', 'g')) = nc.country_token
        or upper(regexp_replace(coalesce(c.short_code, ''), '\\s+', '', 'g')) = nc.country_token
      )
    order by c.country_name
    limit 1
  ),
  requested as (
    select
      i.product_id,
      greatest(coalesce(i.quantity, 0), 0)::integer as quantity
    from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as i(product_id uuid, quantity integer)
    where i.product_id is not null
      and coalesce(i.quantity, 0) > 0
  ),
  product_rows as (
    select
      r.product_id,
      r.quantity,
      p.price,
      p.origin_country,
      p.origin_country_id
    from requested r
    join public.products p on p.id = r.product_id
  ),
  eligible_rows as (
    select
      pr.product_id,
      pr.quantity,
      pr.price,
      (
        (
          exists (
            select 1
            from destination_country dc
            where pr.origin_country_id is not null
              and pr.origin_country_id = dc.id
          )
        )
        or (
          upper(regexp_replace(coalesce(pr.origin_country, ''), '\\s+', '', 'g')) = (select country_token from normalized_country)
        )
        or exists (
          select 1
          from public.product_international_shipping pis
          left join destination_country dc on true
          where pis.product_id = pr.product_id
            and (
              (dc.id is not null and pis.country_id = dc.id)
              or upper(regexp_replace(coalesce(pis.country_name, ''), '\\s+', '', 'g')) = (select country_token from normalized_country)
            )
        )
        or exists (
          select 1
          from public.delivery_countries dc
          where dc.product_id = pr.product_id
            and (
              upper(regexp_replace(coalesce(dc.country_code, ''), '\\s+', '', 'g')) = (select country_token from normalized_country)
              or upper(regexp_replace(coalesce(dc.country_name, ''), '\\s+', '', 'g')) = (select country_token from normalized_country)
            )
        )
      ) as is_eligible,
      case
        when (
          exists (
            select 1
            from destination_country dc
            where pr.origin_country_id is not null
              and pr.origin_country_id = dc.id
          )
          or upper(regexp_replace(coalesce(pr.origin_country, ''), '\\s+', '', 'g')) = (select country_token from normalized_country)
        ) then coalesce(
          (
            select pds.flat_shipping_charge
            from public.product_domestic_shipping pds
            where pds.product_id = pr.product_id
            limit 1
          ),
          0
        )
        else coalesce(
          (
            select pis.shipping_charge
            from public.product_international_shipping pis
            left join destination_country dc on true
            where pis.product_id = pr.product_id
              and (
                (dc.id is not null and pis.country_id = dc.id)
                or upper(regexp_replace(coalesce(pis.country_name, ''), '\\s+', '', 'g')) = (select country_token from normalized_country)
              )
            order by pis.id desc
            limit 1
          ),
          (
            select ldc.delivery_charge
            from public.delivery_countries ldc
            where ldc.product_id = pr.product_id
              and (
                upper(regexp_replace(coalesce(ldc.country_code, ''), '\\s+', '', 'g')) = (select country_token from normalized_country)
                or upper(regexp_replace(coalesce(ldc.country_name, ''), '\\s+', '', 'g')) = (select country_token from normalized_country)
              )
            order by ldc.created_at desc
            limit 1
          ),
          0
        )
      end as shipping_per_unit
    from product_rows pr
  ),
  priced as (
    select
      er.product_id,
      er.quantity,
      er.price as selling_price,
      0::numeric as tax_rate,
      er.price as public_unit_price,
      er.price * er.quantity as line_total,
      coalesce(er.shipping_per_unit, 0) * er.quantity as shipping_total
    from eligible_rows er
    where er.is_eligible
  ),
  ineligible as (
    select
      er.product_id,
      coalesce(
        (
          select jsonb_agg(country_name)
          from (
            select distinct coalesce(c.country_name, pis.country_name) as country_name
            from public.product_international_shipping pis
            left join public.countries c on c.id = pis.country_id
            where pis.product_id = er.product_id
              and coalesce(c.country_name, pis.country_name) is not null
            union
            select distinct coalesce(ldc.country_name, ldc.country_code)
            from public.delivery_countries ldc
            where ldc.product_id = er.product_id
              and coalesce(ldc.country_name, ldc.country_code) is not null
          ) country_list
        ),
        '[]'::jsonb
      ) as available_countries
    from eligible_rows er
    where not er.is_eligible
  ),
  totals as (
    select
      coalesce(sum(priced.line_total), 0) as base_subtotal,
      coalesce(sum(priced.shipping_total), 0) as shipping
    from priced
  )
  select jsonb_build_object(
    'base_subtotal', totals.base_subtotal,
    'buyer_product_subtotal', totals.base_subtotal,
    'platform_handling_charge', totals.base_subtotal * 0.03,
    'shipping', totals.shipping,
    'total', totals.base_subtotal + (totals.base_subtotal * 0.03) + totals.shipping,
    'items', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'product_id', priced.product_id,
            'quantity', priced.quantity,
            'selling_price', priced.selling_price,
            'tax_rate', priced.tax_rate,
            'public_unit_price', priced.public_unit_price,
            'line_total', priced.line_total
          )
        )
        from priced
      ),
      '[]'::jsonb
    ),
    'ineligible_items', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'product_id', ineligible.product_id,
            'available_countries', ineligible.available_countries
          )
        )
        from ineligible
      ),
      '[]'::jsonb
    )
  )
  from totals;
$$;

grant execute on function public.calculate_checkout_pricing(jsonb, text) to anon, authenticated;

commit;
