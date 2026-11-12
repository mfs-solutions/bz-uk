-- Auto-set is_active = true when approval_status changes to 'approved'.
-- Prevents approved-but-inactive products (which show in listings but fail on detail page).

begin;

create or replace function public.enforce_products_admin_approval()
returns trigger
language plpgsql
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
    or coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin'
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

-- Fix any existing approved-but-inactive products.
-- Temporarily disable the trigger since migrations run as postgres (not detected as admin).
alter table public.products disable trigger trg_enforce_products_admin_approval;

update public.products
set is_active = true
where approval_status = 'approved' and is_active = false;

alter table public.products enable trigger trg_enforce_products_admin_approval;

commit;
