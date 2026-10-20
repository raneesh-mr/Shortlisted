"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { buildCvDocument } from "@/lib/cv/document";
import { keywordCoverage } from "@/lib/jd/coverage";
import type { JdAnalysis, TailorChange, TailorDecision } from "@/lib/jd/schema";
import type { Cv, Fact } from "@/lib/model";
import { lintTailored, previewTailored } from "@/lib/tailor/apply";
import { Button, Card, Notice, Spinner, TextArea, cx } from "../ui";

export interface TailorState {
  method: "ai" | "basic";
  changes: TailorChange[];
  decisions: Record<string, TailorDecision>;
  tailored_cv_id: string | null;
}

function Coverage({ before, after, total }: { before: ReturnType<typeof keywordCoverage>; after: ReturnType<typeof keywordCoverage>; total: number }) {
  const t = useTranslations("tailor");
  const b = before.filter((c) => c.covered).length;
  const a = after.filter((c) => c.covered).length;
  return (
    <Card>
      <p className="font-semibold">{t("coverageTitle")}</p>
      <p className="mt-1 text-sm" aria-live="polite">
        {a === b ? t("coverageSame", { count: a, total }) : t("coverageChange", { before: b, after: a, total })}
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {after.map((c) => (
          <li key={c.keyword} className={cx("rounded-full px-3 py-1 text-sm", c.covered ? "bg-ok-soft" : "border border-dashed border-line")}>
            {c.covered ? "✓ " : ""}
            {c.keyword}
            <span className="sr-only"> ({c.covered ? t("covered") : t("notCovered")})</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-ink-2">{t("coverageRule")}</p>
    </Card>
  );
}

function ChangeCard({ change, decision, onDecide }: { change: TailorChange; decision: TailorDecision; onDecide: (d: TailorDecision) => void }) {
  const t = useTranslations("tailor");
  const [editing, setEditing] = useState(false);
  const editable = change.kind === "summary" || change.kind === "wording";
  const after = change.kind === "summary" || change.kind === "wording" ? (decision.edited ?? change.after) : "";
  const [draft, setDraft] = useState(after);

  return (
    <Card className={cx("flex flex-col gap-2", decision.status === "accepted" && "border-ok", decision.status === "rejected" && "opacity-60")}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          {change.kind === "summary" && t("change.summary")}
          {change.kind === "wording" && t("change.wording")}
          {change.kind === "order" && t("change.order", { group: change.group })}
          {change.kind === "include" && t("change.include")}
        </p>
        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">{t(`status.${decision.status}`)}</span>
      </div>

      {editable && (
        <div className="flex flex-col gap-1 text-sm">
          <p>
            <span className="font-medium">{t("before")}: </span>
            <span className="text-ink-2 line-through">{change.before || t("none")}</span>
          </p>
          {editing ? (
            <TextArea label={t("after")} rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
          ) : (
            <p>
              <span className="font-medium">{t("after")}: </span>
              {after}
              {decision.edited !== undefined && <span className="text-ink-2"> ({t("yourEdit")})</span>}
            </p>
          )}
        </div>
      )}
      {change.kind === "order" && (
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          {(["before", "after"] as const).map((side) => (
            <div key={side}>
              <p className="font-medium">{t(side)}</p>
              <ol className="list-decimal ps-5">
                {change[side].map((id) => (
                  <li key={id}>{change.labels[id]}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
      {change.kind === "include" && (
        <p className="text-sm">
          “{change.text}” <span className="text-ink-2">{change.reason}</span>
        </p>
      )}

      {change.flags.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {change.flags.map((f, i) => (
            <li key={i} className="rounded-lg bg-warn-soft p-2">
              <span className="font-semibold">{t(`flag.${f.rule}`)}: </span>
              {f.message}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {editing ? (
          <>
            <Button
              onClick={() => {
                const proposed = change.kind === "summary" || change.kind === "wording" ? change.after : "";
                onDecide({ status: "accepted", edited: draft.trim() === proposed ? undefined : draft.trim() });
                setEditing(false);
              }}
              disabled={!draft.trim()}
            >
              {t("saveAccept")}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              {t("cancel")}
            </Button>
          </>
        ) : (
          <>
            <Button variant={decision.status === "accepted" ? "primary" : "secondary"} onClick={() => onDecide({ ...decision, status: "accepted" })} aria-pressed={decision.status === "accepted"}>
              {t("accept")}
            </Button>
            {editable && (
              <Button
                variant="secondary"
                onClick={() => {
                  setDraft(after);
                  setEditing(true);
                }}
              >
                {t("edit")}
              </Button>
            )}
            <Button variant={decision.status === "rejected" ? "primary" : "ghost"} onClick={() => onDecide({ ...decision, status: "rejected" })} aria-pressed={decision.status === "rejected"}>
              {t("reject")}
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

export function TailorStep({
  base,
  tailored,
  facts,
  analysis,
  state,
  busy,
  onPropose,
  onDecide,
  onCreate,
  onSkip,
  onBack,
  onNext,
}: {
  base: Cv;
  tailored: Cv | null;
  facts: Fact[];
  analysis: JdAnalysis;
  state: TailorState | null;
  busy: boolean;
  onPropose: () => void;
  onDecide: (id: string, d: TailorDecision) => void;
  onCreate: () => void;
  onSkip: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("tailor");
  const tl = useTranslations("lint");
  const decisions = useMemo(() => state?.decisions ?? {}, [state]);
  const changes = useMemo(() => state?.changes ?? [], [state]);
  const decisionOf = (id: string): TailorDecision => decisions[id] ?? { status: "pending" };

  const before = useMemo(() => keywordCoverage(buildCvDocument(base, facts), analysis.keywords), [base, facts, analysis.keywords]);
  const preview = useMemo(() => (state ? previewTailored(base, changes, decisions, facts) : null), [state, base, changes, decisions, facts]);
  const after = useMemo(() => (preview ? keywordCoverage(preview, analysis.keywords) : before), [preview, analysis.keywords, before]);
  const lint = useMemo(() => (preview ? lintTailored(preview, facts) : []), [preview, facts]);
  const accepted = changes.filter((c) => decisionOf(c.id).status === "accepted").length;
  const pending = changes.filter((c) => decisionOf(c.id).status === "pending");

  if (tailored) {
    return (
      <section className="flex flex-col gap-4">
        <Notice tone="ok" title={t("createdTitle")}>
          {t("created", { title: tailored.title })}
        </Notice>
        <Coverage before={before} after={keywordCoverage(buildCvDocument(tailored, facts), analysis.keywords)} total={analysis.keywords.length} />
        <div className="flex flex-wrap gap-3">
          <Link href={`/cvs/edit?id=${tailored.id}`} className="inline-flex min-h-11 items-center rounded-xl border border-line px-4">
            {t("openTailored")}
          </Link>
          <Button className="flex-1" onClick={onNext}>
            {t("toDetails")}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <p className="text-ink-2">{t("tailorLead", { title: base.title })}</p>
      {!state ? (
        <>
          <Coverage before={before} after={before} total={analysis.keywords.length} />
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={onBack}>
              {t("back")}
            </Button>
            <Button className="flex-1" onClick={onPropose} disabled={busy}>
              {busy ? t("suggesting") : t("suggest")}
            </Button>
          </div>
          <Button variant="ghost" onClick={onSkip}>
            {t("skip")}
          </Button>
        </>
      ) : (
        <>
          <Notice>{state.method === "ai" ? t("proposedAi") : t("proposedBasic")}</Notice>
          {busy && <Spinner label={t("suggesting")} />}
          {changes.length === 0 ? (
            <p className="text-ink-2">{t("noChanges")}</p>
          ) : (
            <>
              {pending.some((c) => c.flags.length === 0) && (
                <Button
                  variant="secondary"
                  onClick={() => pending.filter((c) => c.flags.length === 0).forEach((c) => onDecide(c.id, { status: "accepted" }))}
                >
                  {t("acceptClean", { count: pending.filter((c) => c.flags.length === 0).length })}
                </Button>
              )}
              <ul className="flex flex-col gap-3">
                {changes.map((c) => (
                  <li key={c.id}>
                    <ChangeCard change={c} decision={decisionOf(c.id)} onDecide={(d) => onDecide(c.id, d)} />
                  </li>
                ))}
              </ul>
            </>
          )}
          <Coverage before={before} after={after} total={analysis.keywords.length} />
          {lint.length > 0 && (
            <Card>
              <p className="font-semibold">{t("lintTitle", { count: lint.length })}</p>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {lint.map((f, i) => (
                  <li key={i}>
                    <span className="font-medium">{tl(`rules.${f.rule}`)}</span>
                    {f.text && f.rule !== "bullet_parallelism" ? `: “${f.text}”` : ""} <span className="text-ink-2">{f.hint}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {pending.length > 0 && <p className="text-sm text-ink-2">{t("pendingNote", { count: pending.length })}</p>}
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={onBack}>
              {t("back")}
            </Button>
            <Button className="flex-1" onClick={onCreate} disabled={busy || accepted === 0}>
              {t("create", { count: accepted })}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={onPropose} disabled={busy}>
              {t("suggestAgain")}
            </Button>
            <Button variant="ghost" onClick={onSkip}>
              {t("skip")}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
