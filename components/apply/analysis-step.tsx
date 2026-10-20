"use client";

import { useTranslations } from "next-intl";
import type { JdAnalysis } from "@/lib/jd/schema";
import { Button, Card, Notice, Select, TextInput } from "../ui";
import { ListEditor } from "./list-editor";

export function AnalysisStep({
  analysis,
  onChange,
  onReanalyse,
  busy,
  onNext,
  onBack,
}: {
  analysis: JdAnalysis;
  onChange: (a: JdAnalysis) => void;
  onReanalyse: () => void;
  busy: boolean;
  onNext: () => void;
  onBack: () => void;
}) {
  const t = useTranslations("tailor");
  const set = (patch: Partial<JdAnalysis>) => onChange({ ...analysis, ...patch, edited: true });

  return (
    <section className="flex flex-col gap-4">
      <Notice>{analysis.method === "ai" ? t("analysedAi") : t("analysedBasic")}</Notice>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label={t("jobTitle")} value={analysis.title} maxLength={160} onChange={(e) => set({ title: e.target.value })} />
        <TextInput label={t("company")} value={analysis.company} maxLength={160} onChange={(e) => set({ company: e.target.value })} />
        <Select
          label={t("seniority")}
          value={analysis.seniority}
          onChange={(e) => set({ seniority: e.target.value as JdAnalysis["seniority"] })}
          options={(["entry", "mid", "senior", "lead", "executive", "unspecified"] as const).map((v) => ({ value: v, label: t(`seniorityName.${v}`) }))}
        />
        <Select
          label={t("workMode")}
          value={analysis.work_mode}
          onChange={(e) => set({ work_mode: e.target.value as JdAnalysis["work_mode"] })}
          options={(["onsite", "hybrid", "remote", "unspecified"] as const).map((v) => ({ value: v, label: t(`workModeName.${v}`) }))}
        />
        <TextInput label={t("location")} value={analysis.location} maxLength={160} onChange={(e) => set({ location: e.target.value })} />
      </div>
      <Card className="flex flex-col gap-5">
        <ListEditor label={t("mustHave")} items={analysis.must_have} onChange={(must_have) => set({ must_have })} />
        <ListEditor label={t("niceToHave")} items={analysis.nice_to_have} onChange={(nice_to_have) => set({ nice_to_have })} />
        <ListEditor label={t("tools")} items={analysis.tools} onChange={(tools) => set({ tools })} chips max={40} />
        <ListEditor label={t("responsibilities")} items={analysis.responsibilities} onChange={(responsibilities) => set({ responsibilities })} />
        <ListEditor label={t("keywords")} items={analysis.keywords} onChange={(keywords) => set({ keywords })} chips max={14} />
      </Card>
      {(analysis.language_hints.length > 0 || analysis.spelling_hint) && (
        <p className="text-sm text-ink-2">
          {[
            analysis.language_hints.length ? t("languages", { list: analysis.language_hints.join(", ") }) : "",
            analysis.spelling_hint ? t("spellingHint", { spelling: analysis.spelling_hint }) : "",
          ]
            .filter(Boolean)
            .join(" ")}
        </p>
      )}
      {analysis.removed.length > 0 && (
        <details className="rounded-xl border border-line bg-surface p-3 text-sm">
          <summary className="min-h-11 cursor-pointer font-medium">{t("removedTitle", { count: analysis.removed.length })}</summary>
          <p className="mt-2 text-ink-2">{t("removedLead")}</p>
          <ul className="mt-2 flex flex-col gap-2">
            {analysis.removed.map((r, i) => (
              <li key={i} className="whitespace-pre-wrap rounded-lg bg-surface-2 p-2">
                {r}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={onBack}>
          {t("back")}
        </Button>
        <Button variant="ghost" onClick={onReanalyse} disabled={busy}>
          {busy ? t("analysing") : t("reanalyse")}
        </Button>
        <Button className="flex-1" onClick={onNext} disabled={busy}>
          {t("toMatch")}
        </Button>
      </div>
    </section>
  );
}
