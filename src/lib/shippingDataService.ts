import { supabase } from './supabase';

// ============================================================
// SHIPPING DATA SERVICE — Supabase CRUD for shipping tables
// ============================================================

// ---------- TYPES ----------

export interface DomesticCourierType {
  id: string;
  name: string;
}

export interface DomesticShippingchargeType {
  id: string;
  name: string;
}

export interface InternationalCourierType {
  id: string;
  name: string;
}

export interface Country {
  id: string;
  country_name: string;
  country_code: string;
  short_code: string;
  currency_code: string;
  dialing_code: string;
  is_active: boolean;
}

export interface State {
  id: string;
  state_name: string;
  state_code: string;
  country_id: string;
  is_active: boolean;
}

export interface PackingType {
  id: string;
  code: string;
  name: string;
  description: string;
  is_active: boolean;
}

export interface MeasurementUnit {
  id: string;
  code: string;
  name: string;
  category: 'weight' | 'dimension' | 'both';
  is_active: boolean;
}

// ---------- FETCH FUNCTIONS ----------

export async function fetchDomesticCourierTypes() {
  const { data, error } = await supabase
    .from('domestic_courier_type')
    .select('id, name')
    .order('name');
  return { data: (data || []) as DomesticCourierType[], error: error?.message || null };
}

export async function fetchDomesticShippingchargeTypes() {
  const { data, error } = await supabase
    .from('domestic_shippingcharge_type')
    .select('id, name')
    .order('name');
  return { data: (data || []) as DomesticShippingchargeType[], error: error?.message || null };
}

export async function fetchInternationalCourierTypes() {
  const { data, error } = await supabase
    .from('international_courier_type')
    .select('id, name')
    .order('name');
  return { data: (data || []) as InternationalCourierType[], error: error?.message || null };
}

export async function fetchCountries() {
  const { data, error } = await supabase
    .from('countries')
    .select('id, country_name, country_code, short_code, currency_code, dialing_code, is_active')
    .eq('is_active', true)
    .order('country_name');
  return { data: (data || []) as Country[], error: error?.message || null };
}

export async function fetchStatesByCountryId(countryId: string) {
  const { data, error } = await supabase
    .from('states')
    .select('id, state_name, state_code, country_id, is_active')
    .eq('country_id', countryId)
    .eq('is_active', true)
    .order('state_name');
  return { data: (data || []) as State[], error: error?.message || null };
}

export async function fetchPackingTypes() {
  const { data, error } = await supabase
    .from('packing_types')
    .select('id, code, name, description, is_active')
    .eq('is_active', true)
    .order('name');
  return { data: (data || []) as PackingType[], error: error?.message || null };
}

export async function fetchMeasurementUnits(category?: 'weight' | 'dimension' | 'volume' | 'count') {
  let query = supabase
    .from('measurement_units')
    .select('id, code, name, category, is_active')
    .eq('is_active', true);

  if (category === 'weight') {
    query = query.in('category', ['weight', 'both']);
  }

  if (category === 'dimension') {
    query = query.in('category', ['dimension', 'both']);
  }

  if (category === 'volume') {
    query = query.eq('category', 'volume');
  }

  if (category === 'count') {
    query = query.eq('category', 'count');
  }

  const { data, error } = await query.order('name');
  return { data: (data || []) as MeasurementUnit[], error: error?.message || null };
}

// ---------- TAX RULES ----------

export interface TaxRuleInfo {
  id: string;
  name: string;
  tax_type: string | null;
  percentage: number;
  country: string | null;
  country_code: string | null;
  category_id: string | null;
}

export async function fetchTaxRulesForCategory(categoryId: string, countryName?: string) {
  void categoryId;
  void countryName;
  return { data: [] as TaxRuleInfo[], error: null as string | null };
}
