begin;

-- Add order foreign keys after core tables exist; safe for environments where constraints already exist.
do $$
begin
  if to_regclass('public.orders') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'delhivery_operation_logs_order_id_fkey'
    ) then
      alter table public.delhivery_operation_logs
        add constraint delhivery_operation_logs_order_id_fkey
        foreign key (order_id) references public.orders(id) on delete set null;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'delhivery_shipments_order_id_fkey'
    ) then
      alter table public.delhivery_shipments
        add constraint delhivery_shipments_order_id_fkey
        foreign key (order_id) references public.orders(id) on delete set null;
    end if;
  end if;
end
$$;

commit;
