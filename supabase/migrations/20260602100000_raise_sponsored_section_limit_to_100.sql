-- Raise the sponsored-section product cap from 20 to 100 for all three
-- homepage sections (featured, trending, hot-deals).
-- Updates the three DB objects that enforce the limit:
--   1. enforce_sponsored_section_limit()  (BEFORE INSERT/UPDATE trigger fn)
--   2. admin_add_sponsored_products()      (RPC used by the Add Products flow)
--   3. admin_replace_sponsored_section()   (RPC used by the Replace flow)

begin;

-- 1. Trigger function: overlap cap 20 -> 100
create or replace function public.enforce_sponsored_section_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  overlap_count integer;
begin
  select count(*) into overlap_count
  from public.sponsored_products sp
  where sp.section = new.section
    and sp.is_active = true
    and sp.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    and tstzrange(sp.start_at, sp.end_at, '[)') && tstzrange(new.start_at, new.end_at, '[)');

  if overlap_count >= 100 then
    raise exception 'A section can have at most 100 sponsored products in overlapping duration windows.';
  end if;

  return new;
end;
$$;

-- 2. admin_add_sponsored_products: cap 20 -> 100
create or replace function public.admin_add_sponsored_products(
  p_section text,
  p_seller_id uuid,
  p_product_ids uuid[],
  p_start_at timestamptz,
  p_end_at timestamptz
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
  v_product_id uuid;
  v_current_count int;
begin
  if p_section not in ('featured', 'trending', 'hot-deals') then
    raise exception 'Invalid section.';
  end if;
  if p_product_ids is null or coalesce(array_length(p_product_ids, 1), 0) = 0 then
    raise exception 'At least one product is required.';
  end if;
  if p_end_at <= p_start_at then
    raise exception 'End date must be after start date.';
  end if;
  select exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.role = 'admin'
  ) into v_is_admin;
  if not v_is_admin then
    raise exception 'Only admin can modify sponsored sections.';
  end if;
  select count(*) into v_current_count
  from public.sponsored_products
  where section = p_section and is_active = true and end_at > now();
  if v_current_count + array_length(p_product_ids, 1) > 100 then
    raise exception 'Section would exceed 100 products limit. Currently % products.', v_current_count;
  end if;
  foreach v_product_id in array p_product_ids
  loop
    if not exists (
      select 1 from public.sponsored_products
      where section = p_section and product_id = v_product_id and is_active = true and end_at > now()
    ) then
      insert into public.sponsored_products (
        section, seller_id, product_id, start_at, end_at, is_active, created_by
      ) values (
        p_section, p_seller_id, v_product_id, p_start_at, p_end_at, true, auth.uid()
      );
    end if;
  end loop;
end;
$$;

-- 3. admin_replace_sponsored_section: cap 20 -> 100
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
set search_path = public
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

  if array_length(p_product_ids, 1) > 100 then
    raise exception 'Maximum 100 products allowed per section.';
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
