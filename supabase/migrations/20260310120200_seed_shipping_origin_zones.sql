begin;

-- ============================================================
-- Seed shipping_origin_zones with Indian pincode → zone mapping
--
-- Delhivery uses origin zones to price international shipments.
-- Zone A = Metro/major hubs (cheapest international rates)
-- Zone B = Tier-2 cities
-- Zone C = Tier-3 / semi-urban
-- Zone D = Remote / rural areas
--
-- This is an approximate mapping based on India Post pincode allocation.
-- Admin can fine-tune via the Settings page.
-- ============================================================

-- ==================== ZONE A — Metro / Major Hubs ====================
-- Delhi NCR (110001–110099, 120001–129999, 201001–201999)
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('A', 'Metro', '110001', '110099', 'New Delhi', 'Delhi'),
  ('A', 'Metro', '120001', '129999', 'Gurugram / Faridabad', 'Haryana'),
  ('A', 'Metro', '201001', '201999', 'Noida / Ghaziabad', 'Uttar Pradesh');

-- Mumbai (400001–400099, 400601–400699, 410001–410999)
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('A', 'Metro', '400001', '400099', 'Mumbai', 'Maharashtra'),
  ('A', 'Metro', '400601', '400699', 'Navi Mumbai', 'Maharashtra'),
  ('A', 'Metro', '410001', '410999', 'Pune', 'Maharashtra');

-- Bengaluru (560001–560099)
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('A', 'Metro', '560001', '560099', 'Bengaluru', 'Karnataka');

-- Chennai (600001–600099)
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('A', 'Metro', '600001', '600099', 'Chennai', 'Tamil Nadu');

-- Kolkata (700001–700099)
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('A', 'Metro', '700001', '700099', 'Kolkata', 'West Bengal');

-- Hyderabad (500001–500099)
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('A', 'Metro', '500001', '500099', 'Hyderabad', 'Telangana');

-- Ahmedabad (380001–380099)
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('A', 'Metro', '380001', '380099', 'Ahmedabad', 'Gujarat');

-- Kochi / Ernakulam (682001–682099, 683001–683099)
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('A', 'Metro', '682001', '682099', 'Kochi', 'Kerala');

-- ==================== ZONE B — Tier-2 Cities ====================
-- Jaipur (302001–302099)
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('B', 'Tier-2', '302001', '302099', 'Jaipur', 'Rajasthan');

-- Lucknow (226001–226099)
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('B', 'Tier-2', '226001', '226099', 'Lucknow', 'Uttar Pradesh');

-- Chandigarh (160001–160099)
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('B', 'Tier-2', '160001', '160099', 'Chandigarh', 'Chandigarh');

-- Indore (452001–452099)
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('B', 'Tier-2', '452001', '452099', 'Indore', 'Madhya Pradesh');

-- Bhopal (462001–462099)
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('B', 'Tier-2', '462001', '462099', 'Bhopal', 'Madhya Pradesh');

-- Coimbatore (641001–641099)
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('B', 'Tier-2', '641001', '641099', 'Coimbatore', 'Tamil Nadu');

-- Visakhapatnam (530001–530099)
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('B', 'Tier-2', '530001', '530099', 'Visakhapatnam', 'Andhra Pradesh');

-- Nagpur (440001–440099)
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('B', 'Tier-2', '440001', '440099', 'Nagpur', 'Maharashtra');

-- Thiruvananthapuram (695001–695099)
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('B', 'Tier-2', '695001', '695099', 'Thiruvananthapuram', 'Kerala');

-- Kozhikode (673001–673099)
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('B', 'Tier-2', '673001', '673099', 'Kozhikode', 'Kerala');

-- Thrissur (680001–680099)
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('B', 'Tier-2', '680001', '680099', 'Thrissur', 'Kerala');

-- Patna (800001–800099)
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('B', 'Tier-2', '800001', '800099', 'Patna', 'Bihar');

-- Bhubaneswar (751001–751099)
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('B', 'Tier-2', '751001', '751099', 'Bhubaneswar', 'Odisha');

-- Dehradun (248001–248099)
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('B', 'Tier-2', '248001', '248099', 'Dehradun', 'Uttarakhand');

-- Vadodara (390001–390099)
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('B', 'Tier-2', '390001', '390099', 'Vadodara', 'Gujarat');

-- Surat (395001–395099)
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('B', 'Tier-2', '395001', '395099', 'Surat', 'Gujarat');

-- ==================== ZONE C — Tier-3 / Semi-urban ====================
-- Broad state-level ranges for areas not covered by Zone A or B
-- These are catch-all ranges; admin should refine as needed.

-- Kerala remainder (670001–699999 excluding specific cities above)
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('C', 'Tier-3', '670001', '671999', 'Kannur / Kasargod', 'Kerala'),
  ('C', 'Tier-3', '674001', '679999', 'Palakkad / Malappuram', 'Kerala'),
  ('C', 'Tier-3', '685001', '689999', 'Idukki / Kottayam', 'Kerala'),
  ('C', 'Tier-3', '690001', '694999', 'Alappuzha / Kollam', 'Kerala');

-- Tamil Nadu remainder
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('C', 'Tier-3', '601001', '639999', 'Tamil Nadu (others)', 'Tamil Nadu'),
  ('C', 'Tier-3', '642001', '643999', 'Nilgiris / Salem', 'Tamil Nadu');

-- Karnataka remainder
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('C', 'Tier-3', '560100', '591999', 'Karnataka (others)', 'Karnataka');

-- Rajasthan remainder
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('C', 'Tier-3', '302100', '345999', 'Rajasthan (others)', 'Rajasthan');

-- UP remainder
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('C', 'Tier-3', '202001', '225999', 'UP (West)', 'Uttar Pradesh'),
  ('C', 'Tier-3', '226100', '285999', 'UP (East)', 'Uttar Pradesh');

-- MP remainder
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('C', 'Tier-3', '452100', '461999', 'MP (others)', 'Madhya Pradesh'),
  ('C', 'Tier-3', '462100', '488999', 'MP (East)', 'Madhya Pradesh');

-- West Bengal remainder
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('C', 'Tier-3', '700100', '743999', 'West Bengal (others)', 'West Bengal');

-- Gujarat remainder
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('C', 'Tier-3', '360001', '379999', 'Gujarat (West)', 'Gujarat'),
  ('C', 'Tier-3', '380100', '389999', 'Gujarat (Central)', 'Gujarat'),
  ('C', 'Tier-3', '395100', '396999', 'Gujarat (South)', 'Gujarat');

-- ==================== ZONE D — Remote / Rural ====================
-- Northeast & special areas
insert into public.shipping_origin_zones (zone_code, zone_name, pincode_start, pincode_end, city, state) values
  ('D', 'Remote', '781001', '798999', 'Northeast India', 'Assam / Meghalaya / Nagaland / Manipur'),
  ('D', 'Remote', '799001', '799999', 'Tripura', 'Tripura'),
  ('D', 'Remote', '190001', '194999', 'Jammu & Kashmir', 'J&K'),
  ('D', 'Remote', '171001', '177999', 'Himachal Pradesh', 'Himachal Pradesh'),
  ('D', 'Remote', '737001', '737999', 'Sikkim', 'Sikkim'),
  ('D', 'Remote', '744001', '744999', 'Andaman & Nicobar', 'A&N Islands'),
  ('D', 'Remote', '796001', '796999', 'Mizoram', 'Mizoram'),
  ('D', 'Remote', '790001', '792999', 'Arunachal Pradesh', 'Arunachal Pradesh');

-- ==================== NOTE ====================
-- This is a starter set. Admin should:
-- 1. Verify zone mappings against Delhivery's actual zone classification
-- 2. Add missing pincode ranges (many gaps exist)
-- 3. Split large ranges if different zones apply within a range
-- 4. Use the admin Settings page → shipping_origin_zones table to manage

commit;
