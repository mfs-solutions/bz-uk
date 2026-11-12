import { describe, it, expect } from 'vitest';
import { isIndianPincode, isIndiaCountry } from '../lib/tatService';

/* ── Helper: mirrors the routing logic now in useDeliveryEstimate.ts runCheck() ── */
function resolveCarrier(
  originCountry: string,
  _pincode: string,
): 'shiprocket' | 'shippo' {
  const originIsIndia = isIndiaCountry(originCountry);
  return originIsIndia ? 'shiprocket' : 'shippo';
}

/* ────────────────── isIndiaCountry ────────────────── */
describe('isIndiaCountry', () => {
  it('returns true for IN / IND / INDIA', () => {
    expect(isIndiaCountry('IN')).toBe(true);
    expect(isIndiaCountry('IND')).toBe(true);
    expect(isIndiaCountry('India')).toBe(true);
    expect(isIndiaCountry('  in  ')).toBe(true);
  });

  it('returns FALSE for empty string (critical fix)', () => {
    expect(isIndiaCountry('')).toBe(false);
  });

  it('returns false for other countries', () => {
    expect(isIndiaCountry('GB')).toBe(false);
    expect(isIndiaCountry('US')).toBe(false);
    expect(isIndiaCountry('UK')).toBe(false);
  });
});

/* ────────────────── isIndianPincode ────────────────── */
describe('isIndianPincode', () => {
  it('accepts valid 6-digit Indian pincodes', () => {
    expect(isIndianPincode('560001')).toBe(true);
    expect(isIndianPincode('110001')).toBe(true);
    expect(isIndianPincode('400001')).toBe(true);
  });

  it('rejects UK postcodes', () => {
    expect(isIndianPincode('NN38DJ')).toBe(false);
    expect(isIndianPincode('SW1A 1AA')).toBe(false);
    expect(isIndianPincode('EC1A')).toBe(false);
  });

  it('rejects US zip codes', () => {
    expect(isIndianPincode('10001')).toBe(false);   // 5-digit
    expect(isIndianPincode('10001-1234')).toBe(false); // zip+4
  });

  it('rejects empty / whitespace / letters', () => {
    expect(isIndianPincode('')).toBe(false);
    expect(isIndianPincode('   ')).toBe(false);
    expect(isIndianPincode('abcdef')).toBe(false);
  });
});

/* ────────────────── Carrier Routing ────────────────── */
describe('Carrier routing (origin-based logic)', () => {
  describe('India origin products', () => {
    it('Indian pincode 560001 → Shiprocket', () => {
      expect(resolveCarrier('IN', '560001')).toBe('shiprocket');
    });

    it('Indian pincode 110001 → Shiprocket', () => {
      expect(resolveCarrier('IN', '110001')).toBe('shiprocket');
    });

    it('UK postcode NN38DJ → Shiprocket (India origin)', () => {
      expect(resolveCarrier('IN', 'NN38DJ')).toBe('shiprocket');
    });

    it('US zip 10001 → Shiprocket (India origin)', () => {
      expect(resolveCarrier('IN', '10001')).toBe('shiprocket');
    });

    it('empty pincode → Shiprocket (India origin)', () => {
      expect(resolveCarrier('IN', '')).toBe('shiprocket');
    });

    it('origin "IND" with Indian pincode → Shiprocket', () => {
      expect(resolveCarrier('IND', '400001')).toBe('shiprocket');
    });

    it('origin "India" with UK postcode → Shiprocket', () => {
      expect(resolveCarrier('India', 'SW1A 1AA')).toBe('shiprocket');
    });
  });

  describe('UK origin products', () => {
    it('UK postcode → Shippo', () => {
      expect(resolveCarrier('GB', 'NN38DJ')).toBe('shippo');
    });

    it('Indian pincode → still Shippo (origin is not India)', () => {
      expect(resolveCarrier('GB', '560001')).toBe('shippo');
    });

    it('US zip → Shippo', () => {
      expect(resolveCarrier('GB', '10001')).toBe('shippo');
    });
  });

  describe('US origin products', () => {
    it('any pincode → Shippo', () => {
      expect(resolveCarrier('US', '10001')).toBe('shippo');
      expect(resolveCarrier('US', '560001')).toBe('shippo');
    });
  });

  describe('Empty / unknown origin', () => {
    it('empty origin + Indian pincode → Shippo (origin unknown, not India)', () => {
      expect(resolveCarrier('', '560001')).toBe('shippo');
    });

    it('empty origin + UK postcode → Shippo', () => {
      expect(resolveCarrier('', 'NN38DJ')).toBe('shippo');
    });
  });
});
