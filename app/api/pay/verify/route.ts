import { NextResponse } from "next/server";
import { z } from "zod";
import { allow, apiError, zodError } from "@/lib/api";
import { verifyPaymentSignature } from "@/lib/pay/razorpay";
import { getAdminSupabase, getServerSupabase, getUserId } from "@/lib/supabase/server";

const bodySchema = z.object({
  razorpay_order_id: z.string().min(1).max(64),
  razorpay_payment_id: z.string().min(1).max(64),
  razorpay_signature: z.string().min(1).max(256),
});
const HOUR = 60 * 60 * 1000;

/** Confirms a checkout: the signature proves Razorpay completed this exact order. */
export async function POST(req: Request) {
  const supabase = await getServerSupabase();
  const userId = await getUserId(supabase);
  if (!userId) return apiError("unauthorized", 401);
  if (!(await allow(req, "pay-verify", userId, { shared: "LIMIT_ACCOUNT", limit: 30, windowMs: HOUR }))) return apiError("rate_limited", 429);

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return zodError(body.error);
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = body.data;

  if (!(await verifyPaymentSignature(orderId, paymentId, signature))) return apiError("bad_request", 400);

  const admin = getAdminSupabase();
  // Only the order this user started; a verified webhook may already have marked it paid.
  const { data, error } = await admin
    .from("purchases")
    .update({ status: "paid", payment_id: paymentId, paid_at: new Date().toISOString() })
    .eq("order_id", orderId)
    .eq("user_id", userId)
    .select("cv_id")
    .maybeSingle();
  if (error || !data) {
    console.error("[pay-verify] no matching order", { found: Boolean(data) });
    return apiError("not_found", 404);
  }
  await admin.from("audit").insert({ user_id: userId, event: "purchase.paid", metadata: { sku: "cv_download" } });
  return NextResponse.json({ paid: true, cv_id: data.cv_id }, { headers: { "Cache-Control": "no-store" } });
}
