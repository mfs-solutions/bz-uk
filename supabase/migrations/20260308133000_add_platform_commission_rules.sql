begin;

create table if not exists public.platform_commission_rules (
  id uuid primary key default gen_random_uuid(),
  country_id uuid references public.countries(id) on delete cascade,
  from_price numeric(12,2) not null default 0,
  to_price numeric(12,2),
  charge_percent numeric(8,4) not null default 3,
  extra_charge numeric(12,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_platform_commission_rules_price_range check (to_price is null or to_price >= from_price),
  constraint chk_platform_commission_rules_charge_percent check (charge_percent >= 0),
  constraint chk_platform_commission_rules_extra_charge check (extra_charge >= 0)
);

create index if not exists idx_platform_commission_rules_lookup
  on public.platform_commission_rules(country_id, is_active, from_price, to_price);

insert into public.platform_commission_rules (
  country_id,
  from_price,
  to_price,
  charge_percent,
  extra_charge,
  is_active
)
select
  null,
  0,
  null,
  3,
  0,
  true
where not exists (
  select 1
  from public.platform_commission_rules r
  where r.country_id is null
    and r.from_price = 0
    and r.to_price is null
    and r.charge_percent = 3
    and coalesce(r.extra_charge, 0) = 0
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
  ),
  commission_rule as (
    select
      coalesce(r.charge_percent, 3) as charge_percent,
      coalesce(r.extra_charge, 0) as extra_charge
    from public.platform_commission_rules r
    cross join totals t
    where r.is_active = true
      and t.base_subtotal >= coalesce(r.from_price, 0)
      and (r.to_price is null or t.base_subtotal <= r.to_price)
      and (
        (r.country_id is null)
        or exists (
          select 1
          from destination_country dc
          where dc.id = r.country_id
        )
      )
    order by
      case when r.country_id is null then 1 else 0 end,
      coalesce(r.from_price, 0) desc,
      r.created_at desc
    limit 1
  ),
  commission as (
    select
      coalesce((select cr.charge_percent from commission_rule cr), 3) as charge_percent,
      coalesce((select cr.extra_charge from commission_rule cr), 0) as extra_charge
  )
  select jsonb_build_object(
    'base_subtotal', totals.base_subtotal,
    'buyer_product_subtotal', totals.base_subtotal,
    'platform_handling_charge', (totals.base_subtotal * commission.charge_percent / 100) + commission.extra_charge,
    'platform_commission_charge', (totals.base_subtotal * commission.charge_percent / 100) + commission.extra_charge,
    'shipping', totals.shipping,
    'total', totals.base_subtotal + ((totals.base_subtotal * commission.charge_percent / 100) + commission.extra_charge) + totals.shipping,
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
  from totals
  cross join commission;
$$;

grant execute on function public.calculate_checkout_pricing(jsonb, text) to anon, authenticated;

commit;
