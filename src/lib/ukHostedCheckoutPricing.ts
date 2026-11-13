const roundToMinorUnit = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

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
