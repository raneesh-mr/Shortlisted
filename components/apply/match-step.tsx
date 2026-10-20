"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { factLabel } from "@/lib/jd/match";
import type { MatchItem, MatchLevel, MatchResult } from "@/lib/jd/schema";
import type { Fact, FactOf } from "@/lib/model";
import { Button, Card, Checkbox, Notice, Select, Spinner, TextArea, cx } from "../ui";

export interface GapAnswer {
  text: string;
  workId: string | null;
  asSkill: boolean;
}

const LEVELS: MatchLevel[] = ["strong", "partial", "gap"];
const levelStyle: Record<MatchLevel, string> = { strong: "bg-ok-soft", partial: "bg-warn-soft", gap: "bg-surface-2" };

function GapQuestion({ item, works, onAnswer, onNotDone }: { item: MatchItem; works: FactOf<"work">[]; onAnswer: (a: GapAnswer) => Promise<void>; onNotDone: () => void }) {
  const t = useTranslations("tailor");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [workId, setWorkId] = useState<string>(works[0]?.id ?? "");
  const [asSkill, setAsSkill] = useState(item.kind === "tool");
  const [busy, setBusy] = useState(false);
  const canSave = text.trim().length > 0 ? Boolean(workId) : asSkill;

  if (!open) {
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {t("yesIHave")}
        </Button>
        <Button variant="ghost" onClick={onNotDone}>
          {t("haventDone")}
        </Button>
      </div>
    );
  }
  return (
    <div className="mt-3 flex flex-col gap-3 rounded-xl border border-line p-3">
      <TextArea label={t("answerLabel")} hint={t("answerHint")} rows={3} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      {text.trim() && (
        <Select
          label={t("answerRole")}
          value={workId}
          onChange={(e) => setWorkId(e.target.value)}
          options={[{ value: "", label: t("chooseRole") }, ...works.map((w) => ({ value: w.id, label: `${w.data.title} · ${w.data.employer}` }))]}
        />
      )}
      <Checkbox checked={asSkill} onChange={setAsSkill} label={t("asSkill", { skill: item.text.length <= 60 ? item.text : t("thisSkill") })} />
      <div className="flex gap-2">
        <Button
          disabled={!canSave || busy}
          onClick={async () => {
            setBusy(true);
            await onAnswer({ text: text.trim(), workId: workId || null, asSkill });
            setBusy(false);
          }}
        >
          {t("saveFact")}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}

export function MatchStep({
  match,
  stale,
  facts,
  gaps,
  busy,
  onAnswer,
  onNotDone,
  onUndoNotDone,
  onRematch,
  onNext,
  onBack,
}: {
  match: MatchResult | null;
  stale: boolean;
  facts: Fact[];
  gaps: Record<string, "answered" | "not_done">;
  busy: boolean;
  onAnswer: (item: MatchItem, a: GapAnswer) => Promise<void>;
  onNotDone: (item: MatchItem) => void;
  onUndoNotDone: (item: MatchItem) => void;
  onRematch: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const t = useTranslations("tailor");
  const byId = new Map(facts.map((f) => [f.id, f]));
  const works = facts.filter((f): f is FactOf<"work"> => f.type === "work" && f.confirmed);
  if (!match) return <Spinner label={t("matching")} />;
  const counts = Object.fromEntries(LEVELS.map((l) => [l, match.items.filter((i) => i.level === l).length])) as Record<MatchLevel, number>;
  const openGaps = match.items.filter((i) => i.level === "gap" && i.kind !== "responsibility" && !gaps[i.key]);

  return (
    <section className="flex flex-col gap-4">
      <Notice>{match.method === "ai" ? t("matchedAi") : t("matchedBasic")}</Notice>
      {stale && (
        <Notice tone="warn" action={<Button variant="secondary" onClick={onRematch} disabled={busy}>{t("recheck")}</Button>}>
          {t("stale")}
        </Notice>
      )}
      <p className="text-sm font-semibold" aria-live="polite">
        {t("counts", { strong: counts.strong, partial: counts.partial, gap: counts.gap })}
      </p>

      {LEVELS.map((level) => {
        const list = match.items.filter((i) => i.level === level);
        if (!list.length) return null;
        return (
          <section key={level} aria-labelledby={`lvl-${level}`}>
            <h2 id={`lvl-${level}`} className="mb-2 text-lg font-semibold">
              {t(`level.${level}`)}
            </h2>
            <ul className="flex flex-col gap-2">
              {list.map((item) => (
                <li key={item.key}>
                  <Card className={cx("p-3", levelStyle[level])}>
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="rounded bg-surface px-1.5 py-0.5 text-xs font-semibold">{t(`kind.${item.kind}`)}</span>
                      <span className="font-medium">{item.text}</span>
                    </div>
                    {item.fact_ids.length > 0 && (
                      <p className="mt-1 text-sm text-ink-2">
                        {t("fromFacts")}{" "}
                        {item.fact_ids
                          .map((id) => byId.get(id))
                          .filter((f): f is Fact => !!f)
                          .map((f) => `“${factLabel(f, byId)}”`)
                          .join("; ")}
                      </p>
                    )}
                    {item.note && gaps[item.key] !== "not_done" && <p className="mt-1 text-sm">{item.note}</p>}
                    {level === "gap" && gaps[item.key] === "not_done" && (
                      <p className="mt-1 text-sm">
                        {t("saidNotDone")}{" "}
                        <button type="button" className="min-h-11 font-semibold underline" onClick={() => onUndoNotDone(item)}>
                          {t("undo")}
                        </button>
                      </p>
                    )}
                    {level === "gap" && !gaps[item.key] && item.kind !== "responsibility" && (
                      <>
                        <p className="mt-2 text-sm font-medium">{t("gapQuestion")}</p>
                        <GapQuestion item={item} works={works} onAnswer={(a) => onAnswer(item, a)} onNotDone={() => onNotDone(item)} />
                      </>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {openGaps.length > 0 && <p className="text-sm text-ink-2">{t("openGaps", { count: openGaps.length })}</p>}
      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack}>
          {t("back")}
        </Button>
        <Button className="flex-1" onClick={onNext} disabled={busy}>
          {t("toTailor")}
        </Button>
      </div>
    </section>
  );
}
