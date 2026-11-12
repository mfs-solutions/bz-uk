begin;

update public.products as p
set hsn_code = h.hsn_code
from public.categories as product_type
join public.category_hsn_codes as h
  on h.category_slug = product_type.slug
where p.product_type = product_type.id
  and product_type.level = 3
  and p.approval_status = 'pending'
  and (p.hsn_code is null or btrim(p.hsn_code) = '')
  and h.hsn_code is not null;

commit;