-- Repair auth email identity rows that can break password login with
-- "Database error querying schema" for manually inserted users.

begin;

-- Ensure provider_id is always present for email identities.
update auth.identities
set provider_id = user_id::text
where provider = 'email'
  and (provider_id is null or btrim(provider_id) = '');

-- Ensure identity_data has required fields for email provider.
update auth.identities i
set identity_data = coalesce(i.identity_data, '{}'::jsonb)
  || jsonb_build_object(
    'sub', i.user_id::text,
    'provider_id', coalesce(nullif(i.provider_id, ''), i.user_id::text),
    'email', coalesce((i.identity_data ->> 'email'), u.email)
  )
from auth.users u
where i.user_id = u.id
  and i.provider = 'email';

-- Backfill missing email identity rows for users created manually.
insert into auth.identities (
  user_id,
  identity_data,
  provider,
  provider_id,
  created_at,
  updated_at
)
select
  u.id,
  jsonb_build_object(
    'sub', u.id::text,
    'provider_id', u.id::text,
    'email', u.email
  ),
  'email',
  u.id::text,
  now(),
  now()
from auth.users u
where not exists (
  select 1
  from auth.identities i
  where i.user_id = u.id
    and i.provider = 'email'
);

commit;
