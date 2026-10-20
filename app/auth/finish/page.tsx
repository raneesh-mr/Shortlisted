"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { consentTexts } from "@/config/consents";
import { GUEST_FLAG, useApp } from "@/components/app-provider";
import { Button, Checkbox, Notice, Spinner } from "@/components/ui";
import { consentRecord, currentConsents, takePendingConsent } from "@/lib/consent";
import { LocalRepo } from "@/lib/repo/local";
import { RemoteRepo } from "@/lib/repo/remote";

type Step = "working" | "consent" | "migrate" | "error";

export default function FinishSignIn() {
  const t = useTranslations("finish");
  const router = useRouter();
  const { status, repo, user, reload } = useApp();
  const [step, setStep] = useState<Step>("working");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const done = async () => {
    localStorage.removeItem(GUEST_FLAG);
    await reload();
    const remote = repo as RemoteRepo;
    const profile = await remote.getProfile();
    router.replace(profile.onboarded ? "/home" : "/onboarding");
  };

  const checkGuestData = async () => {
    if (await new LocalRepo().hasData()) setStep("migrate");
    else await done();
  };

  useEffect(() => {
    if (status === "signed_out") router.replace("/welcome");
    if (status !== "ready" || !user || repo?.kind !== "account" || started.current) return;
    started.current = true;
    (async () => {
      try {
        const pending = takePendingConsent();
        if (pending.length) await repo.addConsents(pending);
        const consents = currentConsents(await repo.listConsents());
        if (!consents.core?.granted) {
          setStep("consent");
          return;
        }
        await checkGuestData();
      } catch {
        setStep("error");
      }
    })();
    // Runs once when the account session is ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, user, repo]);

  async function giveConsent() {
    if (!agree || !repo) return;
    setBusy(true);
    await repo.addConsents([consentRecord("core", true)]);
    setBusy(false);
    await checkGuestData();
  }

  async function migrate(move: boolean) {
    setBusy(true);
    try {
      const local = new LocalRepo();
      if (move) await (repo as RemoteRepo).importBundle(await local.exportAll());
      await local.clearAll();
      await done();
    } catch {
      setStep("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-10">
      {step === "working" && <Spinner label={t("working")} />}
      {step === "consent" && (
        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">{t("consentTitle")}</h1>
          <Checkbox
            checked={agree}
            onChange={setAgree}
            label={
              <>
                {consentTexts.core.text}{" "}
                <Link href="/privacy" className="underline">
                  {t("readPrivacy")}
                </Link>
              </>
            }
          />
          <Button disabled={!agree || busy} onClick={giveConsent}>
            {t("continue")}
          </Button>
        </div>
      )}
      {step === "migrate" && (
        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">{t("migrateTitle")}</h1>
          <p className="text-ink-2">{t("migrateBody")}</p>
          <Button disabled={busy} onClick={() => migrate(true)}>
            {t("migrateYes")}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => migrate(false)}>
            {t("migrateNo")}
          </Button>
        </div>
      )}
      {step === "error" && (
        <Notice tone="danger" action={<Button onClick={() => window.location.reload()}>{t("retry")}</Button>}>
          {t("error")}
        </Notice>
      )}
    </main>
  );
}
