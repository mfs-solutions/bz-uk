-- User search history table
-- Stores every search event for analytics; UI deduplicates for display.
-- Guests use localStorage; logged-in users get server-side storage.

begin;

create table if not exists public.user_search_history (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  typed_input       text        not null,
  is_product_click  boolean     not null default false,
  product_id        text,
  product_name      text,
  category_id       text,
  category_name     text,
  sub_category_id   text,
  sub_category_name text,
  product_type_id   text,
  product_type_name text,
  user_location     text,
  user_country      text,
  searched_at       timestamptz not null default now()
);

-- Index for fast per-user history fetch ordered by recency
create index if not exists idx_user_search_history_user_searched
  on public.user_search_history(user_id, searched_at desc);

-- Row Level Security
alter table public.user_search_history enable row level security;

-- Users can read their own search history
create policy "Users can read own search history"
  on public.user_search_history
  for select
  using (auth.uid() = user_id);

-- Users can insert their own search history
create policy "Users can insert own search history"
  on public.user_search_history
  for insert
  with check (auth.uid() = user_id);

-- Users can delete their own search history
create policy "Users can delete own search history"
  on public.user_search_history
  for delete
  using (auth.uid() = user_id);

commit;
