"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { personalFields, sectionIds, spellings, type PersonalField, type SectionId } from "@/config/regions/schema";
import { useApp } from "@/components/app-provider";
import { CvPreview, type LineTarget } from "@/components/cv-preview";
import { CountrySelect, RegionSummary } from "@/components/region";
import { Button, Card, LinkButton, Notice, PageHeader, Select, Spinner, Switch, TextArea, TextInput, cx } from "@/components/ui";
import { track } from "@/lib/analytics";
import { runAtsCheck } from "@/lib/ats/check";
import { ApiClientError, apiFetch, errorKey } from "@/lib/client-api";
import { downloadPaidCv, payHref } from "@/lib/pay/client";
import { formatMoney, products } from "@/config/pricing";
import { buildCvDocument, defaultCvContent, effectiveSettings, sectionTitles } from "@/lib/cv/document";
import { templates } from "@/lib/cv/templates";
import { templateIds, type Cv, type CvVersion } from "@/lib/model";
import { defaultPersonalFields, getRegionPack, regionForCountry, regionPacks } from "@/lib/regions";

type Tab = "preview" | "settings" | "check" | "history";
const tabs: Tab[] = ["preview", "settings", "check", "history"];

function Builder() {
  const t = useTranslations("builder");
  const te = useTranslations("errors");
  const params = useSearchParams();
  const router = useRouter();
  const { cvs, facts, saveCv, saveFacts, repo, online, paidCvIds } = useApp();
  const id = params.get("id");
  const stored = cvs.find((c) => c.id === id) ?? null;

  const [cv, setCv] = useState<Cv | null>(stored);
  const [tab, setTab] = useState<Tab>("preview");
  const [selected, setSelected] = useState<LineTarget | null>(null);
  const [draftText, setDraftText] = useState("");
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [measure, setMeasure] = useState<{ pages: number; extractable: boolean } | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [versions, setVersions] = useState<CvVersion[] | null>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    // Adopt the stored CV once it has loaded.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!cv && stored) setCv(stored);
  }, [cv, stored]);

  // Debounced autosave.
  useEffect(() => {
    if (!cv) return;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setSaving("saving");
    const h = setTimeout(() => {
      saveCv(cv)
        .then(() => setSaving("saved"))
        .catch(() => setSaving("error"));
    }, 800);
    return () => clearTimeout(h);
    // saveCv identity changes with app state; the CV value is what matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cv]);

  const doc = useMemo(() => (cv ? buildCvDocument(cv, facts) : null), [cv, facts]);

  // Debounced real page count + text-extractability check from the server PDF renderer.
  useEffect(() => {
    if (!cv || !online) return;
    const h = setTimeout(async () => {
      try {
        const res = await apiFetch("/api/export/pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cv, facts, mode: "measure" }),
        });
        setMeasure((await res.json()) as { pages: number; extractable: boolean });
      } catch {
        setMeasure(null);
      }
    }, 1500);
    return () => clearTimeout(h);
  }, [cv, facts, online]);

  useEffect(() => {
    if (tab !== "history" || !cv || !repo) return;
    repo.listVersions(cv.id).then(setVersions).catch(() => setVersions([]));
  }, [tab, cv, repo]);

  if (!cv || !doc) {
    return cvs.length || !id ? <Notice tone="warn">{t("notFound")}</Notice> : <Spinner label={t("loading")} />;
  }

  const pack = getRegionPack(cv.region_id);
  const settings = effectiveSettings(cv.content, pack);
  const defaults = defaultPersonalFields(pack);
  const update = (fn: (c: Cv) => Cv) => setCv((prev) => (prev ? fn(prev) : prev));
  const updateContent = (patch: Partial<Cv["content"]>) => update((c) => ({ ...c, content: { ...c.content, ...patch } }));

  function select(target: LineTarget) {
    setSelected(target);
    setDraftText(target.text);
  }
  const selectedFactId = selected?.kind === "fact" ? selected.factId : null;
  const selectedFact = selectedFactId ? facts.find((f) => f.id === selectedFactId) : null;

  function applyEdit() {
    if (!selected) return;
    if (selected.kind === "summary") updateContent({ summary: draftText });
    else updateContent({ text_overrides: { ...cv!.content.text_overrides, [selected.factId]: draftText } });
    setSelected(null);
  }
  function resetEdit() {
    if (selected?.kind !== "fact") return;
    const next = { ...cv!.content.text_overrides };
    delete next[selected.factId];
    updateContent({ text_overrides: next });
    setSelected(null);
  }
  function hideSelected() {
    if (selected?.kind !== "fact") return;
    updateContent({ excluded_fact_ids: [...cv!.content.excluded_fact_ids, selected.factId] });
    setSelected(null);
  }
  function moveSelected(dir: -1 | 1) {
    if (!selectedFact) return;
    // Siblings: same fact type, and for bullets the same role.
    const siblings = doc!.sections
      .flatMap((s) => s.blocks)
      .flatMap((b) => (b.kind === "entry" ? [b.title, ...b.bullets] : b.kind === "inline" ? b.items : []))
      .map((l) => l.source_fact_id)
      .filter((fid): fid is string => !!fid)
      .filter((fid, i, a) => a.indexOf(fid) === i)
      .map((fid) => facts.find((f) => f.id === fid)!)
      .filter((f) => f && f.type === selectedFact!.type && (f.type !== "achievement" || (selectedFact!.type === "achievement" && f.data.work_id === selectedFact!.data.work_id)))
      .map((f) => f.id);
    const i = siblings.indexOf(selectedFact.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= siblings.length) return;
    [siblings[i], siblings[j]] = [siblings[j]!, siblings[i]!];
    const rest = cv!.content.order.filter((x) => !siblings.includes(x));
    updateContent({ order: [...siblings, ...rest] });
  }
  async function updateFact() {
    if (!selectedFact) return;
    const keyFor: Record<string, string> = { achievement: "text", work: "title", skill: "name", cert: "name", language: "name", education: "qualification" };
    const key = keyFor[selectedFact.type];
    if (!key) return;
    await saveFacts([{ ...selectedFact, data: { ...selectedFact.data, [key]: draftText } } as typeof selectedFact]);
    resetEdit();
  }

  function changeRegion(regionId: string) {
    const next = getRegionPack(regionId);
    update((c) => ({
      ...c,
      region_id: next.id,
      content: { ...c.content, sections: defaultCvContent(next, c.content.target_country).sections, personal: {}, paper: null, spelling: null },
    }));
  }

  function moveSection(sid: SectionId, dir: -1 | 1) {
    const list = [...cv!.content.sections];
    const i = list.findIndex((s) => s.id === sid);
    const j = i + dir;
    if (j < 1 || j >= list.length) return; // header stays first
    [list[i], list[j]] = [list[j]!, list[i]!];
    updateContent({ sections: list });
  }

  async function exportFile(format: "pdf" | "docx") {
    setExporting(format);
    setExportError(null);
    try {
      // The server renders what's saved, so save the latest edits first.
      await saveCv(cv!);
      await downloadPaidCv(cv!.id, format, `${doc!.name || cv!.title} ${doc!.document_name}`);
      track({ name: "cv_exported", format });
    } catch (err) {
      const code = errorKey(err);
      const chars = err instanceof ApiClientError && Array.isArray(err.extra.chars) ? (err.extra.chars as string[]).join(" ") : "";
      setExportError(code === "unsupported_characters" ? te("unsupported_characters", { chars }) : te(code));
    } finally {
      setExporting(null);
    }
  }

  const checks = runAtsCheck({ doc, pages: measure?.pages ?? null, extractable: measure?.extractable ?? null });
  const missingSections = sectionIds.filter((s) => !cv.content.sections.some((x) => x.id === s));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={cv.title}
        subtitle={`${pack.label} · ${templates[cv.template_id].label}`}
        action={
          <span className="pt-2 text-xs text-ink-2" aria-live="polite">
            {saving === "saving" ? t("saving") : saving === "saved" ? t("saved") : saving === "error" ? t("saveError") : ""}
          </span>
        }
      />
      {pack.support === "partial" && pack.support_note && <Notice tone="warn">{pack.support_note}</Notice>}
      {measure && measure.pages > doc.max_pages && <Notice tone="warn">{t("tooLong", { pages: measure.pages, max: doc.max_pages, region: pack.label })}</Notice>}

      <div role="tablist" aria-label={t("tabsLabel")} className="grid grid-cols-4 gap-1 rounded-xl bg-surface-2 p-1">
        {tabs.map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cx("min-h-11 rounded-lg text-sm font-medium", tab === k ? "bg-surface shadow-sm" : "text-ink-2")}
          >
            {t(`tab.${k}`)}
          </button>
        ))}
      </div>

      {tab === "preview" && (
        <>
          {(doc.hidden.unconfirmed > 0 || doc.hidden.unlinked_achievements > 0) && (
            <Notice tone="warn" action={<Link href="/cvs/facts" className="font-semibold underline">{t("reviewFacts")}</Link>}>
              {t("hiddenFacts", { unconfirmed: doc.hidden.unconfirmed, unlinked: doc.hidden.unlinked_achievements })}
            </Notice>
          )}
          <p className="text-sm text-ink-2">{t("tapToEdit")}</p>
          {!doc.sections.some((s) => s.id === "summary") && cv.content.sections.some((s) => s.id === "summary" && s.visible) && (
            <Button variant="secondary" onClick={() => select({ kind: "summary", text: cv.content.summary })}>
              + {t("addSummary")}
            </Button>
          )}
          <CvPreview doc={doc} onSelect={select} selected={selected?.kind === "summary" ? "summary" : selectedFactId} />
          {selected && (
            <Card className="sticky bottom-20 shadow-lg">
              <TextArea
                label={selected.kind === "summary" ? t("summaryLabel") : t("lineLabel")}
                hint={selected.kind === "summary" ? t("summaryHint") : t("lineHint")}
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                rows={selected.kind === "summary" ? 5 : 3}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={applyEdit}>{t("applyForCv")}</Button>
                {selected.kind === "fact" && selectedFact?.type !== "contact" && (
                  <>
                    <Button variant="secondary" onClick={updateFact}>
                      {t("updateFact")}
                    </Button>
                    {cv.content.text_overrides[selected.factId] !== undefined && (
                      <Button variant="secondary" onClick={resetEdit}>
                        {t("resetLine")}
                      </Button>
                    )}
                    <Button variant="secondary" onClick={() => moveSelected(-1)} aria-label={t("moveUp")}>
                      ↑
                    </Button>
                    <Button variant="secondary" onClick={() => moveSelected(1)} aria-label={t("moveDown")}>
                      ↓
                    </Button>
                    <Button variant="ghost" onClick={hideSelected}>
                      {t("hideLine")}
                    </Button>
                  </>
                )}
                <Button variant="ghost" onClick={() => setSelected(null)}>
                  {t("cancel")}
                </Button>
              </div>
            </Card>
          )}
          {cv.content.excluded_fact_ids.length > 0 && (
            <Button variant="ghost" onClick={() => updateContent({ excluded_fact_ids: [] })}>
              {t("showHidden", { count: cv.content.excluded_fact_ids.length })}
            </Button>
          )}
        </>
      )}

      {tab === "settings" && (
        <div className="flex flex-col gap-5">
          <TextInput label={t("cvName")} value={cv.title} maxLength={120} onChange={(e) => update((c) => ({ ...c, title: e.target.value || c.title }))} />
          <CountrySelect
            label={t("applyingTo")}
            hint={t("applyingToHint")}
            value={cv.content.target_country}
            onChange={(code) => {
              const next = regionForCountry(code || null);
              update((c) => ({
                ...c,
                region_id: next.id,
                content: {
                  ...c.content,
                  target_country: code || null,
                  ...(next.id !== c.region_id
                    ? { sections: defaultCvContent(next, code || null).sections, personal: {}, paper: null, spelling: null }
                    : {}),
                },
              }));
            }}
          />
          <Select
            label={t("regionPack")}
            value={cv.region_id}
            onChange={(e) => changeRegion(e.target.value)}
            options={regionPacks.map((p) => ({ value: p.id, label: p.label }))}
          />
          <RegionSummary pack={pack} />

          <fieldset>
            <legend className="mb-2 font-semibold">{t("template")}</legend>
            <div className="grid gap-2">
              {templateIds.map((tid) => (
                <label key={tid} className={cx("flex min-h-11 cursor-pointer gap-3 rounded-xl border p-3", cv.template_id === tid ? "border-accent bg-accent-soft" : "border-line bg-surface")}>
                  <input type="radio" name="template" checked={cv.template_id === tid} onChange={() => update((c) => ({ ...c, template_id: tid }))} className="mt-1" />
                  <span>
                    <span className="font-medium">{templates[tid].label}</span>
                    <span className="block text-sm text-ink-2">{templates[tid].description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <Card>
            <p className="mb-1 font-semibold">{t("personalTitle")}</p>
            <p className="mb-2 text-sm text-ink-2">{t("personalHint")}</p>
            {personalFields.map((f: PersonalField) => (
              <Switch
                key={f}
                label={t(`personal.${f}`)}
                hint={defaults[f] ? t("recommendedOn") : t("recommendedOff")}
                checked={settings.personal[f]}
                onChange={(v) => updateContent({ personal: { ...cv.content.personal, [f]: v } })}
              />
            ))}
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label={t("paper")}
              value={settings.paper}
              onChange={(e) => updateContent({ paper: e.target.value === pack.paper ? null : (e.target.value as "A4" | "Letter") })}
              options={[
                { value: "A4", label: "A4" },
                { value: "Letter", label: "US Letter" },
              ]}
            />
            <Select
              label={t("spelling")}
              value={settings.spelling}
              onChange={(e) => updateContent({ spelling: e.target.value as (typeof spellings)[number] })}
              options={spellings.map((s) => ({ value: s, label: s }))}
            />
          </div>

          <Card>
            <p className="mb-2 font-semibold">{t("sectionsTitle")}</p>
            <ul className="flex flex-col gap-1">
              {cv.content.sections
                .filter((s) => s.id !== "header")
                .map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <div className="flex-1">
                      <Switch
                        label={sectionTitles[s.id]}
                        checked={s.visible}
                        onChange={(v) => updateContent({ sections: cv.content.sections.map((x) => (x.id === s.id ? { ...x, visible: v } : x)) })}
                      />
                    </div>
                    <Button variant="ghost" aria-label={t("moveSectionUp", { section: sectionTitles[s.id] })} onClick={() => moveSection(s.id, -1)}>
                      ↑
                    </Button>
                    <Button variant="ghost" aria-label={t("moveSectionDown", { section: sectionTitles[s.id] })} onClick={() => moveSection(s.id, 1)}>
                      ↓
                    </Button>
                  </li>
                ))}
            </ul>
            {missingSections.map((s) => (
              <Button key={s} variant="ghost" onClick={() => updateContent({ sections: [...cv.content.sections, { id: s, visible: true }] })}>
                + {sectionTitles[s]}
              </Button>
            ))}
          </Card>
        </div>
      )}

      {tab === "check" && (
        <div className="flex flex-col gap-4">
          <Card>
            <p className="mb-2 font-semibold">{t("atsTitle")}</p>
            <p className="mb-3 text-sm text-ink-2">{t("atsLead")}</p>
            <ul className="flex flex-col gap-2">
              {checks.map((c) => (
                <li key={c.id} className="flex gap-2 text-sm">
                  <span className={cx("shrink-0 self-start rounded px-1.5 py-0.5 text-xs font-semibold", c.status === "pass" ? "bg-ok-soft" : c.status === "warn" ? "bg-warn-soft" : "bg-danger-soft")}>
                    {t(`status.${c.status}`)}
                  </span>
                  <span>{c.message}</span>
                </li>
              ))}
            </ul>
            {!measure && online && <p className="mt-2 text-sm text-ink-2">{t("measuring")}</p>}
          </Card>
          <div className="grid gap-3">
            {paidCvIds.has(cv.id) ? (
              <>
                <Button disabled={!online || exporting !== null} onClick={() => exportFile("pdf")}>
                  {exporting === "pdf" ? t("exporting") : t("downloadPdf")}
                </Button>
                <Button variant="secondary" disabled={!online || exporting !== null} onClick={() => exportFile("docx")}>
                  {exporting === "docx" ? t("exporting") : t("downloadDocx")}
                </Button>
              </>
            ) : (
              <>
                <LinkButton href={payHref(cv.id)} onClick={() => void saveCv(cv)}>
                  {t("getFiles", { price: formatMoney(products.cv_download.amount) })}
                </LinkButton>
                <p className="text-sm text-ink-2">{t("getFilesHint")}</p>
              </>
            )}
            {!online && <p className="text-sm text-ink-2">{t("exportOffline")}</p>}
            {exportError && <Notice tone="danger">{exportError}</Notice>}
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="flex flex-col gap-3">
          <Button
            variant="secondary"
            onClick={async () => {
              await saveCv(cv, { snapshot: true });
              setVersions(await repo!.listVersions(cv.id));
            }}
          >
            {t("saveVersion")}
          </Button>
          <p className="text-sm text-ink-2">{t("historyHint")}</p>
          {versions === null ? (
            <Spinner label={t("loading")} />
          ) : versions.length === 0 ? (
            <p className="text-ink-2">{t("noVersions")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {versions.map((v) => (
                <li key={v.id}>
                  <Card className="flex items-center justify-between gap-3">
                    <span className="text-sm">
                      <span className="font-medium">{v.title}</span>
                      <span className="block text-ink-2">{new Date(v.created_at).toLocaleString()}</span>
                    </span>
                    <Button variant="secondary" onClick={() => update((c) => ({ ...c, title: v.title, content: v.content }))}>
                      {t("restore")}
                    </Button>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Button variant="ghost" onClick={() => router.push("/cvs")}>
        {t("backToVault")}
      </Button>
    </div>
  );
}

export default function BuilderPage() {
  return (
    <Suspense>
      <Builder />
    </Suspense>
  );
}
