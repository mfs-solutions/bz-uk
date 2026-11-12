-- Add missing unique constraint on wishlists(user_id, product_id)
-- Required for upsert onConflict to work (prevents 409 errors)
-- Safe: skips if constraint already exists

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'wishlists_user_id_product_id_key'
      and conrelid = 'public.wishlists'::regclass
  ) then
    alter table public.wishlists
      add constraint wishlists_user_id_product_id_key unique (user_id, product_id);
  end if;
end $$;
