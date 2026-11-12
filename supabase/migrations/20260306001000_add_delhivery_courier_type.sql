begin;

insert into public.domestic_courier_type (name)
values ('Delhivery')
on conflict (name) do nothing;

commit;
