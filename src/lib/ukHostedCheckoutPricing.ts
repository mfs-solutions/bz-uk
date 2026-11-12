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
