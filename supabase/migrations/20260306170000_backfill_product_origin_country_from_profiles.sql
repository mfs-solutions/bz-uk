begin;

-- Backfill missing product origin country fields from seller profile country.
update public.products p
set
  origin_country_id = coalesce(p.origin_country_id, pr.country_id),
  origin_country = coalesce(
    nullif(btrim(p.origin_country), ''),
    c.country_name,
    c.country_code,
    ''
  )
from public.profiles pr
left join public.countries c on c.id = pr.country_id
where p.seller_id = pr.id
  and (
    p.origin_country_id is null
    or coalesce(btrim(p.origin_country), '') = ''
  )
  and pr.country_id is not null;

commit;
