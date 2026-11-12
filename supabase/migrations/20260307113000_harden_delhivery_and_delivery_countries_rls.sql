begin;

alter table public.delivery_countries enable row level security;

grant select on table public.delivery_countries to anon, authenticated;
grant insert, update, delete on table public.delivery_countries to authenticated;

-- Restrict Delhivery read access to public approved listings or product owners.
drop policy if exists product_delhivery_shipping_select_own on public.product_delhivery_shipping;
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

drop policy if exists product_delhivery_shipping_insert_own on public.product_delhivery_shipping;
create policy product_delhivery_shipping_insert_own
  on public.product_delhivery_shipping for insert to authenticated
  with check (
    product_delhivery_shipping.seller_id = auth.uid()
    and exists (
      select 1
      from public.products p
      where p.id = product_delhivery_shipping.product_id
        and p.seller_id = auth.uid()
    )
  );

drop policy if exists product_delhivery_shipping_update_own on public.product_delhivery_shipping;
create policy product_delhivery_shipping_update_own
  on public.product_delhivery_shipping for update to authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_delhivery_shipping.product_id
        and p.seller_id = auth.uid()
    )
  )
  with check (
    product_delhivery_shipping.seller_id = auth.uid()
    and exists (
      select 1
      from public.products p
      where p.id = product_delhivery_shipping.product_id
        and p.seller_id = auth.uid()
    )
  );

drop policy if exists product_delhivery_shipping_delete_own on public.product_delhivery_shipping;
create policy product_delhivery_shipping_delete_own
  on public.product_delhivery_shipping for delete to authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_delhivery_shipping.product_id
        and p.seller_id = auth.uid()
    )
  );

-- Add explicit ownership-constrained access for legacy delivery_countries table.
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

drop policy if exists delivery_countries_insert_own on public.delivery_countries;
create policy delivery_countries_insert_own
  on public.delivery_countries for insert to authenticated
  with check (
    exists (
      select 1
      from public.products p
      where p.id = delivery_countries.product_id
        and p.seller_id = auth.uid()
    )
  );

drop policy if exists delivery_countries_update_own on public.delivery_countries;
create policy delivery_countries_update_own
  on public.delivery_countries for update to authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = delivery_countries.product_id
        and p.seller_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.products p
      where p.id = delivery_countries.product_id
        and p.seller_id = auth.uid()
    )
  );

drop policy if exists delivery_countries_delete_own on public.delivery_countries;
create policy delivery_countries_delete_own
  on public.delivery_countries for delete to authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = delivery_countries.product_id
        and p.seller_id = auth.uid()
    )
  );

drop policy if exists delivery_countries_admin_all on public.delivery_countries;
create policy delivery_countries_admin_all
  on public.delivery_countries for all to authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid() and profile.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid() and profile.role = 'admin'
    )
  );

commit;
