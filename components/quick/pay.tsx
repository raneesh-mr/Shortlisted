"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { formatMoney, gstBreakdown, products } from "@/config/pricing";
import { useApp } from "@/components/app-provider";
import { Button, Card, Notice, Spinner, TextInput } from "@/components/ui";
import { apiFetch, errorKey } from "@/lib/client-api";
import { consentRecord, storePendingConsent } from "@/lib/consent";
import { PENDING_CHECKOUT, loadCheckout } from "@/lib/pay/client";
import { getBrowserSupabase } from "@/lib/supabase/client";

interface OrderResponse {
  already_paid?: boolean;
  order_id: string;
  key_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill_email: string | null;
}

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open(): void; on(event: string, cb: () => void): void };
  }
}

function SignInPanel({ cvId }: { cvId: string }) {
  const t = useTranslations("quick");
  const supabase = getBrowserSupabase();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prepare = () => {
    // They agreed to the privacy notice before building; carry that over to the account.
    storePendingConsent([consentRecord("core", true)]);
    localStorage.setItem(PENDING_CHECKOUT, cvId);
  };
  const redirectTo = () => `${window.location.origin}/auth/callback`;

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    prepare();
    const { error: err } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo() } });
    setBusy(false);
    if (err) setError(t("signInError"));
    else setSent(true);
  }

  async function google() {
    if (!supabase) return;
    prepare();
    const { error: err } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
    if (err) setError(t("signInError"));
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-medium text-ink-strong">{t("signInTitle")}</h2>
      <p className="text-sm text-ink-2">{t("signInLead")}</p>
      {sent ? (
        <Notice tone="ok">{t("linkSent")}</Notice>
      ) : (
        <>
          <form onSubmit={sendLink} className="flex flex-col gap-3">
            <TextInput label={t("email")} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit" disabled={busy || !email.trim()}>
              {t("sendLink")}
            </Button>
          </form>
          <Button variant="secondary" onClick={google}>
            {t("google")}
          </Button>
        </>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
    </Card>
  );
}

export function QuickPay() {
  const t = useTranslations("quick");
  const te = useTranslations("errors");
  const router = useRouter();
  const params = useSearchParams();
  const { status, repo, user, cvs, paidCvIds, refreshPurchases } = useApp();
  const cvId = params.get("cv") ?? "";
  const cv = cvs.find((c) => c.id === cvId) ?? null;
  const [phase, setPhase] = useState<"idle" | "opening" | "verifying">("idle");
  const [error, setError] = useState<string | null>(null);

  const product = products.cv_download;
  const { gst } = gstBreakdown(product.amount);
  const price = formatMoney(product.amount);
  const signedIn = repo?.kind === "account" && !!user;

  useEffect(() => {
    if (signedIn && paidCvIds.has(cvId)) router.replace(`/quick/done?cv=${cvId}`);
  }, [signedIn, paidCvIds, cvId, router]);

  if (status === "loading") return <Spinner label={t("savingCv")} />;
  if (!cv) return <Notice tone="warn" action={<Link href="/" className="font-semibold underline">{t("another")}</Link>}>{t("notFound")}</Notice>;

  async function verify(r: RazorpayResponse) {
    setPhase("verifying");
    try {
      await apiFetch("/api/pay/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r) });
      await refreshPurchases();
      router.push(`/quick/done?cv=${cvId}`);
    } catch (err) {
      setPhase("idle");
      setError(te(errorKey(err)));
    }
  }

  async function pay() {
    setError(null);
    setPhase("opening");
    try {
      const res = await apiFetch("/api/pay/order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cv_id: cvId }) });
      const order = (await res.json()) as OrderResponse;
      if (order.already_paid) {
        await refreshPurchases();
        router.push(`/quick/done?cv=${cvId}`);
        return;
      }
      await loadCheckout();
      if (!window.Razorpay) throw new Error("checkout_load_failed");
      const rzp = new window.Razorpay({
        key: order.key_id,
        order_id: order.order_id,
        amount: order.amount,
        currency: order.currency,
        name: order.name,
        description: order.description,
        prefill: { email: order.prefill_email ?? "" },
        notes: { sku: product.sku, cv_id: cvId },
        theme: { color: "#c9a84c" },
        handler: (r: RazorpayResponse) => void verify(r),
        modal: {
          ondismiss: () => {
            setPhase("idle");
            setError(t("payCancelled"));
          },
        },
      });
      rzp.on("payment.failed", () => setError(t("payFailed")));
      rzp.open();
      setPhase("idle");
    } catch (err) {
      setPhase("idle");
      const code = errorKey(err);
      setError(code === "payments_not_configured" ? t("payNotConfigured") : te(code));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={() => router.back()} className="self-start text-sm text-ink-2 hover:text-accent-strong">
        {t("backToPreview")}
      </button>
      <h1 className="font-display text-4xl font-semibold text-ink-strong">{t("payTitle")}</h1>

      {!signedIn && <SignInPanel cvId={cvId} />}

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm uppercase tracking-wider text-ink-2">{t("orderTitle")}</h2>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium text-ink-strong">{product.label}</p>
            <p className="text-sm text-ink-2">{cv.title}</p>
          </div>
          <p className="font-display text-3xl font-semibold text-accent-strong">{price}</p>
        </div>
        <p className="text-xs text-ink-2">{t("gstNote", { gst: formatMoney(gst) })}</p>
        <Button className="min-h-14 w-full text-lg" disabled={!signedIn || phase !== "idle"} onClick={pay}>
          {phase === "opening" ? t("paying") : phase === "verifying" ? t("verifying") : t("pay", { price })}
        </Button>
        <p className="text-center text-xs text-ink-2">{t("payNote")}</p>
        {error && <Notice tone="danger">{error}</Notice>}
      </Card>

      <p className="text-center text-xs text-ink-2">
        <Link href="/privacy#refunds" className="underline">
          {t("refund")}
        </Link>
        <span aria-hidden> · </span>
        <Link href="/privacy#terms" className="underline">
          {t("terms")}
        </Link>
      </p>
    </div>
  );
}
