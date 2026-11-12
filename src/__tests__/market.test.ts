import { describe, expect, it } from 'vitest';
import {
  isUKCountry,
  STOREFRONT_COUNTRY_CODE,
  STOREFRONT_COUNTRY_NAME,
  STOREFRONT_CURRENCY_CODE,
} from '../config/market';

describe('UK storefront market', () => {
  it('uses UK country and GBP market settings', () => {
    expect(STOREFRONT_COUNTRY_NAME).toBe('United Kingdom');
    expect(STOREFRONT_COUNTRY_CODE).toBe('GB');
    expect(STOREFRONT_CURRENCY_CODE).toBe('GBP');
  });

  it.each([
    'United Kingdom',
    'United Kingdom of Great Britain and Northern Ireland',
    'UK',
    'GB',
    'GBR',
    'Great Britain',
  ])(
    'recognizes %s as the UK',
    (country) => {
      expect(isUKCountry(country)).toBe(true);
    },
  );

  it('rejects countries outside the UK storefront', () => {
    expect(isUKCountry('Maldives')).toBe(false);
    expect(isUKCountry('United States')).toBe(false);
  });
});
