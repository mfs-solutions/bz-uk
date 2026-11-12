const TWELVE_DIGIT_MOD = 1_000_000_000_000n;
const SIX_DIGIT_MOD = 1_000_000;

function normalizeDate(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function toBase36Numeric(input: string, modulus: bigint): bigint {
  const normalized = String(input || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  let value = 0n;

  for (const ch of normalized) {
    const code = ch.charCodeAt(0);
    const digit = code >= 48 && code <= 57 ? code - 48 : code - 87;
    if (digit < 0 || digit > 35) continue;
    value = (value * 36n + BigInt(digit)) % modulus;
  }

  return value;
}

export function formatFrontend12DigitId(rawId: string, sequence?: number): string {
  if (sequence && sequence > 0) {
    const numeric = BigInt(sequence) % TWELVE_DIGIT_MOD;
    return numeric.toString().padStart(12, '0');
  }

  const digitsOnly = String(rawId || '').replace(/\D/g, '');
  if (digitsOnly.length > 0) {
    return digitsOnly.slice(-12).padStart(12, '0');
  }

  const derived = toBase36Numeric(String(rawId || ''), TWELVE_DIGIT_MOD);
  return derived.toString().padStart(12, '0');
}

export function buildInvoiceNumber(bookingDate: string | Date, sequence?: number, referenceId = ''): string {
  const date = normalizeDate(bookingDate);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);

  const serial = sequence && sequence > 0
    ? sequence % SIX_DIGIT_MOD
    : Number(toBase36Numeric(referenceId || date.toISOString(), BigInt(SIX_DIGIT_MOD)));

  const serialPart = String(serial || 1).padStart(6, '0');
  return `IN${month}${year}${serialPart}`;
}
