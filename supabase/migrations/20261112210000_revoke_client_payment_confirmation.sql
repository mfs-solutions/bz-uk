-- Payment success is finalized by trusted payment-provider webhooks, not client RPC calls.
revoke all on function public.confirm_order_payment(uuid, text) from public, anon, authenticated;
