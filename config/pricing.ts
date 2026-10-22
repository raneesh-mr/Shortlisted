/**
 * What things cost. Prices are GST-inclusive (Real Plannet charges 18% GST and
 * the customer pays one round figure). Amounts are in the smallest currency
 * unit (paise), which is what Razorpay expects.
 */
export const GST_RATE = 0.18;

export const products = {
  cv_download: {
    sku: "cv_download",
    label: "Tailored CV · PDF + Word",
    amount: 19900,
    currency: "INR",
  },
} as const;

export type Sku = keyof typeof products;

/** Splits a GST-inclusive amount into base and tax, in paise. */
export function gstBreakdown(amountInclusive: number): { base: number; gst: number } {
  const base = Math.round(amountInclusive / (1 + GST_RATE));
  return { base, gst: amountInclusive - base };
}

export function formatMoney(paise: number, currency = "INR"): string {
  const value = paise / 100;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: Number.isInteger(value) ? 0 : 2 }).format(value);
}
