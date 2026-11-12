export type UkCheckoutReturnStatus = "success" | "processing" | "failed" | "cancelled";

export interface UkCheckoutReturnState {
  sessionStatus: string;
  paymentStatus: string;
  paymentIntentStatus?: string;
  failureConfirmed: boolean;
  orderConfirmed: boolean;
}

export function getUkCheckoutReturnStatus(
  state: UkCheckoutReturnState,
): UkCheckoutReturnStatus {
  if (
    state.orderConfirmed
    && state.paymentStatus === "paid"
    && state.paymentIntentStatus === "succeeded"
  ) {
    return "success";
  }
  if (state.paymentStatus === "paid" || state.paymentIntentStatus === "succeeded") {
    return "processing";
  }
  if (
    state.sessionStatus === "complete"
    && state.paymentStatus === "unpaid"
    && state.failureConfirmed
    && (state.paymentIntentStatus === "requires_payment_method" || state.paymentIntentStatus === "canceled")
  ) {
    return "failed";
  }
  if (state.sessionStatus === "expired" && state.paymentStatus === "unpaid") {
    return "cancelled";
  }
  return "processing";
}
