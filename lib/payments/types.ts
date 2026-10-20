/**
 * Seam for paid extras (Phase 5). Nothing here charges anyone.
 *
 * When building it (Razorpay first):
 *  - orders are created and verified only in server routes; keys stay server-side;
 *  - payment webhooks are verified by signature before any entitlement changes;
 *  - entitlements live in their own table (user_id, plan, valid_until, source) with RLS;
 *  - free features stay free: paid extras add, never remove.
 */
export interface Plan {
  id: string;
  /** Shown to the user; never "only X left" or countdowns (no dark patterns). */
  label: string;
  /** Smallest currency unit, e.g. paise for INR. */
  amount: number;
  currency: "INR" | "USD" | "AED" | "GBP" | "EUR";
}

export interface CheckoutSession {
  provider: "razorpay";
  orderId: string;
  amount: number;
  currency: Plan["currency"];
}

export interface PaymentProvider {
  createOrder(userId: string, plan: Plan): Promise<CheckoutSession>;
  /** Returns the verified order id, or null if the signature doesn't match. */
  verifyWebhook(rawBody: string, signature: string): Promise<string | null>;
}

/** No plans are on sale. */
export const plans: Plan[] = [];
