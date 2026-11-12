begin;

update public.platform_commission_rules
set
  charge_percent = 0,
  updated_at = now()
where is_active = true
  and coalesce(charge_percent, 0) <> 0;

commit;
