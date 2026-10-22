"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { formatMoney, products } from "@/config/pricing";
import { useApp } from "@/components/app-provider";
import { CvPreview, type LineTarget } from "@/components/cv-preview";
import { Sheet } from "@/components/sheet";
import { Button, Notice, Spinner, TextArea, cx } from "@/components/ui";
import { buildCvDocument, renderedToText } from "@/lib/cv/document";
import { templates } from "@/lib/cv/templates";
import { makeFact, nowIso, templateIds, type Fact } from "@/lib/model";
import { payHref } from "@/lib/pay/client";

export function QuickReview() {
  const t = useTranslations("quick");
  const te = useTranslations("errors");
  const router = useRouter();
  const params = useSearchParams();
  const { status, applications, cvs, facts, saveCv, saveFacts, saveApplication, paidCvIds } = useApp();
  const app = applications.find((a) => a.id === params.get("app")) ?? null;
  const cv = app?.cv_id ? (cvs.find((c) => c.id === app.cv_id) ?? null) : null;

  const [editing, setEditing] = useState<LineTarget | null>(null);
  const [draft, setDraft] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quick = app?.quick ?? null;
  // While reviewing, the facts we just read count as yours, so the preview shows them.
  const pending = new Set(quick?.reviewed ? [] : (quick?.fact_ids ?? []));
  const working: Fact[] = facts.map((f) => (pending.has(f.id) ? ({ ...f, confirmed: true } as Fact) : f));
  const doc = cv ? buildCvDocument(cv, working) : null;
  const flagged = new Set((quick?.reviewed ? [] : (quick?.check_ids ?? [])).filter((id) => !checked.has(id)));

  if (status === "loading" || (status === "ready" && !app && applications.length === 0 && params.get("app"))) return <Spinner label={t("buildingLead")} />;
  if (!app || !cv || !doc) return <Notice tone="warn" action={<Link href="/" className="font-semibold underline">{t("another")}</Link>}>{t("notFound")}</Notice>;

  const analysis = app.jd_analysis;
  const keywords = analysis?.keywords ?? [];
  const text = renderedToText(doc).toLowerCase();
  const shown = keywords.filter((k) => text.includes(k.toLowerCase())).length;
  const haveSkill = new Set(facts.filter((f) => f.type === "skill").map((f) => (f.data as { name: string }).name.toLowerCase()));
  const gap = (app.match?.items ?? []).find(
    (i) => i.level === "gap" && i.kind === "tool" && i.text.length <= 60 && !skipped.has(i.key) && !haveSkill.has(i.text.toLowerCase()),
  );
  const paid = paidCvIds.has(cv.id);
  const price = formatMoney(products.cv_download.amount);
  const heading = [analysis?.title || app.role, analysis?.company || app.company].filter(Boolean).join(" · ");

  function open(target: LineTarget) {
    setEditing(target);
    setDraft(target.text);
  }

  async function saveLine() {
    if (!editing || !cv) return;
    const next =
      editing.kind === "summary"
        ? { ...cv, content: { ...cv.content, summary: draft }, updated_at: nowIso() }
        : { ...cv, content: { ...cv.content, text_overrides: { ...cv.content.text_overrides, [editing.factId]: draft } }, updated_at: nowIso() };
    if (editing.kind === "fact") setChecked((s) => new Set(s).add(editing.factId));
    setEditing(null);
    await saveCv(next);
  }

  async function addSkill(name: string) {
    await saveFacts([makeFact("skill", { name })]);
    setAdded(name);
  }

  async function looksRight() {
    if (!app || !cv) return;
    setBusy(true);
    setError(null);
    try {
      if (quick && !quick.reviewed) {
        const ids = new Set(quick.fact_ids);
        const confirm = facts.filter((f) => ids.has(f.id) && !f.confirmed).map((f) => ({ ...f, confirmed: true, updated_at: nowIso() }) as Fact);
        if (confirm.length) await saveFacts(confirm);
        await saveApplication({ ...app, quick: { ...quick, reviewed: true }, updated_at: nowIso() });
      }
      router.push(paid ? `/quick/done?cv=${cv.id}` : payHref(cv.id));
    } catch {
      setError(te("server_error"));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-ink-2 hover:text-accent-strong">
          {t("back")}
        </Link>
        {heading && <p className="truncate ps-3 text-sm text-ink-2">{heading}</p>}
      </div>

      <h1 className="sr-only">{t("reviewTitle")}</h1>

      {keywords.length > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
          <p className="font-display text-4xl font-semibold text-accent-strong">
            {shown}/{keywords.length}
          </p>
          <p className="text-sm text-ink-2">{t("keywords")}</p>
        </div>
      )}

      {flagged.size > 0 && <Notice tone="warn">{t("checkNote", { count: flagged.size })}</Notice>}

      <div className="relative overflow-hidden rounded-xl">
        <CvPreview doc={doc} onSelect={open} selected={editing?.kind === "fact" ? editing.factId : null} flagged={flagged} />
        {!paid && (
          <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="-rotate-[28deg] select-none text-7xl font-bold tracking-[0.3em] text-neutral-900/[0.07]">{t("previewMark")}</span>
          </div>
        )}
      </div>
      {gap && !added && (
        <div className="rounded-2xl border border-accent/50 bg-accent-soft p-4">
          <p className="font-medium text-ink-strong">{t("gapQuestion", { skill: gap.text })}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button onClick={() => addSkill(gap.text)}>{t("gapYes")}</Button>
            <Button variant="secondary" onClick={() => setSkipped((s) => new Set(s).add(gap.key))}>
              {t("gapNo")}
            </Button>
          </div>
        </div>
      )}
      {added && <Notice tone="ok">{t("gapAdded", { skill: added })}</Notice>}

      <div>
        <p className="mb-2 text-sm text-ink-2">{t("template")}</p>
        <div className="flex gap-2" role="radiogroup" aria-label={t("template")}>
          {templateIds.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={cv.template_id === id}
              onClick={() => saveCv({ ...cv, template_id: id, updated_at: nowIso() })}
              className={cx(
                "min-h-11 flex-1 rounded-full border px-3 text-sm",
                cv.template_id === id ? "border-accent bg-accent-soft font-medium text-accent-strong" : "border-line text-ink",
              )}
            >
              {templates[id].label}
            </button>
          ))}
        </div>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}
      <div className="sticky bottom-0 -mx-4 flex flex-col gap-1 bg-bg/95 px-4 pb-4 pt-2 backdrop-blur">
        <Button className="min-h-14 w-full text-lg" disabled={busy} onClick={looksRight}>
          {paid ? t("looksRightPaid") : t("looksRight", { price })}
        </Button>
        <p className="text-center text-xs text-ink-2">{t("tapToEdit")}</p>
      </div>
      <Link href={`/cvs/edit?id=${cv.id}`} className="text-center text-sm text-ink-2 underline">
        {t("openBuilder")}
      </Link>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={t("editTitle")}>
        <div className="flex flex-col gap-3">
          <TextArea label={t("editTitle")} value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {t("cancel")}
            </Button>
            <Button onClick={saveLine} disabled={!draft.trim()}>
              {t("save")}
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
