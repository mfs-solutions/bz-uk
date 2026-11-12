-- Guarantee: KYC approved  ==>  profile is_verified = true AND approved = true.
-- Approval IS verification. No separate manual step.
--
-- 1. A trigger on seller_kyc auto-syncs profiles whenever kyc_status becomes 'approved'
--    (and revokes verification if a previously-approved KYC is later rejected).
-- 2. A one-time backfill for any sellers already approved but not yet verified.

begin;

-- Teach the profiles guard trigger to allow the trusted KYC->profile sync.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
BEGIN
  -- Admins, or the trusted KYC sync (flagged via a session-local GUC), may change protected columns.
  IF public.is_admin() OR current_setting('app.bzead_kyc_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Non-admin: silently revert protected columns to their old values
  NEW.role        := OLD.role;
  NEW.is_verified := OLD.is_verified;
  NEW.approved    := OLD.approved;
  NEW.is_banned   := OLD.is_banned;   -- prevent self-unban

  RETURN NEW;
END;
$$;

create or replace function public.sync_profile_verification_from_kyc()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Flag this update as the trusted KYC sync so protect_profile_columns lets it through.
  perform set_config('app.bzead_kyc_sync', 'on', true);

  if new.kyc_status = 'approved' then
    update public.profiles
    set is_verified = true,
        approved = true
    where id = new.seller_id
      and (coalesce(is_verified, false) = false or coalesce(approved, false) = false);
  elsif new.kyc_status = 'rejected' then
    update public.profiles
    set is_verified = false,
        approved = false
    where id = new.seller_id
      and (coalesce(is_verified, false) = true or coalesce(approved, false) = true);
  end if;

  perform set_config('app.bzead_kyc_sync', 'off', true);

  return new;
end;
$$;

drop trigger if exists trg_sync_profile_verification_from_kyc on public.seller_kyc;
create trigger trg_sync_profile_verification_from_kyc
after insert or update of kyc_status on public.seller_kyc
for each row execute function public.sync_profile_verification_from_kyc();

-- One-time backfill: any approved-KYC seller who is not yet verified.
-- Bypass the protect_profile_columns guard trigger for this trusted maintenance update.
set local session_replication_role = replica;

update public.profiles pr
set is_verified = true,
    approved = true
from public.seller_kyc k
where k.seller_id = pr.id
  and pr.role = 'seller'
  and k.kyc_status = 'approved'
  and (coalesce(pr.is_verified, false) = false or coalesce(pr.approved, false) = false);

set local session_replication_role = origin;

commit;
