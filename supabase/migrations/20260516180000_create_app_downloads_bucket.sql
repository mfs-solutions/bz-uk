-- Public Supabase Storage bucket for distributing the signed Android
-- buyer APK (and AAB) to bzead.com visitors. The CI workflow
-- `.github/workflows/android-aab-build.yml` uploads `bzead.apk` and
-- `bzead.aab` into this bucket on every build, and the website footer
-- links to the public object URL:
--
--   https://<project-ref>.supabase.co/storage/v1/object/public/app-downloads/bzead.apk
--
-- The bucket is PUBLIC because the APK is meant to be downloaded by any
-- end user without authentication. No PII or secrets are stored here.

insert into storage.buckets (id, name, public)
values ('app-downloads', 'app-downloads', true)
on conflict (id) do update set public = true;

-- Allow anonymous + authenticated reads on objects in this bucket. The
-- bucket being marked public already exposes objects via the
-- /storage/v1/object/public/... route, but we add an explicit SELECT
-- policy for completeness and so the same URL works through any
-- future signed proxy.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Public read app-downloads'
  ) then
    create policy "Public read app-downloads"
      on storage.objects
      for select
      to public
      using (bucket_id = 'app-downloads');
  end if;
end $$;

-- Only the service role (used by the CI workflow) is allowed to write
-- to this bucket. We do NOT create insert/update/delete policies for
-- anon/authenticated, so end users cannot replace the published APK.
