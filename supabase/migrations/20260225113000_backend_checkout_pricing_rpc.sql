begin;

create or replace function public.resolve_tax_rate_for_product(
  p_product_id uuid,
  p_category_id uuid,
  p_country text default null
)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  with normalized as (
    select upper(regexp_replace(coalesce(p_country, 'INDIA'), '\s+', '', 'g')) as country_token
  ),
  matched as (
    select tr.percentage
    from public.tax_rules tr
    cross join normalized n
    where tr.is_active = true
      and (
        (
          coalesce(trim(tr.country), '') = ''
          and coalesce(trim(tr.country_code), '') = ''
        )
        or upper(regexp_replace(coalesce(tr.country, ''), '\s+', '', 'g')) = n.country_token
        or upper(regexp_replace(coalesce(tr.country_code, ''), '\s+', '', 'g')) = n.country_token
      )
      and (
        tr.product_id = p_product_id
        or (tr.product_id is null and tr.category_id = p_category_id)
        or (tr.product_id is null and tr.category_id is null)
      )
    order by
      case
        when tr.product_id = p_product_id then 1
        when tr.category_id = p_category_id and tr.product_id is null then 2
        else 3
      end,
      coalesce(tr.priority, 100) asc,
      tr.created_at desc
    limit 1
  )
  select coalesce(
    (
      select case when percentage > 1 then percentage / 100.0 else percentage end
      from matched
    ),
    0
  );
$$;

create or replace function public.get_public_product_prices(
  p_product_ids uuid[],
  p_country text default null
)
returns table (
  product_id uuid,
  selling_price numeric,
  tax_rate numeric,
  public_unit_price numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.id as product_id,
    p.price as selling_price,
    public.resolve_tax_rate_for_product(p.id, p.category, p_country) as tax_rate,
    p.price * (
      1
      + public.resolve_tax_rate_for_product(p.id, p.category, p_country)
      + 0.09
    ) as public_unit_price
  from public.products p
  where p.id = any(coalesce(p_product_ids, '{}'::uuid[]));
$$;

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
    select upper(regexp_replace(coalesce(p_country, 'INDIA'), '\s+', '', 'g')) as country_token
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
      p.category
    from requested r
    join public.products p on p.id = r.product_id
  ),
  priced as (
    select
      pr.product_id,
      pr.quantity,
      pr.price as selling_price,
      public.resolve_tax_rate_for_product(pr.product_id, pr.category, p_country) as tax_rate,
      pr.price * (
        1
        + public.resolve_tax_rate_for_product(pr.product_id, pr.category, p_country)
        + 0.09
      ) as public_unit_price,
      pr.price * pr.quantity as base_line_total,
      pr.price * (
        1
        + public.resolve_tax_rate_for_product(pr.product_id, pr.category, p_country)
        + 0.09
      ) * pr.quantity as buyer_line_total
    from product_rows pr
  ),
  shipping_rows as (
    select
      pr.product_id,
      pr.quantity,
      coalesce(
        (
          select dc.delivery_charge
          from public.delivery_countries dc
          cross join normalized_country nc
          where dc.product_id = pr.product_id
            and (
              upper(regexp_replace(coalesce(dc.country_code, ''), '\s+', '', 'g')) = nc.country_token
              or upper(regexp_replace(coalesce(dc.country_name, ''), '\s+', '', 'g')) = nc.country_token
            )
          order by dc.created_at desc
          limit 1
        ),
        0
      ) as shipping_per_unit
    from product_rows pr
  ),
  totals as (
    select
      coalesce(sum(priced.base_line_total), 0) as base_subtotal,
      coalesce(sum(priced.buyer_line_total), 0) as buyer_product_subtotal,
      coalesce(sum(shipping_rows.shipping_per_unit * shipping_rows.quantity), 0) as shipping
    from priced
    left join shipping_rows on shipping_rows.product_id = priced.product_id
  )
  select jsonb_build_object(
    'base_subtotal', totals.base_subtotal,
    'buyer_product_subtotal', totals.buyer_product_subtotal,
    'platform_handling_charge', totals.base_subtotal * 0.03,
    'shipping', totals.shipping,
    'total', totals.buyer_product_subtotal + (totals.base_subtotal * 0.03) + totals.shipping,
    'items', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'product_id', priced.product_id,
            'quantity', priced.quantity,
            'selling_price', priced.selling_price,
            'tax_rate', priced.tax_rate,
            'public_unit_price', priced.public_unit_price,
            'line_total', priced.buyer_line_total
          )
        )
        from priced
      ),
      '[]'::jsonb
    )
  )
  from totals;
$$;

grant execute on function public.resolve_tax_rate_for_product(uuid, uuid, text) to anon, authenticated;
grant execute on function public.get_public_product_prices(uuid[], text) to anon, authenticated;
grant execute on function public.calculate_checkout_pricing(jsonb, text) to anon, authenticated;

commit;
