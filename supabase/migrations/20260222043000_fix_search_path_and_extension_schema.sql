-- Security advisor hardening
-- 1) Set stable search_path for functions
-- 2) Move btree_gist extension out of public schema

create schema if not exists extensions;

do $$
begin
  begin
    alter extension btree_gist set schema extensions;
  exception
    when undefined_object then
      null;
  end;
end $$;

do $$
declare
  fn_name text;
  fn regprocedure;
begin
  foreach fn_name in array array[
    'enforce_sponsored_section_limit',
    'set_updated_at',
    'validate_sponsored_products_row',
    'admin_replace_sponsored_section',
    'set_sponsored_products_updated_at'
  ]
  loop
    for fn in
      select p.oid::regprocedure
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = fn_name
    loop
      execute format('alter function %s set search_path = public', fn);
    end loop;
  end loop;
end $$;
