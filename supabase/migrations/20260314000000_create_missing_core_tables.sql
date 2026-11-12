-- Create 19 tables used by the frontend that were never defined in migrations.
-- All statements use IF NOT EXISTS so the migration is safe to run when the
-- tables already exist in the live database.

begin;

-- ================================================================
-- 1. orders
-- ================================================================
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid references public.profiles(id) on delete set null,
  order_number text,
  status text not null default 'pending',
  payment_status text default 'pending',
  total_amount numeric(12,2) not null default 0,
  currency text not null default 'INR',
  shipping_address jsonb,
  billing_address jsonb,
  phone text,
  notes text,
  payment_intent_id text,
  payment_method text,
  tracking_number text,
  country text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders enable row level security;

create policy "Users read own orders"
  on public.orders for select
  using (auth.uid() = user_id);

create policy "Users insert own orders"
  on public.orders for insert
  with check (auth.uid() = user_id);

create policy "Sellers read orders with their seller_id"
  on public.orders for select
  using (auth.uid() = seller_id);

create policy "Admins full access on orders"
  on public.orders for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ================================================================
-- 2. order_items
-- ================================================================
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text,
  product_image text default '',
  quantity integer not null default 1,
  price numeric(12,2) not null default 0,
  seller_id uuid references public.profiles(id) on delete set null,
  variant_info jsonb,
  category text,
  created_at timestamptz not null default now()
);

alter table public.order_items enable row level security;

create policy "Users read own order_items"
  on public.order_items for select
  using (
    exists (select 1 from public.orders where orders.id = order_items.order_id and orders.user_id = auth.uid())
  );

create policy "Users insert own order_items"
  on public.order_items for insert
  with check (
    exists (select 1 from public.orders where orders.id = order_items.order_id and orders.user_id = auth.uid())
  );

create policy "Sellers read their order_items"
  on public.order_items for select
  using (auth.uid() = seller_id);

create policy "Admins full access on order_items"
  on public.order_items for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ================================================================
-- 3. user_addresses
-- ================================================================
create table if not exists public.user_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  full_name text,
  phone_number text,
  email text,
  country text,
  street_address_1 text,
  street_address_2 text,
  city text,
  state text,
  postal_code text,
  address_type text default 'home',
  delivery_notes text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_addresses enable row level security;

create policy "Users manage own addresses"
  on public.user_addresses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Admins read all addresses"
  on public.user_addresses for select
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ================================================================
-- 4. wishlists
-- ================================================================
create table if not exists public.wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

alter table public.wishlists enable row level security;

create policy "Users manage own wishlist"
  on public.wishlists for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ================================================================
-- 5. reviews
-- ================================================================
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating >= 1 and rating <= 5),
  heading text,
  comment text,
  images text[] default '{}',
  is_verified boolean not null default false,
  is_flagged boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.reviews enable row level security;

create policy "Anyone can read reviews"
  on public.reviews for select
  using (true);

create policy "Users create own reviews"
  on public.reviews for insert
  with check (auth.uid() = user_id);

create policy "Users update own reviews"
  on public.reviews for update
  using (auth.uid() = user_id);

create policy "Admins full access on reviews"
  on public.reviews for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ================================================================
-- 6. promotions
-- ================================================================
create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  discount_type text not null default 'percentage',
  discount_value numeric(12,2) not null default 0,
  applicable_to text not null default 'common',
  applicable_ids uuid[] default '{}',
  start_date timestamptz,
  end_date timestamptz,
  is_active boolean not null default true,
  max_uses integer,
  current_uses integer not null default 0,
  created_at timestamptz not null default now()
);

-- RLS for promotions is already in 20260225100000_add_seller_promotions_rls.sql

-- ================================================================
-- 7. banners
-- ================================================================
create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  image_url text not null,
  link text,
  is_active boolean not null default true,
  position integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.banners enable row level security;

create policy "Anyone can read active banners"
  on public.banners for select
  using (true);

create policy "Admins manage banners"
  on public.banners for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ================================================================
-- 8. complaints
-- ================================================================
create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null,
  description text not null,
  status text not null default 'open',
  resolution text,
  resolved_at timestamptz,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.complaints enable row level security;

create policy "Users read own complaints"
  on public.complaints for select
  using (auth.uid() = user_id);

create policy "Users create complaints"
  on public.complaints for insert
  with check (auth.uid() = user_id);

create policy "Admins full access on complaints"
  on public.complaints for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ================================================================
-- 9. payment_intents
-- ================================================================
create table if not exists public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  stripe_payment_intent_id text not null,
  status text,
  amount numeric(12,2) not null,
  currency text default 'inr',
  created_at timestamptz not null default now()
);

alter table public.payment_intents enable row level security;

create policy "Users read own payment_intents"
  on public.payment_intents for select
  using (
    exists (select 1 from public.orders where orders.id = payment_intents.order_id and orders.user_id = auth.uid())
  );

create policy "Admins full access on payment_intents"
  on public.payment_intents for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ================================================================
-- 10. payment_refunds
-- ================================================================
create table if not exists public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  amount numeric(12,2) not null,
  reason text,
  status text not null default 'processed',
  created_at timestamptz not null default now()
);

alter table public.payment_refunds enable row level security;

create policy "Users read own refunds"
  on public.payment_refunds for select
  using (
    exists (select 1 from public.orders where orders.id = payment_refunds.order_id and orders.user_id = auth.uid())
  );

create policy "Admins full access on payment_refunds"
  on public.payment_refunds for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ================================================================
-- 11. membership_plans
-- ================================================================
create table if not exists public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(12,2) not null,
  currency text not null default 'INR',
  duration_days integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.membership_plans enable row level security;

create policy "Anyone can read membership_plans"
  on public.membership_plans for select
  using (true);

create policy "Admins manage membership_plans"
  on public.membership_plans for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ================================================================
-- 12. seller_kyc_documents
-- ================================================================
create table if not exists public.seller_kyc_documents (
  id uuid primary key default gen_random_uuid(),
  country text not null,
  registration_type text not null,
  required_documents text not null,
  description text,
  created_at timestamptz not null default now()
);

alter table public.seller_kyc_documents enable row level security;

create policy "Anyone can read kyc_documents config"
  on public.seller_kyc_documents for select
  using (true);

create policy "Admins manage kyc_documents config"
  on public.seller_kyc_documents for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ================================================================
-- 13. product_colors
-- ================================================================
create table if not exists public.product_colors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  hex text,
  created_at timestamptz not null default now()
);

alter table public.product_colors enable row level security;

create policy "Anyone can read product_colors"
  on public.product_colors for select
  using (true);

create policy "Admins manage product_colors"
  on public.product_colors for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ================================================================
-- 14. account_heads
-- ================================================================
create table if not exists public.account_heads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.account_heads enable row level security;

create policy "Admins manage account_heads"
  on public.account_heads for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ================================================================
-- 15. audit_logs
-- ================================================================
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_name text,
  action text,
  resource text,
  resource_id text,
  details jsonb,
  ip_address text,
  status text not null default 'success',
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

create policy "Admins read audit_logs"
  on public.audit_logs for select
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ================================================================
-- 16. bank_book_entries
-- ================================================================
create table if not exists public.bank_book_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  description text,
  debit numeric(12,2) not null default 0,
  credit numeric(12,2) not null default 0,
  balance numeric(12,2) not null default 0,
  bank_reference text,
  created_at timestamptz not null default now()
);

alter table public.bank_book_entries enable row level security;

create policy "Admins manage bank_book_entries"
  on public.bank_book_entries for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ================================================================
-- 17. daybook_entries
-- ================================================================
create table if not exists public.daybook_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  description text,
  debit numeric(12,2) not null default 0,
  credit numeric(12,2) not null default 0,
  balance numeric(12,2) not null default 0,
  reference text,
  created_at timestamptz not null default now()
);

alter table public.daybook_entries enable row level security;

create policy "Admins manage daybook_entries"
  on public.daybook_entries for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ================================================================
-- 18. expense_entries
-- ================================================================
create table if not exists public.expense_entries (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  amount numeric(12,2) not null,
  category text,
  description text,
  vendor text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.expense_entries enable row level security;

create policy "Admins manage expense_entries"
  on public.expense_entries for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ================================================================
-- 19. platform_costs
-- ================================================================
create table if not exists public.platform_costs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric(12,2) not null,
  currency text not null default 'INR',
  billing_cycle text not null default 'monthly',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.platform_costs enable row level security;

create policy "Admins manage platform_costs"
  on public.platform_costs for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ================================================================
-- Add RLS to bootstrap tables that were missing it
-- ================================================================

-- profiles
alter table public.profiles enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'profiles' and policyname = 'Users read own profile') then
    create policy "Users read own profile"
      on public.profiles for select
      using (auth.uid() = id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'profiles' and policyname = 'Users update own profile') then
    create policy "Users update own profile"
      on public.profiles for update
      using (auth.uid() = id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'profiles' and policyname = 'Public profiles readable') then
    create policy "Public profiles readable"
      on public.profiles for select
      using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'profiles' and policyname = 'Admins full access on profiles') then
    create policy "Admins full access on profiles"
      on public.profiles for all
      using (
        exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
      );
  end if;
end $$;

-- products
alter table public.products enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'products' and policyname = 'Anyone can read active products') then
    create policy "Anyone can read active products"
      on public.products for select
      using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'products' and policyname = 'Sellers manage own products') then
    create policy "Sellers manage own products"
      on public.products for all
      using (auth.uid() = seller_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'products' and policyname = 'Admins full access on products') then
    create policy "Admins full access on products"
      on public.products for all
      using (
        exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
      );
  end if;
end $$;

-- product_variants
alter table public.product_variants enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'product_variants' and policyname = 'Anyone can read product_variants') then
    create policy "Anyone can read product_variants"
      on public.product_variants for select
      using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'product_variants' and policyname = 'Sellers manage own product_variants') then
    create policy "Sellers manage own product_variants"
      on public.product_variants for all
      using (
        exists (select 1 from public.products where products.id = product_variants.product_id and products.seller_id = auth.uid())
      );
  end if;
end $$;

-- categories (public read)
alter table public.categories enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'categories' and policyname = 'Anyone can read categories') then
    create policy "Anyone can read categories"
      on public.categories for select
      using (true);
  end if;
end $$;

-- countries (public read)
alter table public.countries enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'countries' and policyname = 'Anyone can read countries') then
    create policy "Anyone can read countries"
      on public.countries for select
      using (true);
  end if;
end $$;

-- business_types (public read)
alter table public.business_types enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'business_types' and policyname = 'Anyone can read business_types') then
    create policy "Anyone can read business_types"
      on public.business_types for select
      using (true);
  end if;
end $$;

-- delivery_countries (public read)
alter table public.delivery_countries enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'delivery_countries' and policyname = 'Anyone can read delivery_countries') then
    create policy "Anyone can read delivery_countries"
      on public.delivery_countries for select
      using (true);
  end if;
end $$;

-- offer_rules
alter table public.offer_rules enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'offer_rules' and policyname = 'Anyone can read offer_rules') then
    create policy "Anyone can read offer_rules"
      on public.offer_rules for select
      using (true);
  end if;
end $$;

-- tax_rules
do $$
begin
  if to_regclass('public.tax_rules') is not null then
    alter table public.tax_rules enable row level security;

    if not exists (select 1 from pg_policies where tablename = 'tax_rules' and policyname = 'Anyone can read tax_rules') then
      create policy "Anyone can read tax_rules"
        on public.tax_rules for select
        using (true);
    end if;
  end if;
end
$$;

-- platform_commission_rules (public read for checkout pricing)
alter table public.platform_commission_rules enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'platform_commission_rules' and policyname = 'Anyone can read commission_rules') then
    create policy "Anyone can read commission_rules"
      on public.platform_commission_rules for select
      using (true);
  end if;
end $$;

-- enum-like tables (courier types) — public read
alter table public.domestic_courier_type enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'domestic_courier_type' and policyname = 'Anyone can read domestic_courier_type') then
    create policy "Anyone can read domestic_courier_type"
      on public.domestic_courier_type for select
      using (true);
  end if;
end $$;

alter table public.domestic_shippingcharge_type enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'domestic_shippingcharge_type' and policyname = 'Anyone can read domestic_shippingcharge_type') then
    create policy "Anyone can read domestic_shippingcharge_type"
      on public.domestic_shippingcharge_type for select
      using (true);
  end if;
end $$;

alter table public.international_courier_type enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'international_courier_type' and policyname = 'Anyone can read international_courier_type') then
    create policy "Anyone can read international_courier_type"
      on public.international_courier_type for select
      using (true);
  end if;
end $$;

commit;
