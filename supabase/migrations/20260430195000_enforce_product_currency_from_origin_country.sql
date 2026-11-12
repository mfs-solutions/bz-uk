begin;

create or replace function public.sync_product_currency_from_origin_country()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_origin_currency text;
begin
  if new.origin_country_id is not null then
    select upper(trim(coalesce(c.currency_code, '')))
      into v_origin_currency
    from public.countries c
    where c.id = new.origin_country_id
    limit 1;

    if coalesce(v_origin_currency, '') <> '' then
      new.currency := v_origin_currency;
      if new.default_selling_country_id is null then
        new.default_selling_country_id := new.origin_country_id;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_products_sync_currency_from_origin_country on public.products;

create trigger trg_products_sync_currency_from_origin_country
before insert or update of origin_country_id, currency, default_selling_country_id
on public.products
for each row
execute function public.sync_product_currency_from_origin_country();

update public.products p
set
  currency = upper(trim(c.currency_code)),
  default_selling_country_id = coalesce(p.default_selling_country_id, p.origin_country_id),
  updated_at = now()
from public.countries c
where p.origin_country_id = c.id
  and c.currency_code is not null
  and trim(c.currency_code) <> ''
  and (
    upper(trim(coalesce(p.currency, ''))) <> upper(trim(c.currency_code))
    or p.default_selling_country_id is null
  );

commit;
