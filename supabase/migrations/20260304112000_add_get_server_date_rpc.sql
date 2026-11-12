create or replace function public.get_server_date()
returns date
language sql
stable
as $$
  select current_date;
$$;
