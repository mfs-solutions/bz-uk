-- Fix seller_kyc visibility mismatch:
-- Sellers can submit and see own KYC, admins can list/approve/reject all rows.

begin;

do $$
begin
  if to_regclass('public.seller_kyc') is null then
    raise notice 'Skipping seller_kyc RLS patch because public.seller_kyc does not exist yet.';
    return;
  end if;

  execute 'alter table public.seller_kyc enable row level security';
  execute 'grant select, insert, update, delete on table public.seller_kyc to authenticated';

  execute 'drop policy if exists seller_kyc_select_own on public.seller_kyc';
  execute 'drop policy if exists seller_kyc_insert_own on public.seller_kyc';
  execute 'drop policy if exists seller_kyc_update_own on public.seller_kyc';
  execute 'drop policy if exists seller_kyc_admin_select_all on public.seller_kyc';
  execute 'drop policy if exists seller_kyc_admin_update_all on public.seller_kyc';
  execute 'drop policy if exists seller_kyc_admin_delete_all on public.seller_kyc';

  execute $policy$
    create policy seller_kyc_select_own
      on public.seller_kyc
      for select
      to authenticated
      using (seller_id = auth.uid())
  $policy$;

  execute $policy$
    create policy seller_kyc_insert_own
      on public.seller_kyc
      for insert
      to authenticated
      with check (seller_id = auth.uid())
  $policy$;

  execute $policy$
    create policy seller_kyc_update_own
      on public.seller_kyc
      for update
      to authenticated
      using (seller_id = auth.uid())
      with check (seller_id = auth.uid())
  $policy$;

  execute $policy$
    create policy seller_kyc_admin_select_all
      on public.seller_kyc
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'admin'
        )
        or coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin'
        or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
      )
  $policy$;

  execute $policy$
    create policy seller_kyc_admin_update_all
      on public.seller_kyc
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'admin'
        )
        or coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin'
        or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
      )
      with check (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'admin'
        )
        or coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin'
        or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
      )
  $policy$;

  execute $policy$
    create policy seller_kyc_admin_delete_all
      on public.seller_kyc
      for delete
      to authenticated
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'admin'
        )
        or coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin'
        or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
      )
  $policy$;
end $$;

commit;
