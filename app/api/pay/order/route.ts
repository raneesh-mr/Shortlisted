import { NextResponse } from "next/server";
import { z } from "zod";
import { brand } from "@/config/brand";
import { products } from "@/config/pricing";
import { allow, apiError, zodError } from "@/lib/api";
import { PaymentError, createOrder, paymentsConfigured, publicKeyId } from "@/lib/pay/razorpay";
import { getAdminSupabase, getServerSupabase, getUserId } from "@/lib/supabase/server";

const bodySchema = z.object({ cv_id: z.string().uuid() });
const HOUR = 60 * 60 * 1000;

/**
 * Starts a ₹199 checkout for one CV. The amount comes from config/pricing.ts,
 * never from the browser. Requires sign-in (purchases belong to an account).
 */
export async function POST(req: Request) {
  const supabase = await getServerSupabase();
  const userId = await getUserId(supabase);
  if (!supabase || !userId) return apiError("unauthorized", 401);
  if (!(await allow(req, "pay-order", userId, { shared: "LIMIT_ACCOUNT", limit: 30, windowMs: HOUR }))) return apiError("rate_limited", 429);
  if (!paymentsConfigured()) return apiError("payments_not_configured", 503);

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return zodError(body.error);
  const cvId = body.data.cv_id;

  // The CV must be the user's own (RLS), and not already paid for.
  const [{ data: cv }, { data: paid }, { data: claims }] = await Promise.all([
    supabase.from("cvs").select("id,title").eq("id", cvId).maybeSingle(),
    supabase.from("purchases").select("id").eq("cv_id", cvId).eq("status", "paid").limit(1),
    supabase.auth.getClaims(),
  ]);
  if (!cv) return apiError("not_found", 404);
  if (paid?.length) return NextResponse.json({ already_paid: true, cv_id: cvId });

  const product = products.cv_download;
  try {
    const order = await createOrder({
      amount: product.amount,
      currency: product.currency,
      receipt: `cv_${cvId.slice(0, 8)}_${Date.now().toString(36)}`,
      notes: { sku: product.sku, cv_id: cvId, user_id: userId },
    });
    const admin = getAdminSupabase();
    const { error } = await admin.from("purchases").insert({
      user_id: userId,
      cv_id: cvId,
      sku: product.sku,
      amount: product.amount,
      currency: product.currency,
      order_id: order.id,
      status: "created",
    });
    if (error) throw error;
    return NextResponse.json(
      {
        order_id: order.id,
        key_id: publicKeyId(),
        amount: product.amount,
        currency: product.currency,
        name: brand.name,
        description: `${product.label} (incl. 18% GST)`,
        prefill_email: (claims?.claims?.email as string | undefined) ?? "",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof PaymentError && err.code === "not_configured") return apiError("payments_not_configured", 503);
    console.error("[pay-order] failed", { name: err instanceof Error ? err.name : "unknown" });
    return apiError("server_error", 502);
  }
}
