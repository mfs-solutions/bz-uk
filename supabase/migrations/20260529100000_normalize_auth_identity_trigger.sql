-- Permanent guard: every row written to auth.identities for provider 'email'
-- gets normalised so identity_data always contains the keys GoTrue requires.
-- This prevents the "Database error querying schema" sign-in failure that
-- occurs when an identity row exists but is missing 'sub' / 'provider_id' /
-- 'email' inside identity_data, or has an empty provider_id column.
--
-- Companion repair (idempotent) for any rows already broken at migration time.

begin;

-- 1. Backfill any users missing an email identity row.
insert into auth.identities (user_id, identity_data, provider, provider_id, created_at, updated_at)
select u.id,
       jsonb_build_object('sub', u.id::text, 'provider_id', u.id::text, 'email', u.email),
       'email', u.id::text, now(), now()
from auth.users u
where u.deleted_at is null
  and not exists (
    select 1 from auth.identities i
    where i.user_id = u.id and i.provider = 'email'
  );

-- 2. Repair malformed identity_data on existing email identities.
update auth.identities i
set provider_id = coalesce(nullif(btrim(i.provider_id), ''), i.user_id::text),
    identity_data = coalesce(i.identity_data, '{}'::jsonb)
      || jsonb_build_object(
        'sub', i.user_id::text,
        'provider_id', coalesce(nullif(btrim(i.provider_id), ''), i.user_id::text),
        'email', coalesce(i.identity_data->>'email', u.email)
      ),
    updated_at = now()
from auth.users u
where i.user_id = u.id
  and i.provider = 'email'
  and u.deleted_at is null
  and (
    not (i.identity_data ? 'sub')
    or not (i.identity_data ? 'email')
    or not (i.identity_data ? 'provider_id')
    or i.provider_id is null
    or btrim(i.provider_id) = ''
  );

-- 3. Trigger function: normalise on every future insert/update.
create or replace function public.normalize_auth_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if new.provider = 'email' then
    if new.provider_id is null or btrim(new.provider_id) = '' then
      new.provider_id := new.user_id::text;
    end if;
    select email into v_email from auth.users where id = new.user_id;
    new.identity_data := coalesce(new.identity_data, '{}'::jsonb)
      || jsonb_build_object(
        'sub', new.user_id::text,
        'provider_id', new.provider_id,
        'email', coalesce(new.identity_data->>'email', v_email)
      );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalize_auth_identity on auth.identities;
create trigger trg_normalize_auth_identity
before insert or update on auth.identities
for each row execute function public.normalize_auth_identity();

commit;
