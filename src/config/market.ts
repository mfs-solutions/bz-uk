import { runtimeEnv } from '../lib/runtimeEnv.ts';

export const STOREFRONT_COUNTRY_NAME = 'United Kingdom';
export const STOREFRONT_COUNTRY_CODE = 'GB';
export const STOREFRONT_CURRENCY_CODE = 'GBP';

export const IS_UK_STOREFRONT = runtimeEnv.VITE_MARKET === STOREFRONT_COUNTRY_CODE;

export const isUKCountry = (country: string): boolean => {
  const token = String(country || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return [
    'UNITEDKINGDOM',
    'UK',
    'GB',
    'GBR',
    'GREATBRITAIN',
    'GREATBRITAINANDNORTHERNIRELAND',
    'UNITEDKINGDOMOFGREATBRITAINANDNORTHERNIRELAND',
  ].includes(token);
};
