import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/pay/razorpay";
import { getAdminSupabase } from "@/lib/supabase/server";

interface RazorpayEvent {
  event: string;
  payload?: { payment?: { entity?: { id?: string; order_id?: string } } };
}

/**
 * Razorpay webhook (payment.captured, order.paid, payment.failed). A backstop
 * for when the browser closes before /api/pay/verify runs. Signature required.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  if (!(await verifyWebhookSignature(raw, signature))) return NextResponse.json({ error: "bad signature" }, { status: 400 });

  let evt: RazorpayEvent;
  try {
    evt = JSON.parse(raw) as RazorpayEvent;
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  const payment = evt.payload?.payment?.entity;
  const orderId = payment?.order_id;
  if (!orderId) return NextResponse.json({ status: "ignored" });

  const admin = getAdminSupabase();
  if (evt.event === "payment.captured" || evt.event === "order.paid") {
    await admin
      .from("purchases")
      .update({ status: "paid", payment_id: payment?.id ?? null, paid_at: new Date().toISOString() })
      .eq("order_id", orderId)
      .neq("status", "paid");
  } else if (evt.event === "payment.failed") {
    await admin.from("purchases").update({ status: "failed" }).eq("order_id", orderId).eq("status", "created");
  }
  return NextResponse.json({ status: "ok" });
}
