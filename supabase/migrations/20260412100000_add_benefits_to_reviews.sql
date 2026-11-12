-- Add benefits column to reviews table for storing selected benefit tags
alter table public.reviews
  add column if not exists benefits text[] default '{}';
