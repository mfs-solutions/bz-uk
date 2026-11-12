-- =============================================================================
-- SECURITY FIX: Remove user-spoofable admin check from RLS / triggers
--
-- Problem: several admin gates trusted
--     auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
-- but user_metadata is writable by the user themselves via
--     supabase.auth.updateUser({ data: { role: 'admin' } })
-- which let any seller self-approve their own KYC and auto-approve/publish
-- their own products.
--
-- This migration re-creates the affected function + policies WITHOUT the
-- user_metadata path. The legitimate admin paths are preserved:
--   * EXISTS(profiles WHERE id = auth.uid() AND role = 'admin')  -- real admin
--   * auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'          -- not user-editable
--   * auth.role() = 'service_role'                               -- edge functions
--
-- Safe on a live site: your AdminLayout already requires profiles.role='admin',
-- so real admins are unaffected; only the spoofable path is closed.
-- =============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. products: enforce_products_admin_approval()
--    (body preserved from 20260325120000; search_path preserved from 20260420130000)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.enforce_products_admin_approval()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  is_admin boolean;
begin
  is_admin :=
    coalesce(auth.role(), '') = 'service_role'
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';

  if tg_op = 'INSERT' then
    if not is_admin then
      new.approval_status := 'pending';
      new.is_active := false;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if not is_admin then
      new.approval_status := old.approval_status;
      new.is_active := old.is_active;
    else
      -- Admin path: auto-activate when approving, auto-deactivate when rejecting
      if new.approval_status = 'approved' and old.approval_status <> 'approved' then
        new.is_active := true;
      elsif new.approval_status = 'rejected' and old.approval_status <> 'rejected' then
        new.is_active := false;
      end if;
    end if;
    return new;
  end if;

  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. seller_kyc: admin policies (select / update / delete)
--    Only re-create when the table exists.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.seller_kyc') is null then
    raise notice 'Skipping seller_kyc admin policy hardening: table does not exist.';
    return;
  end if;

  execute 'drop policy if exists seller_kyc_admin_select_all on public.seller_kyc';
  execute 'drop policy if exists seller_kyc_admin_update_all on public.seller_kyc';
  execute 'drop policy if exists seller_kyc_admin_delete_all on public.seller_kyc';

  execute $policy$
    create policy seller_kyc_admin_select_all
      on public.seller_kyc
      for select
      to authenticated
      using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
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
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
        or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
      )
      with check (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
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
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
        or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
      )
  $policy$;
end $$;

commit;
