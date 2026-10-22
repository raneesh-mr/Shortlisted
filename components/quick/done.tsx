"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useApp } from "@/components/app-provider";
import { Button, LinkButton, Notice, Spinner } from "@/components/ui";
import { errorKey } from "@/lib/client-api";
import { buildCvDocument } from "@/lib/cv/document";
import { downloadPaidCv, payHref } from "@/lib/pay/client";

export function QuickDone() {
  const t = useTranslations("quick");
  const te = useTranslations("errors");
  const params = useSearchParams();
  const { status, cvs, facts, applications, paidCvIds } = useApp();
  const cvId = params.get("cv") ?? "";
  const cv = cvs.find((c) => c.id === cvId) ?? null;
  const app = applications.find((a) => a.cv_id === cvId) ?? null;
  const [busy, setBusy] = useState<"pdf" | "docx" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (status === "loading") return <Spinner label={t("preparing")} />;
  if (!cv) return <Notice tone="warn">{t("notFound")}</Notice>;
  if (!paidCvIds.has(cv.id)) {
    return (
      <Notice tone="warn" action={<Link href={payHref(cv.id)} className="font-semibold underline">{t("payNow")}</Link>}>
        {t("notPaid")}
      </Notice>
    );
  }

  async function download(format: "pdf" | "docx") {
    if (!cv) return;
    setBusy(format);
    setError(null);
    try {
      const doc = buildCvDocument(cv, facts);
      await downloadPaidCv(cv.id, format, `${doc.name || cv.title} ${doc.document_name}`);
    } catch (err) {
      setError(te(errorKey(err)));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-5 pt-4">
      <div>
        <h1 className="font-display text-4xl font-semibold text-ink-strong">
          {t("doneTitle")}
          <span className="text-accent-strong">.</span>
        </h1>
        <p className="mt-2 text-sm text-ink-2">{t("doneLead")}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Button className="min-h-14 w-full text-lg" disabled={busy !== null} onClick={() => download("pdf")}>
          {busy === "pdf" ? t("preparing") : t("downloadPdf")}
        </Button>
        <Button variant="secondary" className="w-full" disabled={busy !== null} onClick={() => download("docx")}>
          {busy === "docx" ? t("preparing") : t("downloadDocx")}
        </Button>
        {error && <Notice tone="danger">{error}</Notice>}
      </div>

      <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-sm uppercase tracking-wider text-ink-2">{t("nextTitle")}</h2>
        {app && (
          <LinkButton variant="ghost" className="justify-start px-0" href={`/apply/compose?id=${app.id}`}>
            {t("writeEmail")}
          </LinkButton>
        )}
        <LinkButton variant="ghost" className="justify-start px-0" href="/tracker">
          {t("track")}
        </LinkButton>
        <LinkButton variant="ghost" className="justify-start px-0" href="/">
          {t("another")}
        </LinkButton>
      </section>
      <p className="text-center text-xs text-ink-2">{t("againAnyTime")}</p>
    </div>
  );
}
