"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { consentTexts } from "@/config/consents";
import { formatMoney, products } from "@/config/pricing";
import { useApp } from "@/components/app-provider";
import { Button, Checkbox, Notice, TextArea, cx } from "@/components/ui";
import { errorKey } from "@/lib/client-api";
import { consentRecord } from "@/lib/consent";
import { ExtractError } from "@/lib/import/extract";
import { emptyProfile } from "@/lib/model";
import { LocalRepo } from "@/lib/repo/local";
import { QuickError, runQuick, type QuickStep } from "@/lib/quick/run";

const steps: QuickStep[] = ["cv", "job", "match", "write"];
const ACCEPT = ".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

function StepCard({ n, title, hint, children }: { n: number; title: string; hint: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-accent text-sm font-semibold text-accent-strong">{n}</span>
        <div>
          <h2 className="font-medium text-ink-strong">{title}</h2>
          <p className="text-xs text-ink-2">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function FilePick({ label, file, onPick, primary }: { label: string; file: File | null; onPick: (f: File | null) => void; primary?: boolean }) {
  const t = useTranslations("quick");
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={input} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
      {file ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-accent/60 bg-accent-soft px-3 py-2.5">
          <span className="truncate text-sm text-ink-strong">✓ {file.name}</span>
          <button type="button" className="shrink-0 text-sm text-accent-strong underline" onClick={() => input.current?.click()}>
            {t("replaceFile")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className={cx(
            "flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-dashed px-4 text-base",
            primary ? "border-accent text-accent-strong hover:bg-accent-soft" : "border-line text-ink hover:border-accent",
          )}
        >
          <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
          </svg>
          {label}
        </button>
      )}
    </>
  );
}

export function QuickStart() {
  const t = useTranslations("quick");
  const te = useTranslations("errors");
  const router = useRouter();
  const app = useApp();
  const { status, facts, online } = app;

  const [cvFile, setCvFile] = useState<File | null>(null);
  const [pasteCv, setPasteCv] = useState(false);
  const [cvText, setCvText] = useState("");
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [jdText, setJdText] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<QuickStep | null>(null);
  const [failed, setFailed] = useState(false);

  const savedRoles = facts.filter((f) => f.type === "work" && f.confirmed).length;
  const needsConsent = status === "signed_out";

  async function pasteFromClipboard() {
    try {
      setJdText(await navigator.clipboard.readText());
      setJdFile(null);
    } catch {
      setError(t("clipboardBlocked"));
    }
  }

  async function build() {
    setError(null);
    const hasCv = !!cvFile || (pasteCv && cvText.trim().length > 0) || savedRoles > 0;
    if (!hasCv) return setError(t("needCv"));
    if (!jdFile && !jdText.trim()) return setError(t("needJob"));
    if (needsConsent && !agree) return setError(t("needConsent"));

    setFailed(false);
    setRunning("cv");
    try {
      if (needsConsent) {
        await app.startGuest();
        await new LocalRepo().addConsents([consentRecord("core", true)]);
      }
      let profile = app.profile;
      if (!profile?.onboarded) {
        const country = profile?.target_country ?? profile?.home_country ?? app.detectedCountry;
        await app.updateProfile({ onboarded: true, home_country: profile?.home_country ?? country, target_country: profile?.target_country ?? country });
        profile = profile ? { ...profile, onboarded: true } : null;
      }
      const { appId } = await runQuick(
        { cvFile: pasteCv ? null : cvFile, cvText: pasteCv ? cvText : "", jdFile, jdText, useAi: true },
        {
          facts,
          cvs: app.cvs,
          profile: profile ?? { ...emptyProfile, target_country: app.detectedCountry, home_country: app.detectedCountry },
          saveFacts: app.saveFacts,
          saveCv: app.saveCv,
          saveApplication: app.saveApplication,
        },
        setRunning,
      );
      router.push(`/quick/review?app=${appId}`);
    } catch (err) {
      setRunning(null);
      if (err instanceof QuickError) setError(t(err.code === "need_cv" ? "needCv" : "needJob"));
      else if (err instanceof ExtractError) setError(te(err.code));
      else {
        setFailed(true);
        setError(te(errorKey(err)));
      }
    }
  }

  if (running) {
    const at = steps.indexOf(running);
    return (
      <div className="flex flex-col gap-6 pt-6" aria-live="polite">
        <div>
          <h1 className="font-display text-4xl font-semibold leading-tight text-ink-strong">{t("buildingTitle")}</h1>
          <p className="mt-2 text-ink-2">{t("buildingLead")}</p>
        </div>
        <ol className="flex flex-col gap-3">
          {steps.map((s, i) => (
            <li key={s} className={cx("flex items-center gap-3 rounded-xl border px-4 py-3", i === at ? "border-accent bg-accent-soft" : "border-line bg-surface", i > at && "opacity-50")}>
              <span aria-hidden className={cx("flex size-6 items-center justify-center rounded-full text-xs", i < at ? "bg-accent text-accent-ink" : "border border-accent text-accent-strong")}>
                {i < at ? "✓" : i === at ? <span className="size-2 animate-pulse rounded-full bg-accent" /> : ""}
              </span>
              <span className={cx(i === at && "font-medium text-ink-strong")}>{t(`step.${s}`)}</span>
            </li>
          ))}
        </ol>
        <p className="text-sm text-ink-2">{t("buildingNote")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="pt-4">
        <h1 className="font-display text-[2.6rem] font-semibold leading-[1.05] text-ink-strong">{t("title")}</h1>
        <p className="mt-3 text-lg font-light text-ink-2">{t("lead")}</p>
      </div>

      <StepCard n={1} title={t("cvStep")} hint={t("cvFormats")}>
        {pasteCv ? (
          <div className="flex flex-col gap-2">
            <TextArea label={t("pasteCvLabel")} hint={t("pasteCvHint")} value={cvText} onChange={(e) => setCvText(e.target.value)} rows={8} />
            <button type="button" className="self-start text-sm text-accent-strong underline" onClick={() => setPasteCv(false)}>
              {t("useUpload")}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <FilePick label={t("uploadCv")} file={cvFile} onPick={setCvFile} primary />
            <p className="text-sm text-ink-2">
              <button type="button" className="text-accent-strong underline" onClick={() => setPasteCv(true)}>
                {t("noCv")}
              </button>{" "}
              <Link href={status === "ready" ? "/cvs" : "/welcome"} className="underline">
                {t("buildFromScratch")}
              </Link>
            </p>
            {savedRoles > 0 && !cvFile && <p className="text-sm text-ink-2">{t("useSaved", { count: savedRoles })}</p>}
          </div>
        )}
      </StepCard>

      <StepCard n={2} title={t("jobStep")} hint={t("jobHint")}>
        <div className="flex flex-col gap-2">
          {jdFile ? (
            <FilePick label={t("uploadJd")} file={jdFile} onPick={setJdFile} />
          ) : (
            <>
              <label className="sr-only" htmlFor="jd">
                {t("jdLabel")}
              </label>
              <textarea
                id="jd"
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                rows={6}
                placeholder={t("jdPlaceholder")}
                className="w-full rounded-xl border border-line bg-bg p-3 text-base text-ink placeholder:text-ink-2/70 focus:border-accent focus:outline-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <FilePick label={t("uploadJd")} file={null} onPick={setJdFile} />
                <button type="button" onClick={pasteFromClipboard} className="min-h-14 rounded-xl border border-dashed border-line px-3 text-base text-ink hover:border-accent">
                  {t("pasteClipboard")}
                </button>
              </div>
            </>
          )}
        </div>
      </StepCard>

      {needsConsent && (
        <Checkbox
          checked={agree}
          onChange={(v) => {
            setAgree(v);
            if (v) setError(null);
          }}
          label={
            <span className="text-sm">
              {consentTexts.core.text}{" "}
              <Link href="/privacy" className="underline">
                {t("readPrivacy")}
              </Link>
            </span>
          }
        />
      )}

      {error && (
        <Notice tone="danger" action={failed ? <Button variant="secondary" onClick={build}>{t("tryAgain")}</Button> : undefined}>
          {error}
        </Notice>
      )}

      <div className="flex flex-col gap-2">
        <Button className="min-h-14 w-full text-lg" disabled={status === "loading" || !online} onClick={build}>
          {t("build")}
        </Button>
        <p className="text-center text-sm text-ink-2">{t("priceLine", { price: formatMoney(products.cv_download.amount) })}</p>
        <p className="text-center text-xs text-ink-2">{t("neverSold")}</p>
      </div>
    </div>
  );
}
