const roundToMinorUnit = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalize(record[key])}`
    ).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function canonicalizeCartSnapshot(value: unknown): string {
  if (!Array.isArray(value)) return canonicalize(value);
  const sorted = [...value].sort((left, right) => {
    if (
      typeof left === 'object' && left !== null && 'id' in left
      && typeof right === 'object' && right !== null && 'id' in right
      && typeof left.id === 'string' && typeof right.id === 'string'
    ) {
      return left.id.localeCompare(right.id);
    }
    return 0;
  });
  return canonicalize(sorted);
}

export async function fingerprintUkHostedCheckoutRequest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalize(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function canReusePendingUkHostedCheckout(
  savedFingerprint: unknown,
  requestFingerprint: string,
  savedCartSnapshot: unknown,
  currentCartSnapshot: unknown,
): boolean {
  return typeof savedFingerprint === 'string'
    && savedFingerprint === requestFingerprint
    && canonicalizeCartSnapshot(savedCartSnapshot) === canonicalizeCartSnapshot(currentCartSnapshot);
}

export function calculateUkHostedCheckoutTotal(
  sharedRpcTotal: number,
  offerDiscount: number,
): number {
  if (!Number.isFinite(sharedRpcTotal) || !Number.isFinite(offerDiscount) ||
      sharedRpcTotal <= 0 || offerDiscount < 0 || offerDiscount >= sharedRpcTotal) {
    throw new Error('UK checkout totals are invalid');
  }

  return roundToMinorUnit(sharedRpcTotal - offerDiscount);
}

export function ukCheckoutAmountsMatch(displayedAmount: number, quotedAmount: number): boolean {
  if (!Number.isFinite(displayedAmount) || !Number.isFinite(quotedAmount)) return false;
  return Math.round((displayedAmount + Number.EPSILON) * 100)
    === Math.round((quotedAmount + Number.EPSILON) * 100);
}
