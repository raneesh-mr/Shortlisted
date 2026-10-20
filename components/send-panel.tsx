"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, downloadBlob, errorKey, safeFilename } from "@/lib/client-api";
import { MAILTO_SOFT_LIMIT, buildEml, mailtoHref } from "@/lib/email/send";
import type { Cv, Fact } from "@/lib/model";
import { Button, Card, Checkbox, Notice, cx } from "./ui";

/** Copy / open in mail app / .eml, plus the attach-your-CV reminder. We never send email ourselves. */
export function SendPanel({
  to,
  subject,
  body,
  cv,
  facts,
  online,
  onSent,
}: {
  to: string;
  subject: string;
  body: string;
  cv: Cv | null;
  facts: Fact[];
  online: boolean;
  onSent: () => void;
}) {
  const t = useTranslations("compose");
  const te = useTranslations("errors");
  const [copied, setCopied] = useState<"body" | "subject" | null>(null);
  const [attached, setAttached] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const href = mailtoHref(to, subject, body);

  async function copy(what: "body" | "subject") {
    try {
      await navigator.clipboard.writeText(what === "body" ? body : subject);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError(t("copyFailed"));
    }
  }

  async function downloadPdf() {
    if (!cv) return;
    setPdfBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cv, facts, mode: "file" }),
      });
      downloadBlob(await res.blob(), `${safeFilename(cv.title)}.pdf`);
    } catch (err) {
      setError(te(errorKey(err)));
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t("sendTitle")}</h2>
      <p className="text-sm text-ink-2">{t("sendLead")}</p>

      <div className="rounded-xl border border-warn bg-warn-soft p-3">
        <Checkbox checked={attached} onChange={setAttached} label={<span className="font-semibold">{t("attachReminder")}</span>} />
        <p className="mt-1 text-sm text-ink-2">{t("attachWhy")}</p>
        {cv ? (
          <Button variant="secondary" className="mt-2 w-full" disabled={pdfBusy || !online} onClick={downloadPdf}>
            {pdfBusy ? t("preparing") : t("downloadCvPdf", { title: cv.title })}
          </Button>
        ) : (
          <p className="mt-2 text-sm">{t("noCv")}</p>
        )}
      </div>

      <a href={href} className={cx("inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 font-medium text-accent-ink", !attached && "opacity-90")}>
        {t("openMailApp")}
      </a>
      {href.length > MAILTO_SOFT_LIMIT && <p className="text-sm text-ink-2">{t("longMailto")}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => copy("subject")}>
          {copied === "subject" ? t("copied") : t("copySubject")}
        </Button>
        <Button variant="secondary" onClick={() => copy("body")}>
          {copied === "body" ? t("copied") : t("copyBody")}
        </Button>
      </div>
      <Button
        variant="secondary"
        onClick={() => downloadBlob(new Blob([buildEml({ to, subject, body })], { type: "message/rfc822" }), `${safeFilename(subject)}.eml`)}
      >
        {t("downloadEml")}
      </Button>
      <p className="text-sm text-ink-2">{t("emlHint")}</p>
      {error && <Notice tone="danger">{error}</Notice>}
      <Button variant="ghost" onClick={onSent}>
        {t("markSent")}
      </Button>
    </Card>
  );
}
