"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { Paragraph, Slot } from "@/lib/email/assemble";
import type { LintFinding, LintReport } from "@/lib/humanizer/lint";
import { Button, Card, TextArea, cx } from "./ui";

const REWRITABLE: Slot[] = ["opener", "evidence", "close"];

/** Offsets of the subject and each paragraph inside the linted text (`subject\n\nbody`). */
function layout(subject: string, paragraphs: Paragraph[]) {
  let offset = subject.length + 2;
  return paragraphs.map((p) => {
    const text = p.text.trim();
    if (!text) return { start: -1, end: -1 };
    const range = { start: offset, end: offset + text.length };
    offset = range.end + 2;
    return range;
  });
}

function highlight(text: string, base: number, findings: LintFinding[], label: (f: LintFinding) => string): ReactNode[] {
  const inside = findings
    .filter((f) => f.end > f.start && f.start >= base && f.end <= base + text.length)
    .sort((a, b) => a.start - b.start);
  const out: ReactNode[] = [];
  let cursor = 0;
  for (const f of inside) {
    const s = f.start - base;
    const e = f.end - base;
    if (s < cursor) continue;
    out.push(text.slice(cursor, s));
    out.push(
      <mark key={`${f.rule}-${f.start}`} className={cx("rounded px-0.5", f.severity === "error" ? "bg-danger-soft underline decoration-danger decoration-wavy" : "bg-warn-soft")} title={label(f)}>
        {text.slice(s, e)}
        <span className="sr-only"> ({label(f)})</span>
      </mark>,
    );
    cursor = e;
  }
  out.push(text.slice(cursor));
  return out;
}

export function EmailEditor({
  subject,
  paragraphs,
  lint,
  onParagraphs,
  onAnotherTake,
  rewriting,
}: {
  subject: string;
  paragraphs: Paragraph[];
  lint: LintReport;
  onParagraphs: (next: Paragraph[]) => void;
  onAnotherTake?: (slot: "opener" | "evidence" | "close") => void;
  rewriting: Slot | null;
}) {
  const t = useTranslations("compose");
  const tl = useTranslations("lint");
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const ranges = layout(subject, paragraphs);
  const label = (f: LintFinding) => tl(`rules.${f.rule}`);

  return (
    <Card className="flex flex-col gap-3">
      {paragraphs.map((p, i) => {
        const range = ranges[i]!;
        if (editing === i) {
          return (
            <div key={i} className="flex flex-col gap-2">
              <TextArea label={t(`slot.${p.slot}`)} value={draft} onChange={(e) => setDraft(e.target.value)} rows={Math.max(3, draft.split("\n").length + 1)} autoFocus />
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    onParagraphs(paragraphs.map((x, j) => (j === i ? { ...x, text: draft } : x)));
                    setEditing(null);
                  }}
                >
                  {t("done")}
                </Button>
                <Button variant="ghost" onClick={() => setEditing(null)}>
                  {t("cancel")}
                </Button>
              </div>
            </div>
          );
        }
        if (!p.text.trim()) return null;
        return (
          <div key={i} className="group">
            <button
              type="button"
              onClick={() => {
                setEditing(i);
                setDraft(p.text);
              }}
              className="w-full whitespace-pre-wrap rounded-lg p-1 text-start leading-relaxed hover:bg-surface-2"
              aria-label={t("editParagraph", { slot: t(`slot.${p.slot}`) })}
            >
              {highlight(p.text.trim(), range.start, lint.findings, label)}
            </button>
            {onAnotherTake && REWRITABLE.includes(p.slot) && (
              <Button variant="ghost" className="text-sm" disabled={rewriting !== null} onClick={() => onAnotherTake(p.slot as "opener" | "evidence" | "close")}>
                {rewriting === p.slot ? t("rewriting") : t("anotherTake")}
              </Button>
            )}
          </div>
        );
      })}
    </Card>
  );
}

export function LintSummary({ lint }: { lint: LintReport }) {
  const t = useTranslations("compose");
  const tl = useTranslations("lint");
  const errors = lint.findings.filter((f) => f.severity === "error").length;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold" aria-live="polite">
        {lint.findings.length === 0 ? t("lintClean") : t("lintFlags", { count: lint.findings.length, errors })}
      </p>
      {lint.findings.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {lint.findings.map((f, i) => (
            <li key={i} className="flex gap-2">
              <span className={cx("shrink-0 self-start rounded px-1.5 py-0.5 text-xs font-semibold", f.severity === "error" ? "bg-danger-soft" : "bg-warn-soft")}>
                {f.severity === "error" ? t("fix") : t("check")}
              </span>
              <span>
                <span className="font-medium">{tl(`rules.${f.rule}`)}</span>
                {f.text && f.rule !== "uniform_length" && f.rule !== "bullet_parallelism" ? `: “${f.text}”` : ""}
                {f.hint ? <span className="text-ink-2"> {f.hint}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
