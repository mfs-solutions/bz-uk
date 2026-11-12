begin;

-- Fix broken trigger SQL introduced in 20260513120000.
-- That function referenced product_origin_destination_shipping_rates.min_order_inr,
-- but the table has no min_order_inr column. Use checkout_min_order_rules instead.

create or replace function public.enforce_checkout_min_order_value()
returns trigger
language plpgsql
as $$
declare
  v_violation record;
begin
  with affected_orders as (
    select distinct ni.order_id
    from new_items ni
    where ni.order_id is not null
  ),
  destination_tokens as (
    select
      ao.order_id,
      upper(regexp_replace(coalesce(
        o.shipping_address->>'countryCode',
        o.shipping_address->>'country_code',
        o.shipping_address->>'country',
        ''
      ), '\\s+', '', 'g')) as destination_token
    from affected_orders ao
    join orders o on o.id = ao.order_id
  ),
  resolved_destinations as (
    select
      dt.order_id,
      coalesce(
        (
          select upper(trim(coalesce(c.iso2, c.country_code, c.short_code, '')))
          from countries c
          where dt.destination_token <> ''
            and (
              upper(regexp_replace(coalesce(c.iso2, ''), '\\s+', '', 'g')) = dt.destination_token
              or upper(regexp_replace(coalesce(c.country_code, ''), '\\s+', '', 'g')) = dt.destination_token
              or upper(regexp_replace(coalesce(c.short_code, ''), '\\s+', '', 'g')) = dt.destination_token
              or upper(regexp_replace(coalesce(c.country_name, ''), '\\s+', '', 'g')) = dt.destination_token
            )
          limit 1
        ),
        case
          when dt.destination_token in ('UK', 'GB', 'GBR', 'UNITEDKINGDOM', 'ENGLAND', 'SCOTLAND', 'WALES', 'NORTHERNIRELAND') then 'GB'
          when dt.destination_token in ('IN', 'IND', 'INDIA') then 'IN'
          else null
        end
      ) as destination_iso2
    from destination_tokens dt
  ),
  order_item_lines as (
    select
      oi.order_id,
      upper(trim(coalesce(
        c_origin.iso2,
        (
          select coalesce(c2.iso2, c2.country_code, c2.short_code)
          from countries c2
          where p.origin_country is not null
            and (
              upper(regexp_replace(coalesce(c2.iso2, ''), '\\s+', '', 'g')) = upper(regexp_replace(p.origin_country, '\\s+', '', 'g'))
              or upper(regexp_replace(coalesce(c2.country_code, ''), '\\s+', '', 'g')) = upper(regexp_replace(p.origin_country, '\\s+', '', 'g'))
              or upper(regexp_replace(coalesce(c2.short_code, ''), '\\s+', '', 'g')) = upper(regexp_replace(p.origin_country, '\\s+', '', 'g'))
              or upper(regexp_replace(coalesce(c2.country_name, ''), '\\s+', '', 'g')) = upper(regexp_replace(p.origin_country, '\\s+', '', 'g'))
            )
          limit 1
        ),
        case
          when upper(regexp_replace(coalesce(p.origin_country, ''), '\\s+', '', 'g')) in ('IN', 'IND', 'INDIA') then 'IN'
          when upper(regexp_replace(coalesce(p.origin_country, ''), '\\s+', '', 'g')) in ('UK', 'GB', 'GBR', 'UNITEDKINGDOM', 'ENGLAND', 'SCOTLAND', 'WALES', 'NORTHERNIRELAND') then 'GB'
          else ''
        end
      ))) as origin_iso2,
      coalesce(
        (
          select pcsp.selling_price
          from product_country_selling_prices pcsp
          join countries c_dest on c_dest.id = pcsp.country_id
          where pcsp.product_id = p.id
            and rd.destination_iso2 is not null
            and upper(trim(coalesce(c_dest.iso2, c_dest.country_code, c_dest.short_code, ''))) = rd.destination_iso2
          limit 1
        ),
        (
          case
            when (
              select count(*)
              from product_variants pv_count
              where pv_count.product_id = p.id
            ) > 1 then coalesce(
              (
                select pv_match.price
                from product_variants pv_match
                where pv_match.product_id = p.id
                  and upper(trim(pv_match.sku)) = upper(trim(coalesce(oi.variant_info->>'sku', '')))
                limit 1
              ),
              p.price
            )
            else p.price
          end
        )
      ) * oi.quantity as line_total_inr
    from order_items oi
    join affected_orders ao on ao.order_id = oi.order_id
    join products p on p.id = oi.product_id
    left join countries c_origin on c_origin.id = p.origin_country_id
    left join resolved_destinations rd on rd.order_id = oi.order_id
  ),
  route_totals as (
    select
      rd.order_id,
      upper(trim(oil.origin_iso2)) as origin_iso2,
      upper(trim(rd.destination_iso2)) as destination_iso2,
      r.min_order_inr,
      sum(oil.line_total_inr) as eligible_subtotal_inr
    from resolved_destinations rd
    left join order_item_lines oil on oil.order_id = rd.order_id
    left join lateral (
      select coalesce(mor.min_order_inr, 0) as min_order_inr
      from checkout_min_order_rules mor
      where upper(trim(coalesce(mor.origin_iso2, '')))      = upper(trim(coalesce(oil.origin_iso2, '')))
        and upper(trim(coalesce(mor.destination_iso2, ''))) = upper(trim(coalesce(rd.destination_iso2, '')))
        and mor.is_active = true
        and mor.min_order_inr is not null
        and mor.min_order_inr > 0
      order by mor.min_order_inr desc
      limit 1
    ) r on true
    group by rd.order_id, oil.origin_iso2, rd.destination_iso2, r.min_order_inr
  )
  select rt.order_id, rt.origin_iso2, rt.destination_iso2, rt.min_order_inr, rt.eligible_subtotal_inr
  into v_violation
  from route_totals rt
  where rt.min_order_inr is not null
    and rt.min_order_inr > 0
    and rt.eligible_subtotal_inr < rt.min_order_inr
  limit 1;

  if found then
    raise exception 'Minimum order for route % -> % is INR %.2f. Current eligible subtotal is INR %.2f.',
      v_violation.origin_iso2,
      v_violation.destination_iso2,
      v_violation.min_order_inr,
      v_violation.eligible_subtotal_inr
      using errcode = '23514';
  end if;

  return null;
end;
$$;

commit;
