-- Allow sellers to manage only their own promotions.
-- Ownership is represented by applicable_to = 'seller'
-- and auth.uid()::text contained in applicable_ids (text[]).

do $$
begin
  if to_regclass('public.promotions') is null then
    raise notice 'Skipping promotions RLS patch because public.promotions does not exist yet.';
    return;
  end if;

  execute 'alter table public.promotions enable row level security';

  execute 'drop policy if exists promotions_seller_select_own on public.promotions';
  execute $policy$
    create policy promotions_seller_select_own
    on public.promotions
    for select
    to authenticated
    using (
      applicable_to = ''seller''
      and auth.uid()::text = any(applicable_ids)
    )
  $policy$;

  execute 'drop policy if exists promotions_seller_insert_own on public.promotions';
  execute $policy$
    create policy promotions_seller_insert_own
    on public.promotions
    for insert
    to authenticated
    with check (
      applicable_to = ''seller''
      and auth.uid()::text = any(applicable_ids)
    )
  $policy$;

  execute 'drop policy if exists promotions_seller_update_own on public.promotions';
  execute $policy$
    create policy promotions_seller_update_own
    on public.promotions
    for update
    to authenticated
    using (
      applicable_to = ''seller''
      and auth.uid()::text = any(applicable_ids)
    )
    with check (
      applicable_to = ''seller''
      and auth.uid()::text = any(applicable_ids)
    )
  $policy$;

  execute 'drop policy if exists promotions_seller_delete_own on public.promotions';
  execute $policy$
    create policy promotions_seller_delete_own
    on public.promotions
    for delete
    to authenticated
    using (
      applicable_to = ''seller''
      and auth.uid()::text = any(applicable_ids)
    )
  $policy$;
end $$;
