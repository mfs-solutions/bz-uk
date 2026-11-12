export interface User {
  id: string;
  userId?: string;
  email: string;
  role: 'user' | 'seller' | 'admin';
  first_name?: string;
  last_name?: string;
  full_name?: string;
  created_at: string;
  approved?: boolean;
  phone?: string;
  address?: string;
  avatar_url?: string;
  is_verified?: boolean;
  total_purchases?: number;
  cancellations?: number;
  is_banned?: boolean;
  signup_date?: string;
  updated_at?: string;
  country?: string;
}

export interface Admin {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  created_at: string;
  last_login?: string;
  permissions: string[];
  is_active: boolean;
  status?: 'active' | 'inactive';
}

export interface Seller {
  id: string;
  user_id: string;
  shop_name: string;
  email: string;
  phone: string;
  total_listings: number;
  badge?: 'silver' | 'gold' | 'platinum';
  kyc_status: 'pending' | 'approved' | 'rejected' | 'verified' | 'action_required' | 'restricted';
  product_approval_status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  seller_type?: 'individual' | 'brand' | 'freelancing';
  is_active: boolean;
  total_revenue?: number;
  total_orders?: number;
  rating?: number;
  country?: string;
  
  // Stripe Connect fields
  stripe_account_id?: string;
  stripe_onboarding_completed?: boolean;
  payouts_enabled?: boolean;
  charges_enabled?: boolean;
  kyc_last_update?: string;
  stripe_account_type?: 'express' | 'standard' | 'custom';
}

export interface Product {
  id: string;
  productId?: string; // alias — frontend convenience, DB uses `id`
  name: string;
  slug?: string;
  description: string;
  short_description?: string;
  price: number;
  default_selling_price?: number;
  default_selling_country_id?: string;
  origin_country_id?: string;
  mrp?: number;
  discount_price?: number;
  currency: string;
  image_url: string;
  images?: string[];
  videos?: string[];
  seller_id: string;
  category: string;
  sub_category?: string;
  brand?: string;
  model_number?: string;
  sku?: string;
  stock: number;
  highlights?: string[];
  specifications?: Record<string, string>;
  seller_notes?: string[];
  platform_fee?: number;
  commission?: number;
  package_weight?: number;
  package_weight_unit_id?: string;
  package_length?: number;
  package_length_unit_id?: string;
  package_width?: number;
  package_width_unit_id?: string;
  package_height?: number;
  package_height_unit_id?: string;
  packing_type_id?: string;
  hsn_code?: string;
  is_cod_available?: boolean;
  shipping_type?: string;
  manufacturer_name?: string;
  manufacturer_address?: string;
  packing_details?: string;
  courier_partner?: string;
  preferred_carrier?: 'shiprocket';
  cancellation_policy_days?: number;
  return_policy_days?: number;
  approval_status?: 'draft' | 'pending' | 'approved' | 'rejected';
  item_condition?: 'brand_new' | 'used_open_box' | 'used_like_new' | 'used_very_good' | 'used_good' | 'used_acceptable' | 'refurbished';
  is_active?: boolean;
  is_featured?: boolean;
  tags?: string[];
  rating?: number;
  review_count?: number;
  created_at: string;
  updated_at?: string;
  // Frontend-only convenience fields (not in DB)
  category_name?: string;
  category_slug?: string;
  sub_category_name?: string;
  sub_category_slug?: string;
  discount?: number;
  isNew?: boolean;
  // Populated at query time — true if the product has any product_variants rows
  has_variants?: boolean;
}

export type ItemCondition = 'brand_new' | 'used_open_box' | 'used_like_new' | 'used_very_good' | 'used_good' | 'used_acceptable' | 'refurbished';

export interface ProductConditionDetails {
  id?: string;
  product_id?: string;
  usage_duration: 'less_than_1_month' | '1_6_months' | '6_12_months' | '1_2_years' | '2_plus_years';
  working_condition: 'works_perfectly' | 'minor_issues' | 'needs_repair';
  working_condition_notes: string;
  original_packaging: boolean;
  original_invoice: boolean;
  accessories_included: string;
  ownership_type: 'first_owner' | 'second_owner' | 'multiple_owners';
  has_scratches: boolean;
  scratch_description: string;
  scratch_images: string[];
  refurbished_by?: 'brand_authorized' | 'local_technician' | 'self_refurbished' | null;
  repair_details?: string;
}

export interface ProductReturnPolicy {
  id?: string;
  product_id?: string;
  accepts_returns: boolean;
  return_window?: '24_hours' | '48_hours' | '3_days' | '5_days' | null;
  accepted_return_reasons: string[];
  return_shipping_by?: 'seller' | 'buyer' | null;
  refund_type?: 'full_refund' | 'partial_refund' | 'replacement' | null;
  proof_requirement?: 'unboxing_video' | 'photos' | 'none' | null;
  return_condition_agreed: boolean;
  seller_responsibility_agreed: boolean;
}

export interface CartItem {
  id: string;
  user_id: string;
  product_id: string;
  quantity: number;
  product?: Product;
}

export interface Order {
  id: string;
  user_id: string;
  total: number;
  currency: string;
  status: 'new' | 'accepted' | 'processing' | 'packed' | 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'return_requested' | 'returned' | 'refunded';
  created_at: string;
  items?: OrderItem[];
  seller_id?: string;
  address?: string;
  phone?: string;
  updated_at?: string;
  payment_status?: 'pending' | 'completed' | 'failed';
  tracking_number?: string;
  product_subtotal?: number;
  platform_fee?: number;
  seller_earning?: number;
  settlement_cycle?: string;
  settlement_status?: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name?: string;
  product_image?: string;
  quantity: number;
  price: number;
  seller_id?: string;
  seller_earning?: number;
  variant_info?: {
    size?: string | null;
    color?: string | null;
    sku?: string | null;
    hsn_code?: string | null;
    expected_delivery_days?: number | null;
  };
  category?: string;
  product?: Product;
}

export interface UserAddress {
  id: string;
  user_id: string;
  full_name: string;
  phone_number: string;
  email: string;
  country: string;
  street_address_1: string;
  street_address_2?: string;
  city: string;
  state: string;
  postal_code: string;
  address_type: 'home' | 'work' | 'other';
  delivery_notes?: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  image_url?: string;
  is_active: boolean;
  created_at: string;
  sub_categories?: SubCategory[];
}

export interface SubCategory {
  id: string;
  category_id: string;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
}

export interface Banner {
  id: string;
  title: string;
  image_url: string;
  link?: string;
  is_active: boolean;
  position: number;
  banner_type: 'hero' | 'ad' | 'video';
  video_url?: string;
  ad_slot?: number | null;
  created_at: string;
  updated_at?: string;
}

export interface Promotion {
  id: string;
  title: string;
  description?: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  applicable_to: 'user' | 'seller' | 'common';
  applicable_ids?: string[];
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
  max_uses?: number;
  current_uses?: number;
}

export interface Review {
  id: string;
  product_id: string;
  user_id: string;
  rating: number;
  comment: string;
  created_at: string;
  is_verified?: boolean;
  is_flagged?: boolean;
}

export interface Complaint {
  id: string;
  user_id: string;
  subject: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  created_at: string;
  updated_at?: string;
  assigned_to?: string;
  resolution?: string;
}

export interface Withdrawal {
  id: string;
  seller_id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'approved' | 'completed' | 'failed';
  created_at: string;
  processed_at?: string;
}

export interface BusinessMetrics {
  total_sales: number;
  total_expenses: number;
  total_products: number;
  total_users: number;
  total_sellers: number;
  total_bookings: number;
  ongoing_orders: number;
  returns_cancellations: number;
}

export interface DashboardData {
  metrics: BusinessMetrics;
  top_categories: Category[];
  top_sellers: Seller[];
  user_registrations: number;
  prime_members: number;
  seller_registrations: number;
}

export interface AccountSummary {
  total_revenue: number;
  total_expenses: number;
  net_profit: number;
  total_payouts: number;
  total_taxes: number;
  currency?: string;
  // Extended fields from admin service
  totalRevenue?: number;
  platformFees?: number;
  shippingMarkup?: number;
  sellerEarnings?: number;
  totalPayouts?: number;
  orderCount?: number;
  refunds?: number;
  walletBalance?: number;
}

export interface DaybookEntry {
  id: string;
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  reference?: string;
}

export interface BankBookEntry {
  id: string;
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  bank_reference?: string;
}

export interface PlatformTransaction {
  id: string;
  txn_date: string;
  txn_type: 'sale' | 'refund' | 'payout' | 'shipping' | 'commission' | 'expense' | 'adjustment';
  description: string;
  order_id?: string;
  seller_id?: string;
  seller_name?: string;
  gross_amount: number;
  commission_amount: number;
  net_amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed';
  reference?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface DailyProfitBreakup {
  date: string;
  gmv: number;
  seller_cost: number;
  shipping_cost: number;
  shipping_markup: number;
  platform_fee: number;
  refunds: number;
  expenses: number;
  order_count: number;
  commission_earned: number;
}

export interface PayoutSummary {
  pending_amount: number;
  pending_count: number;
  completed_today: number;
  completed_today_count: number;
  on_hold_amount: number;
  on_hold_count: number;
  week_total: number;
  week_count: number;
}

export interface SellerPayoutDetail {
  id: string;
  seller_id: string;
  seller_name?: string;
  store_name?: string;
  location?: string;
  amount: number;
  currency: string;
  gross_sales: number;
  commission_deducted: number;
  shipping_deducted: number;
  refund_adjusted: number;
  tds_deducted: number;
  net_payout: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  cycle_name?: string;
  created_at: string;
  processed_at?: string;
}

export interface SettlementRecord {
  id: string;
  gateway: string;
  period: string;
  gross_amount: number;
  fees: number;
  net_settled: number;
  status: 'settled' | 'in_transit' | 'pending';
  created_at: string;
}

export interface AccountHead {
  id: string;
  name: string;
  type: 'asset' | 'liability' | 'income' | 'expense';
  is_active: boolean;
  created_at: string;
}

export interface ExpenseEntry {
  id: string;
  date: string;
  amount: number;
  category: string;
  description?: string;
  vendor?: string;
  status?: 'pending' | 'approved' | 'paid';
  receipt_url?: string;
}

export interface SellerPayout {
  id: string;
  seller_id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  gross_sales?: number;
  commission_deducted?: number;
  shipping_deducted?: number;
  refund_adjusted?: number;
  tds_deducted?: number;
  net_payout?: number;
  cycle_name?: string;
  scheduled_at?: string;
  processed_at?: string;
  created_at?: string;
}

export interface ManualPayout {
  id: string;
  seller_id: string;
  cycle: string;
  payout_date: string;
  amount: number;
  mode_of_pay: 'account_transfer' | 'gpay' | 'dr_payment';
  transaction_no: string;
  status: 'pending' | 'paid';
  total_orders: number;
  total_product_amount: number;
  platform_cut: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentMode {
  code: string;
  label: string;
}

export interface MembershipPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  duration_days: number;
  is_active: boolean;
}

export interface TaxRule {
  id: string;
  name: string;
  percentage: number;
  country?: string;
  is_active: boolean;
}

export interface PlatformCost {
  id: string;
  name: string;
  amount: number;
  currency: string;
  billing_cycle: 'monthly' | 'quarterly' | 'yearly' | 'one_time';
  is_active: boolean;
}

export interface PlatformCommissionRule {
  id: string;
  country_id: string | null;
  country_name?: string | null;
  country_code?: string | null;
  from_price: number;
  to_price: number | null;
  charge_percent: number;
  extra_charge: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}
export interface SellerKYC {
  id: string;
  seller_id: string;

  // Pre-filled from signup (auto-populated)
  email: string;
  phone: string;
  full_name: string;
  country: string;

  // Tier 2 - Tax & Business Information
  pan: string;
  gstin?: string;

  // Identity Verification
  id_type: 'aadhar' | 'passport' | 'voter' | 'driver_license';
  id_number: string;
  id_document_url: string;
  id_document_file?: File;

  // Address Information
  business_address: UserAddress;
  address_proof_url: string;
  address_proof_file?: File;

  // Bank Details
  bank_holder_name: string;
  account_number: string;
  account_type: 'checking' | 'savings' | 'current';
  ifsc_code: string;
  bank_statement_url: string;
  bank_statement_file?: File;

  // Compliance & Legal
  pep_declaration: boolean;
  sanctions_check: boolean;
  aml_compliance: boolean;
  tax_compliance: boolean;
  terms_accepted: boolean;

  // KYC Status & Metadata
  kyc_status: 'draft' | 'pending' | 'approved' | 'rejected';
  kyc_tier: 1 | 2 | 3;
  rejection_reason?: string;
  verified_by_admin?: string;
  verified_at?: string;

  // Timestamps
  created_at: string;
  updated_at: string;
  submitted_at?: string;
}

// =====================================================
// PAYMENT & ORDER TYPES
// =====================================================

export interface StripePaymentIntent {
  id: string;
  clientSecret: string;
  status: 'requires_payment_method' | 'requires_confirmation' | 'requires_action' | 'processing' | 'requires_capture' | 'canceled' | 'succeeded';
  amount: number;
  currency: string;
  customerId: string;
  customerEmail: string;
  metadata?: Record<string, string>;
  created_at: string;
}

export interface OrderData {
  id: string;
  customerId: string;
  customerEmail: string;
  totalAmount: number;
  orderStatus: 'pending' | 'new' | 'accepted' | 'processing' | 'packed' | 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'return_requested' | 'returned' | 'refunded';
  paymentStatus: 'pending' | 'completed' | 'failed' | 'refunded';
  paymentIntentId?: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    price: number;
  }>;
  shippingAddress: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  billingAddress?: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  notes?: string;
  trackingNumber?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface CheckoutSession {
  id: string;
  sessionId: string;
  customerId: string;
  customerEmail: string;
  status: 'open' | 'complete' | 'expired';
  url?: string;
  successUrl: string;
  cancelUrl: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    price: number;
  }>;
  totalAmount: number;
  createdAt: string;
  expiresAt: string;
}

export interface PaymentRefund {
  id: string;
  refundId: string;
  paymentIntentId: string;
  amount: number;
  status: 'succeeded' | 'failed' | 'canceled';
  reason: 'duplicate' | 'fraudulent' | 'requested_by_customer' | 'abandoned';
  createdAt: string;
}