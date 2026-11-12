-- Add 'pending' to allowed order status values (fixes COD order placement failure)
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (
  status = ANY (ARRAY[
    'pending'::text,
    'new'::text,
    'accepted'::text,
    'processing'::text,
    'packed'::text,
    'shipped'::text,
    'in_transit'::text,
    'out_for_delivery'::text,
    'delivered'::text,
    'cancelled'::text,
    'return_requested'::text,
    'returned'::text,
    'refunded'::text
  ])
);
