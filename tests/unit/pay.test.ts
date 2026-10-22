import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { formatMoney, gstBreakdown, products } from "@/config/pricing";
import { exportInputSchema } from "@/lib/cv/export-input";
import { safeEqual, verifyPaymentSignature, verifyWebhookSignature } from "@/lib/pay/razorpay";

const hmac = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("hex");

describe("pricing", () => {
  it("charges ₹199 including 18% GST", () => {
    expect(products.cv_download.amount).toBe(19900);
    const { base, gst } = gstBreakdown(19900);
    expect(base + gst).toBe(19900);
    expect(base).toBe(16864);
    expect(gst).toBe(3036);
    expect(formatMoney(19900)).toBe("₹199");
    expect(formatMoney(3036)).toBe("₹30.36");
  });
});

describe("Razorpay signatures", () => {
  const secret = "test_secret";

  it("accepts a genuine checkout signature and rejects tampering", async () => {
    const sig = hmac(secret, "order_1|pay_1");
    expect(await verifyPaymentSignature("order_1", "pay_1", sig, secret)).toBe(true);
    expect(await verifyPaymentSignature("order_2", "pay_1", sig, secret)).toBe(false);
    expect(await verifyPaymentSignature("order_1", "pay_1", sig.replace(/.$/, (c) => (c === "0" ? "1" : "0")), secret)).toBe(false);
  });

  it("never verifies without a secret", async () => {
    expect(await verifyPaymentSignature("order_1", "pay_1", hmac("", "order_1|pay_1"), "")).toBe(false);
    expect(await verifyWebhookSignature("{}", hmac("", "{}"), "")).toBe(false);
  });

  it("checks webhooks against the raw body", async () => {
    const body = JSON.stringify({ event: "payment.captured" });
    expect(await verifyWebhookSignature(body, hmac(secret, body), secret)).toBe(true);
    expect(await verifyWebhookSignature(`${body} `, hmac(secret, body), secret)).toBe(false);
    expect(await verifyWebhookSignature(body, "", secret)).toBe(false);
  });

  it("compares in constant time without false matches", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("export input", () => {
  it("a file download names only the CV id; the server loads the content", () => {
    const id = "6f1c2b8e-4a1d-4c55-9a0e-2f3b4c5d6e7f";
    expect(exportInputSchema.safeParse({ mode: "file", cv_id: id }).success).toBe(true);
    // The old shape (client-supplied CV content) no longer produces a file.
    expect(exportInputSchema.safeParse({ mode: "file", cv: {}, facts: [] }).success).toBe(false);
  });
});
