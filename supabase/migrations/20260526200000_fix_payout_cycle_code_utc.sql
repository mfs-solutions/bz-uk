-- Make payout_cycle_code timezone-deterministic. The frontend will send UTC
-- midnight ISO strings (e.g. 2026-05-01T00:00:00Z) so the cycle boundary is
-- the same value on both client and server. Reading via `at time zone 'UTC'`
-- guarantees we always inspect the same calendar day regardless of the
-- Postgres session TimeZone setting.

create or replace function public.payout_cycle_code(p_period_start timestamptz)
returns text
language sql
immutable
as $$
  with d as (select (p_period_start at time zone 'UTC') as ts)
  select upper(to_char((select ts from d), 'Mon'))
      || case when extract(day from (select ts from d)) = 1 then '01' else '02' end
      || to_char((select ts from d), 'YYYY');
$$;

comment on function public.payout_cycle_code(timestamptz) is
  'Returns cycle code like MAY012026. Always evaluated in UTC so it matches what the admin UI computes.';
