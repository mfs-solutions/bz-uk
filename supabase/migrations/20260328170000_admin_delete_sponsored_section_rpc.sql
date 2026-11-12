begin;

create or replace function public.admin_delete_sponsored_section(
  p_section text,
  p_seller_id uuid
)
returns void
language plpgsql
security invoker
as $$
declare
  v_is_admin boolean;
begin
  if p_section not in ('featured', 'trending', 'hot-deals') then
    raise exception 'Invalid section.';
  end if;

  select exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.role = 'admin'
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Only admin can delete sponsored sections.';
  end if;

  delete from public.sponsored_products
  where section = p_section
    and seller_id = p_seller_id
    and is_active = true
    and end_at > now();
end;
$$;

grant execute on function public.admin_delete_sponsored_section(text, uuid)
to authenticated;

commit;
