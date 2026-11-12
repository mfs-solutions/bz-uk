-- Idempotent baseline seed for local development resets.
-- Does not delete or overwrite existing live/business data.

insert into public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
select 'India', 'IND', 'IND', 'INR', '+91', true
where not exists (
  select 1 from public.countries where lower(country_name) = 'india'
);

insert into public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
select 'United States', 'USA', 'USA', 'USD', '+1', true
where not exists (
  select 1 from public.countries where lower(country_name) = 'united states'
);

insert into public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
select 'United Kingdom', 'GBR', 'GBR', 'GBP', '+44', true
where not exists (
  select 1 from public.countries where lower(country_name) = 'united kingdom'
);

insert into public.countries (country_name, short_code, country_code, currency_code, dialing_code, is_active)
select 'United Arab Emirates', 'ARE', 'ARE', 'AED', '+971', true
where not exists (
  select 1 from public.countries where lower(country_name) = 'united arab emirates'
);

insert into public.business_types (type_name, description, is_active)
select 'Individual', 'Single owner/individual seller', true
where not exists (
  select 1 from public.business_types where lower(type_name) = 'individual'
);

insert into public.business_types (type_name, description, is_active)
select 'Brand', 'Registered brand account', true
where not exists (
  select 1 from public.business_types where lower(type_name) = 'brand'
);

insert into public.business_types (type_name, description, is_active)
select 'Freelancing', 'Independent freelance seller', true
where not exists (
  select 1 from public.business_types where lower(type_name) = 'freelancing'
);

insert into public.business_types (type_name, description, is_active)
select 'SME', 'Small and medium enterprise', true
where not exists (
  select 1 from public.business_types where lower(type_name) = 'sme'
);

insert into public.domestic_courier_type (name)
select 'Shiprocket'
where not exists (
  select 1 from public.domestic_courier_type where lower(name) = 'shiprocket'
);
