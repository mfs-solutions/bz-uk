begin;

create or replace function public.admin_replace_sponsored_section(
  p_section text,
  p_seller_id uuid,
  p_product_ids uuid[],
  p_start_at timestamptz,
  p_end_at timestamptz
)
returns void
language plpgsql
security invoker
as $$
declare
  v_is_admin boolean;
  v_product_id uuid;
begin
  if p_section not in ('featured', 'trending', 'hot-deals') then
    raise exception 'Invalid section.';
  end if;

  if p_product_ids is null or coalesce(array_length(p_product_ids, 1), 0) = 0 then
    raise exception 'At least one product is required.';
  end if;

  if array_length(p_product_ids, 1) > 20 then
    raise exception 'Maximum 20 products allowed per section.';
  end if;

  if p_end_at <= p_start_at
     or p_end_at - p_start_at < interval '24 hours'
     or p_end_at - p_start_at > interval '30 days' then
    raise exception 'Duration must be between 24 hours and 30 days.';
  end if;

  select exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.role = 'admin'
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Only admin can update sponsored sections.';
  end if;

  delete from public.sponsored_products
  where section = p_section
    and seller_id = p_seller_id
    and is_active = true
    and end_at > now();

  foreach v_product_id in array p_product_ids
  loop
    insert into public.sponsored_products (
      section,
      seller_id,
      product_id,
      start_at,
      end_at,
      is_active,
      created_by
    ) values (
      p_section,
      p_seller_id,
      v_product_id,
      p_start_at,
      p_end_at,
      true,
      auth.uid()
    );
  end loop;
end;
$$;

grant execute on function public.admin_replace_sponsored_section(text, uuid, uuid[], timestamptz, timestamptz)
to authenticated;

commit;
