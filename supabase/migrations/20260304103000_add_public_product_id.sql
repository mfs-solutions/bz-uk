-- Public product ID format:
-- BZD + MMYY + 5-digit sequence
-- Example: BZD032610001

create sequence if not exists public.product_public_id_seq
  start with 10001
  increment by 1
  minvalue 10001;

alter table public.products
  add column if not exists public_product_id varchar(12);

create or replace function public.generate_public_product_id(p_ref_date date default current_date)
returns varchar
language plpgsql
as $$
declare
  v_seq text;
begin
  v_seq := lpad(nextval('public.product_public_id_seq')::text, 5, '0');
  return 'BZD' || to_char(coalesce(p_ref_date, current_date), 'MMYY') || v_seq;
end;
$$;

create or replace function public.set_public_product_id()
returns trigger
language plpgsql
as $$
begin
  if new.public_product_id is null or btrim(new.public_product_id) = '' then
    -- Generate on insert, and also for any legacy row that becomes approved later.
    new.public_product_id := public.generate_public_product_id(current_date);
  end if;

  new.public_product_id := upper(regexp_replace(new.public_product_id, '[^A-Z0-9]', '', 'g'));
  return new;
end;
$$;

drop trigger if exists trg_set_public_product_id on public.products;
create trigger trg_set_public_product_id
before insert or update of approval_status
on public.products
for each row
execute function public.set_public_product_id();

update public.products
set public_product_id = public.generate_public_product_id(coalesce(created_at::date, current_date))
where public_product_id is null or btrim(public_product_id) = '';

create unique index if not exists products_public_product_id_key
  on public.products(public_product_id)
  where public_product_id is not null;
