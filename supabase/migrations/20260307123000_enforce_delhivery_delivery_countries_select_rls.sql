begin;

-- Remove any legacy permissive SELECT policies (e.g. USING (true)) by name-independent detection.
do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'product_delhivery_shipping'
      and cmd = 'SELECT'
      and coalesce(trim(qual), '') in ('true', '(true)')
  loop
    execute format('drop policy if exists %I on public.product_delhivery_shipping', r.policyname);
  end loop;

  for r in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'delivery_countries'
      and cmd = 'SELECT'
      and coalesce(trim(qual), '') in ('true', '(true)')
  loop
    execute format('drop policy if exists %I on public.delivery_countries', r.policyname);
  end loop;
end $$;

alter table public.product_delhivery_shipping enable row level security;
alter table public.delivery_countries enable row level security;

grant select on table public.product_delhivery_shipping to anon, authenticated;
grant select on table public.delivery_countries to anon, authenticated;

drop policy if exists product_delhivery_shipping_select_public_approved on public.product_delhivery_shipping;
create policy product_delhivery_shipping_select_public_approved
  on public.product_delhivery_shipping for select to anon, authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_delhivery_shipping.product_id
        and p.approval_status = 'approved'
        and p.is_active = true
    )
  );

drop policy if exists product_delhivery_shipping_select_own on public.product_delhivery_shipping;
create policy product_delhivery_shipping_select_own
  on public.product_delhivery_shipping for select to authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_delhivery_shipping.product_id
        and p.seller_id = auth.uid()
    )
  );

drop policy if exists delivery_countries_select_public_approved on public.delivery_countries;
create policy delivery_countries_select_public_approved
  on public.delivery_countries for select to anon, authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = delivery_countries.product_id
        and p.approval_status = 'approved'
        and p.is_active = true
    )
  );

drop policy if exists delivery_countries_select_own on public.delivery_countries;
create policy delivery_countries_select_own
  on public.delivery_countries for select to authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = delivery_countries.product_id
        and p.seller_id = auth.uid()
    )
  );

commit;
