/**
 * Phase 5 seams. Everything here is off until it's built and reviewed.
 * Turning a flag on must never change what happens to existing user data.
 */
export const features = {
  /** Link out to Real Plannet's Career Blueprint. Shown only when the URL is configured. */
  careerSnapshotUrl: process.env.NEXT_PUBLIC_CAREER_BLUEPRINT_URL || "",
  /** Referral credits: not built. See DECISIONS.md, "Phase 5 seams". */
  referrals: false,
  /** Paid extras (Razorpay): not built. See lib/payments/types.ts. */
  payments: false,
  /** Privacy-safe, aggregated analytics: not built. See lib/analytics.ts. */
  analytics: false,
} as const;
