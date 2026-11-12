begin;

create table if not exists public.delhivery_document_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid references public.delhivery_shipments(id) on delete set null,
  seller_id uuid references public.profiles(id) on delete set null,
  event_type text not null default 'document_push',
  document_type text not null,
  document_url text,
  awb_number text,
  signature text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_delhivery_document_events_awb_created
  on public.delhivery_document_events (awb_number, created_at desc);

create index if not exists idx_delhivery_document_events_seller_created
  on public.delhivery_document_events (seller_id, created_at desc);

alter table public.delhivery_document_events enable row level security;

grant select on table public.delhivery_document_events to authenticated;

drop policy if exists delhivery_document_events_select_own on public.delhivery_document_events;
create policy delhivery_document_events_select_own
  on public.delhivery_document_events for select to authenticated
  using (seller_id = auth.uid());

drop policy if exists delhivery_document_events_admin_all on public.delhivery_document_events;
create policy delhivery_document_events_admin_all
  on public.delhivery_document_events for all to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

commit;
