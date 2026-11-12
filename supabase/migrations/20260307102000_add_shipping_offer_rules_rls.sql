begin;

alter table public.product_domestic_shipping enable row level security;
alter table public.product_domestic_state_charges enable row level security;
alter table public.product_international_shipping enable row level security;
alter table public.offer_rules enable row level security;

grant select on table public.domestic_courier_type to anon, authenticated;
grant select on table public.domestic_shippingcharge_type to anon, authenticated;
grant select on table public.international_courier_type to anon, authenticated;

grant select on table public.product_domestic_shipping to anon, authenticated;
grant select on table public.product_domestic_state_charges to anon, authenticated;
grant select on table public.product_international_shipping to anon, authenticated;
grant select on table public.offer_rules to anon, authenticated;

grant insert, update, delete on table public.product_domestic_shipping to authenticated;
grant insert, update, delete on table public.product_domestic_state_charges to authenticated;
grant insert, update, delete on table public.product_international_shipping to authenticated;
grant insert, update, delete on table public.offer_rules to authenticated;

drop policy if exists domestic_courier_type_select_all on public.domestic_courier_type;
create policy domestic_courier_type_select_all
  on public.domestic_courier_type for select to anon, authenticated
  using (true);

drop policy if exists domestic_shippingcharge_type_select_all on public.domestic_shippingcharge_type;
create policy domestic_shippingcharge_type_select_all
  on public.domestic_shippingcharge_type for select to anon, authenticated
  using (true);

drop policy if exists international_courier_type_select_all on public.international_courier_type;
create policy international_courier_type_select_all
  on public.international_courier_type for select to anon, authenticated
  using (true);

drop policy if exists product_domestic_shipping_select_public_approved on public.product_domestic_shipping;
create policy product_domestic_shipping_select_public_approved
  on public.product_domestic_shipping for select to anon, authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_domestic_shipping.product_id
        and p.approval_status = 'approved'
        and p.is_active = true
    )
  );

drop policy if exists product_domestic_shipping_select_own on public.product_domestic_shipping;
create policy product_domestic_shipping_select_own
  on public.product_domestic_shipping for select to authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_domestic_shipping.product_id
        and p.seller_id = auth.uid()
    )
  );

drop policy if exists product_domestic_shipping_insert_own on public.product_domestic_shipping;
create policy product_domestic_shipping_insert_own
  on public.product_domestic_shipping for insert to authenticated
  with check (
    exists (
      select 1
      from public.products p
      where p.id = product_domestic_shipping.product_id
        and p.seller_id = auth.uid()
    )
  );

drop policy if exists product_domestic_shipping_update_own on public.product_domestic_shipping;
create policy product_domestic_shipping_update_own
  on public.product_domestic_shipping for update to authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_domestic_shipping.product_id
        and p.seller_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.products p
      where p.id = product_domestic_shipping.product_id
        and p.seller_id = auth.uid()
    )
  );

drop policy if exists product_domestic_shipping_delete_own on public.product_domestic_shipping;
create policy product_domestic_shipping_delete_own
  on public.product_domestic_shipping for delete to authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_domestic_shipping.product_id
        and p.seller_id = auth.uid()
    )
  );

drop policy if exists product_domestic_shipping_admin_all on public.product_domestic_shipping;
create policy product_domestic_shipping_admin_all
  on public.product_domestic_shipping for all to authenticated
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

drop policy if exists product_domestic_state_charges_select_public_approved on public.product_domestic_state_charges;
create policy product_domestic_state_charges_select_public_approved
  on public.product_domestic_state_charges for select to anon, authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_domestic_state_charges.product_id
        and p.approval_status = 'approved'
        and p.is_active = true
    )
  );

drop policy if exists product_domestic_state_charges_select_own on public.product_domestic_state_charges;
create policy product_domestic_state_charges_select_own
  on public.product_domestic_state_charges for select to authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_domestic_state_charges.product_id
        and p.seller_id = auth.uid()
    )
  );

drop policy if exists product_domestic_state_charges_insert_own on public.product_domestic_state_charges;
create policy product_domestic_state_charges_insert_own
  on public.product_domestic_state_charges for insert to authenticated
  with check (
    exists (
      select 1
      from public.products p
      where p.id = product_domestic_state_charges.product_id
        and p.seller_id = auth.uid()
    )
  );

drop policy if exists product_domestic_state_charges_update_own on public.product_domestic_state_charges;
create policy product_domestic_state_charges_update_own
  on public.product_domestic_state_charges for update to authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_domestic_state_charges.product_id
        and p.seller_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.products p
      where p.id = product_domestic_state_charges.product_id
        and p.seller_id = auth.uid()
    )
  );

drop policy if exists product_domestic_state_charges_delete_own on public.product_domestic_state_charges;
create policy product_domestic_state_charges_delete_own
  on public.product_domestic_state_charges for delete to authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_domestic_state_charges.product_id
        and p.seller_id = auth.uid()
    )
  );

drop policy if exists product_domestic_state_charges_admin_all on public.product_domestic_state_charges;
create policy product_domestic_state_charges_admin_all
  on public.product_domestic_state_charges for all to authenticated
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

drop policy if exists product_international_shipping_select_public_approved on public.product_international_shipping;
create policy product_international_shipping_select_public_approved
  on public.product_international_shipping for select to anon, authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_international_shipping.product_id
        and p.approval_status = 'approved'
        and p.is_active = true
    )
  );

drop policy if exists product_international_shipping_select_own on public.product_international_shipping;
create policy product_international_shipping_select_own
  on public.product_international_shipping for select to authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_international_shipping.product_id
        and p.seller_id = auth.uid()
    )
  );

drop policy if exists product_international_shipping_insert_own on public.product_international_shipping;
create policy product_international_shipping_insert_own
  on public.product_international_shipping for insert to authenticated
  with check (
    exists (
      select 1
      from public.products p
      where p.id = product_international_shipping.product_id
        and p.seller_id = auth.uid()
    )
  );

drop policy if exists product_international_shipping_update_own on public.product_international_shipping;
create policy product_international_shipping_update_own
  on public.product_international_shipping for update to authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_international_shipping.product_id
        and p.seller_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.products p
      where p.id = product_international_shipping.product_id
        and p.seller_id = auth.uid()
    )
  );

drop policy if exists product_international_shipping_delete_own on public.product_international_shipping;
create policy product_international_shipping_delete_own
  on public.product_international_shipping for delete to authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_international_shipping.product_id
        and p.seller_id = auth.uid()
    )
  );

drop policy if exists product_international_shipping_admin_all on public.product_international_shipping;
create policy product_international_shipping_admin_all
  on public.product_international_shipping for all to authenticated
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

drop policy if exists offer_rules_select_public_approved on public.offer_rules;
create policy offer_rules_select_public_approved
  on public.offer_rules for select to anon, authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = offer_rules.product_id
        and p.approval_status = 'approved'
        and p.is_active = true
    )
  );

drop policy if exists offer_rules_select_own on public.offer_rules;
create policy offer_rules_select_own
  on public.offer_rules for select to authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = offer_rules.product_id
        and p.seller_id = auth.uid()
    )
  );

drop policy if exists offer_rules_insert_own on public.offer_rules;
create policy offer_rules_insert_own
  on public.offer_rules for insert to authenticated
  with check (
    exists (
      select 1
      from public.products p
      where p.id = offer_rules.product_id
        and p.seller_id = auth.uid()
    )
  );

drop policy if exists offer_rules_update_own on public.offer_rules;
create policy offer_rules_update_own
  on public.offer_rules for update to authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = offer_rules.product_id
        and p.seller_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.products p
      where p.id = offer_rules.product_id
        and p.seller_id = auth.uid()
    )
  );

drop policy if exists offer_rules_delete_own on public.offer_rules;
create policy offer_rules_delete_own
  on public.offer_rules for delete to authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = offer_rules.product_id
        and p.seller_id = auth.uid()
    )
  );

drop policy if exists offer_rules_admin_all on public.offer_rules;
create policy offer_rules_admin_all
  on public.offer_rules for all to authenticated
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
