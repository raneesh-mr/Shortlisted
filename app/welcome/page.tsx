"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useTranslations } from "next-intl";
import { brand } from "@/config/brand";
import { consentTexts } from "@/config/consents";
import { useApp } from "@/components/app-provider";
import { Button, Checkbox, Notice, TextInput } from "@/components/ui";
import { consentRecord, storePendingConsent } from "@/lib/consent";
import { getBrowserSupabase } from "@/lib/supabase/client";

function Welcome() {
  const t = useTranslations("welcome");
  const router = useRouter();
  const params = useSearchParams();
  const { startGuest, repo } = useApp();
  const supabase = getBrowserSupabase();
  const upgrade = params.get("upgrade") === "1";
  const authError = params.get("error");

  const [agree, setAgree] = useState(false);
  const [emailUpdates, setEmailUpdates] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(authError ? t("errorAuth") : null);

  const consents = () => [consentRecord("core", true), consentRecord("email_updates", emailUpdates)];
  const redirectTo = () => `${window.location.origin}/auth/callback`;

  const requireConsent = () => {
    if (agree) return true;
    setError(t("needConsent"));
    return false;
  };

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !requireConsent()) return;
    setBusy(true);
    setError(null);
    storePendingConsent(consents());
    const { error: err } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo() } });
    setBusy(false);
    if (err) setError(t("errorSend"));
    else setSent(true);
  }

  async function google() {
    if (!supabase || !requireConsent()) return;
    storePendingConsent(consents());
    const { error: err } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
    if (err) setError(t("errorSend"));
  }

  async function guest() {
    if (!requireConsent()) return;
    await startGuest();
    await new (await import("@/lib/repo/local")).LocalRepo().addConsents(consents());
    router.push("/onboarding");
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-8">
      <Link href="/" className="text-lg font-semibold text-accent">
        {brand.name}
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">{upgrade ? t("upgradeTitle") : t("title")}</h1>
      <p className="mt-2 text-ink-2">{upgrade ? t("upgradeLead") : t("lead")}</p>

      <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
        <Checkbox
          checked={agree}
          onChange={(v) => {
            setAgree(v);
            if (v) setError(null);
          }}
          label={
            <>
              {consentTexts.core.text}{" "}
              <Link href="/privacy" className="underline">
                {t("readPrivacy")}
              </Link>
            </>
          }
        />
        <Checkbox checked={emailUpdates} onChange={setEmailUpdates} label={consentTexts.email_updates.text} />
      </div>

      {error && (
        <div className="mt-4">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}

      {supabase ? (
        sent ? (
          <div className="mt-6">
            <Notice tone="ok" title={t("linkSentTitle")}>
              {t("linkSent", { email })}
            </Notice>
          </div>
        ) : (
          <>
            <form onSubmit={sendLink} className="mt-6 flex flex-col gap-3">
              <TextInput
                label={t("emailLabel")}
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button type="submit" disabled={busy}>
                {busy ? t("sending") : t("sendLink")}
              </Button>
            </form>
            <p className="my-4 text-center text-sm text-ink-2">{t("or")}</p>
            <Button variant="secondary" onClick={google}>
              {t("google")}
            </Button>
          </>
        )
      ) : (
        <div className="mt-6">
          <Notice>{t("notConfigured")}</Notice>
        </div>
      )}

      {!upgrade && !repo && (
        <div className="mt-8 border-t border-line pt-6">
          <Button variant="ghost" className="w-full" onClick={guest}>
            {t("guest")}
          </Button>
          <p className="mt-2 text-center text-sm text-ink-2">{t("guestHint")}</p>
        </div>
      )}
    </main>
  );
}

export default function WelcomePage() {
  return (
    <Suspense>
      <Welcome />
    </Suspense>
  );
}
