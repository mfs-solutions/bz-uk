begin;

alter table public.order_items
  add column if not exists customer_unit_price numeric(12,2),
  add column if not exists seller_unit_price numeric(12,2),
  add column if not exists customer_line_total numeric(12,2),
  add column if not exists seller_line_total numeric(12,2);

alter table public.orders
  add column if not exists seller_items_subtotal numeric(12,2) not null default 0;

create or replace function public.apply_order_item_price_snapshots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qty numeric := greatest(coalesce(new.quantity, 0), 0);
  v_sku text;
  v_variant_price numeric;
  v_product_price numeric;
begin
  new.customer_unit_price := round(coalesce(new.customer_unit_price, new.price, 0), 2);

  if new.seller_unit_price is null then
    v_sku := upper(trim(coalesce(new.variant_info->>'sku', '')));

    if new.product_id is not null and v_sku <> '' then
      select pv.price
      into v_variant_price
      from public.product_variants pv
      where pv.product_id = new.product_id
        and upper(trim(coalesce(pv.sku, ''))) = v_sku
      order by pv.updated_at desc nulls last
      limit 1;
    end if;

    if new.product_id is not null then
      select p.price
      into v_product_price
      from public.products p
      where p.id = new.product_id
      limit 1;
    end if;

    new.seller_unit_price := round(coalesce(v_variant_price, v_product_price, new.customer_unit_price, 0), 2);
  else
    new.seller_unit_price := round(coalesce(new.seller_unit_price, 0), 2);
  end if;

  new.price := new.customer_unit_price;
  new.customer_line_total := round(coalesce(new.customer_line_total, new.customer_unit_price * v_qty), 2);
  new.seller_line_total := round(coalesce(new.seller_line_total, new.seller_unit_price * v_qty), 2);

  return new;
end;
$$;

create or replace function public.refresh_order_seller_subtotal(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders o
  set seller_items_subtotal = round(
    coalesce(
      (
        select sum(
          coalesce(
            oi.seller_line_total,
            coalesce(oi.seller_unit_price, 0) * greatest(coalesce(oi.quantity, 0), 0)
          )
        )
        from public.order_items oi
        where oi.order_id = o.id
      ),
      0
    ),
    2
  )
  where o.id = p_order_id;
end;
$$;

create or replace function public.order_items_refresh_order_seller_subtotal_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_order_seller_subtotal(new.order_id);
  end if;

  if tg_op in ('DELETE', 'UPDATE') then
    perform public.refresh_order_seller_subtotal(old.order_id);
  end if;

  return null;
end;
$$;

drop trigger if exists trg_order_items_price_snapshots on public.order_items;
create trigger trg_order_items_price_snapshots
before insert or update of quantity, price, customer_unit_price, seller_unit_price, product_id, variant_info
on public.order_items
for each row
execute function public.apply_order_item_price_snapshots();

drop trigger if exists trg_order_items_refresh_order_seller_subtotal on public.order_items;
create trigger trg_order_items_refresh_order_seller_subtotal
after insert or update or delete
on public.order_items
for each row
execute function public.order_items_refresh_order_seller_subtotal_trigger();

-- Backfill existing rows with snapshot prices.
update public.order_items oi
set
  customer_unit_price = round(coalesce(oi.customer_unit_price, oi.price, 0), 2),
  seller_unit_price = round(
    coalesce(
      oi.seller_unit_price,
      (
        select pv.price
        from public.product_variants pv
        where oi.product_id is not null
          and pv.product_id = oi.product_id
          and upper(trim(coalesce(pv.sku, ''))) = upper(trim(coalesce(oi.variant_info->>'sku', '')))
        order by pv.updated_at desc nulls last
        limit 1
      ),
      (
        select p.price
        from public.products p
        where oi.product_id is not null
          and p.id = oi.product_id
        limit 1
      ),
      oi.price,
      0
    ),
    2
  ),
  customer_line_total = round(
    coalesce(
      oi.customer_line_total,
      coalesce(oi.customer_unit_price, oi.price, 0) * greatest(coalesce(oi.quantity, 0), 0)
    ),
    2
  ),
  seller_line_total = round(
    coalesce(
      oi.seller_line_total,
      coalesce(
        oi.seller_unit_price,
        (
          select pv.price
          from public.product_variants pv
          where oi.product_id is not null
            and pv.product_id = oi.product_id
            and upper(trim(coalesce(pv.sku, ''))) = upper(trim(coalesce(oi.variant_info->>'sku', '')))
          order by pv.updated_at desc nulls last
          limit 1
        ),
        (
          select p.price
          from public.products p
          where oi.product_id is not null
            and p.id = oi.product_id
          limit 1
        ),
        oi.price,
        0
      ) * greatest(coalesce(oi.quantity, 0), 0)
    ),
    2
  ),
  price = round(coalesce(oi.customer_unit_price, oi.price, 0), 2);

update public.orders o
set seller_items_subtotal = round(
  coalesce(
    (
      select sum(
        coalesce(
          oi.seller_line_total,
          coalesce(oi.seller_unit_price, 0) * greatest(coalesce(oi.quantity, 0), 0)
        )
      )
      from public.order_items oi
      where oi.order_id = o.id
    ),
    0
  ),
  2
);

commit;
