export const toMoneyNumber = (value: unknown): number => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return num;
};

export const resolveItemQuantity = (item: Record<string, any>): number => {
  return Math.max(0, toMoneyNumber(item?.quantity));
};

export const resolveCustomerUnitPrice = (item: Record<string, any>): number => {
  return toMoneyNumber(item?.customer_unit_price ?? item?.price ?? 0);
};

export const resolveSellerUnitPrice = (item: Record<string, any>): number => {
  return toMoneyNumber(item?.seller_unit_price ?? 0);
};

export const resolveCustomerLineTotal = (item: Record<string, any>): number => {
  const lineTotal = item?.customer_line_total;
  if (lineTotal != null) return toMoneyNumber(lineTotal);
  return resolveCustomerUnitPrice(item) * resolveItemQuantity(item);
};

export const resolveSellerLineTotal = (item: Record<string, any>): number => {
  const lineTotal = item?.seller_line_total;
  if (lineTotal != null) return toMoneyNumber(lineTotal);
  return resolveSellerUnitPrice(item) * resolveItemQuantity(item);
};

export const sumCustomerOrderTotal = (items: Array<Record<string, any>>): number => {
  return (items || []).reduce((sum, item) => sum + resolveCustomerLineTotal(item), 0);
};

export const sumSellerOrderTotal = (items: Array<Record<string, any>>): number => {
  return (items || []).reduce((sum, item) => sum + resolveSellerLineTotal(item), 0);
};
