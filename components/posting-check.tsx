"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { checkPosting } from "@/lib/tracker/scam";
import { Card } from "./ui";

/** "Things to double-check" about a posting. Questions to ask, never a verdict. */
export function PostingCheck({ text, company, recruiterEmail, compact = false }: { text: string; company?: string; recruiterEmail?: string; compact?: boolean }) {
  const t = useTranslations("postingCheck");
  const results = useMemo(() => checkPosting(text, { company, recruiterEmail }), [text, company, recruiterEmail]);
  const found = results.filter((r) => r.found);
  if (compact && found.length === 0) return null;

  return (
    <Card className={found.length ? "border-warn" : undefined}>
      <h2 className="font-semibold">{found.length ? t("titleFound", { count: found.length }) : t("titleNone")}</h2>
      <p className="mt-1 text-sm text-ink-2">{found.length ? t("leadFound") : t("leadNone")}</p>
      {found.length > 0 && (
        <ul className="mt-3 flex flex-col gap-3">
          {found.map((r) => (
            <li key={r.id} className="rounded-xl bg-warn-soft p-3 text-sm">
              <p className="font-semibold">{t(`check.${r.id}.title`)}</p>
              <p className="mt-1">{t(`check.${r.id}.ask`)}</p>
              {r.evidence.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {r.evidence.map((e, i) => (
                    <li key={i} className="rounded bg-surface px-2 py-1 text-ink-2">
                      “{e}”
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      <details className="mt-3 text-sm">
        <summary className="min-h-11 cursor-pointer font-medium">{t("tipsTitle")}</summary>
        <ul className="mt-1 list-disc ps-5 text-ink-2">
          {(["tip1", "tip2", "tip3", "tip4"] as const).map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ul>
      </details>
    </Card>
  );
}
