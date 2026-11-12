-- Fix order status constraint mismatch.
-- The old constraint only allowed legacy statuses (processing, shipped)
-- but the frontend uses Delhivery-aligned lifecycle (accepted, packed, in_transit, out_for_delivery).

begin;

-- 1. Drop the old constraint that blocks modern statuses
alter table public.orders drop constraint if exists orders_status_check;

-- 2. Normalize legacy 'pending' rows → 'new' (the canonical initial status)
update public.orders set status = 'new' where status = 'pending';

-- 3. Change column default from 'pending' to 'new'
alter table public.orders alter column status set default 'new';

-- 4. Add the definitive constraint covering the full order lifecycle
alter table public.orders add constraint orders_status_check check (
  status in (
    'new',
    'accepted',
    'processing',
    'packed',
    'shipped',
    'in_transit',
    'out_for_delivery',
    'delivered',
    'cancelled',
    'return_requested',
    'returned',
    'refunded'
  )
);

commit;
