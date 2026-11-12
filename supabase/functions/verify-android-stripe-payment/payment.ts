export interface PaymentForVerification {
  id: string;
  status: string;
  currency: string;
  amount: number;
  amount_received: number;
  livemode: boolean;
  metadata: Record<string, string>;
}

export type PaymentVerification = "succeeded" | "pending" | "failed" | "mismatch";

export function verifyPayment(
  payment: PaymentForVerification,
  userId: string,
  paymentIntentId: string,
  expectedLivemode: boolean,
  expectedAmount: number,
): PaymentVerification {
  if (
    payment.id !== paymentIntentId ||
    payment.metadata.user_id !== userId ||
    payment.metadata.source !== "bzeadstore" ||
    payment.currency !== "gbp" ||
    payment.livemode !== expectedLivemode ||
    !Number.isSafeInteger(payment.amount) ||
    payment.amount <= 0 ||
    payment.amount !== expectedAmount
  ) return "mismatch";

  if (payment.status === "succeeded") {
    return payment.amount_received === payment.amount ? "succeeded" : "mismatch";
  }
  if (payment.status === "canceled" || payment.status === "requires_payment_method") return "failed";
  if (
    payment.status === "processing" ||
    payment.status === "requires_action" ||
    payment.status === "requires_confirmation" ||
    payment.status === "requires_capture"
  ) return "pending";
  return "mismatch";
}
