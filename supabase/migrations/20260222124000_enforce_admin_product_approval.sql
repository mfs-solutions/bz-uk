-- Enforce admin approval flow for seller products.
-- Sellers can create/edit their products, but cannot self-approve or self-activate.

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
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_products_admin_approval on public.products;

create trigger trg_enforce_products_admin_approval
before insert or update on public.products
for each row
execute function public.enforce_products_admin_approval();

commit;
