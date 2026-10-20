"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useApp } from "@/components/app-provider";
import { FactForm } from "@/components/fact-forms";
import { Sheet } from "@/components/sheet";
import { Button, Card, Checkbox, Notice, PageHeader, Spinner, Switch, TextArea, cx } from "@/components/ui";
import { apiFetch, errorKey } from "@/lib/client-api";
import { newCv } from "@/lib/cv/create";
import { formatRange } from "@/lib/cv/dates";
import { ExtractError, extractText } from "@/lib/import/extract";
import type { ImportResult } from "@/lib/import/types";
import { makeFact, nowIso, type Fact, type FactData, type FactType } from "@/lib/model";

type ItemState = "pending" | "confirmed" | "removed";
type Editing = { kind: "fact"; fact: Fact } | { kind: "attention"; index: number; type: FactType; preset: Record<string, unknown> } | null;

const groups: { type: FactType; key: "contact" | "experience" | "education" | "skills" | "languages" | "certs" }[] = [
  { type: "contact", key: "contact" },
  { type: "work", key: "experience" },
  { type: "education", key: "education" },
  { type: "skill", key: "skills" },
  { type: "language", key: "languages" },
  { type: "cert", key: "certs" },
];

function describe(f: Fact): { main: string; sub?: string } {
  switch (f.type) {
    case "contact":
      return { main: f.data.full_name, sub: [f.data.email, f.data.phone, f.data.city].filter(Boolean).join(" · ") };
    case "work":
      return { main: [f.data.title, f.data.employer].filter(Boolean).join(" · "), sub: formatRange(f.data.start, f.data.end, f.data.current, "MMM YYYY") };
    case "achievement":
      return { main: f.data.text };
    case "education":
      return { main: [f.data.qualification, f.data.field].filter(Boolean).join(", "), sub: [f.data.institution, formatRange(f.data.start, f.data.end, false, "MMM YYYY")].filter(Boolean).join(" · ") };
    case "skill":
      return { main: f.data.name };
    case "language":
      return { main: f.data.level ? `${f.data.name} (${f.data.level})` : f.data.name };
    case "cert":
      return { main: f.data.name, sub: f.data.issuer };
  }
}

export default function ImportPage() {
  const t = useTranslations("import");
  const te = useTranslations("errors");
  const router = useRouter();
  const { facts: existing, profile, saveFacts, saveCv } = useApp();

  const [source, setSource] = useState<"file" | "paste">("file");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [useAi, setUseAi] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [result, setResult] = useState<ImportResult | null>(null);
  const [drafts, setDrafts] = useState<Fact[]>([]);
  const [state, setState] = useState<Record<string, ItemState>>({});
  const [attention, setAttention] = useState<{ text: string; done: boolean }[]>([]);
  const [useSummary, setUseSummary] = useState(true);
  const [editing, setEditing] = useState<Editing>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Files are read on this device; only the text is sent.
      const cvText = source === "file" && file ? await extractText(file) : text;
      const res = await apiFetch("/api/cv/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: useAi ? "ai" : "basic", text: cvText }),
      });
      const data = (await res.json()) as ImportResult;
      setResult(data);
      setDrafts(data.facts);
      setState(Object.fromEntries(data.facts.map((f) => [f.id, "pending" as ItemState])));
      setAttention(data.attention.map((line) => ({ text: line, done: false })));
    } catch (err) {
      setError(te(err instanceof ExtractError ? err.code : errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  const setItem = (id: string, s: ItemState) => setState((prev) => ({ ...prev, [id]: s }));
  const unverified = new Set(result?.unverified_fact_ids ?? []);
  // Removing a role removes its bullets too.
  const kept = drafts.filter(
    (f) => state[f.id] !== "removed" && !(f.type === "achievement" && f.data.work_id && state[f.data.work_id] === "removed"),
  );
  const pendingCount = kept.filter((f) => state[f.id] === "pending").length;
  const openAttention = attention.filter((a) => !a.done).length;

  async function save(buildCv: boolean) {
    setBusy(true);
    const existingContact = existing.find((f) => f.type === "contact");
    const ts = nowIso();
    const toSave = kept.map((f) => {
      const confirmed = state[f.id] === "confirmed";
      // Only one contact record: a confirmed import replaces the old details, keeping its id.
      if (f.type === "contact" && existingContact && confirmed) return { ...f, id: existingContact.id, confirmed, updated_at: ts } as Fact;
      return { ...f, confirmed, updated_at: ts } as Fact;
    });
    const skipContact = existingContact && toSave.some((f) => f.type === "contact" && !f.confirmed);
    await saveFacts(skipContact ? toSave.filter((f) => f.type !== "contact") : toSave);
    if (buildCv) {
      const cv = newCv(t("importedTitle"), profile, useSummary && result?.summary ? result.summary : "");
      await saveCv(cv, { snapshot: true });
      router.push(`/cvs/edit?id=${cv.id}`);
    } else router.push("/cvs/facts");
  }

  if (!result) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <div role="tablist" aria-label={t("sourceLabel")} className="grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-1">
          {(["file", "paste"] as const).map((s) => (
            <button
              key={s}
              role="tab"
              type="button"
              aria-selected={source === s}
              onClick={() => setSource(s)}
              className={cx("min-h-11 rounded-lg text-sm font-medium", source === s ? "bg-surface shadow-sm" : "text-ink-2")}
            >
              {t(s === "file" ? "tabFile" : "tabPaste")}
            </button>
          ))}
        </div>
        <form onSubmit={run} className="flex flex-col gap-4">
          {source === "file" ? (
            <div className="flex flex-col gap-2">
              <label htmlFor="cv-file" className="text-sm font-medium">
                {t("fileLabel")}
              </label>
              <input
                id="cv-file"
                type="file"
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="rounded-xl border border-dashed border-line bg-surface p-4 text-sm"
              />
              <p className="text-sm text-ink-2">{t("fileHint")}</p>
            </div>
          ) : (
            <TextArea label={t("pasteLabel")} rows={10} value={text} onChange={(e) => setText(e.target.value)} />
          )}
          <Card>
            <Switch label={t("aiLabel")} hint={t("aiHint")} checked={useAi} onChange={setUseAi} />
          </Card>
          {error && <Notice tone="danger">{error}</Notice>}
          <Button type="submit" disabled={busy || (source === "file" ? !file : !text.trim())}>
            {busy ? t("reading") : t("read")}
          </Button>
          {busy && <Spinner label={t("readingLong")} />}
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("reviewTitle")} subtitle={t("reviewSubtitle")} />
      <Notice>{result.method === "ai" ? t("methodAi") : t("methodBasic")}</Notice>
      {unverified.size > 0 && <Notice tone="warn">{t("unverifiedNote", { count: unverified.size })}</Notice>}

      {groups.map(({ type, key }) => {
        const items = drafts.filter((f) => f.type === type);
        if (!items.length) return null;
        return (
          <section key={type} aria-labelledby={`g-${type}`}>
            <div className="mb-2 flex items-center justify-between">
              <h2 id={`g-${type}`} className="text-lg font-semibold">
                {t(`groups.${key}`)}
              </h2>
              <Button variant="ghost" onClick={() => items.forEach((f) => state[f.id] === "pending" && setItem(f.id, "confirmed"))}>
                {t("confirmSection")}
              </Button>
            </div>
            {type === "contact" && existing.some((f) => f.type === "contact") && <p className="mb-2 text-sm text-ink-2">{t("contactReplace")}</p>}
            <div className="flex flex-col gap-2">
              {items.map((f) => (
                <ReviewItem
                  key={f.id}
                  fact={f}
                  state={state[f.id] ?? "pending"}
                  unverified={unverified.has(f.id)}
                  onState={(s) => setItem(f.id, s)}
                  onEdit={() => setEditing({ kind: "fact", fact: f })}
                  bullets={type === "work" ? drafts.filter((a) => a.type === "achievement" && a.data.work_id === f.id) : []}
                  bulletState={state}
                  onBulletState={setItem}
                  onBulletEdit={(b) => setEditing({ kind: "fact", fact: b })}
                  unverifiedIds={unverified}
                />
              ))}
            </div>
          </section>
        );
      })}

      {result.summary && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">{t("groups.summary")}</h2>
          <Card>
            <p className="text-sm">{result.summary}</p>
            <div className="mt-3">
              <Checkbox checked={useSummary} onChange={setUseSummary} label={t("useSummary")} />
            </div>
          </Card>
        </section>
      )}

      {attention.length > 0 && (
        <section aria-labelledby="g-attention">
          <h2 id="g-attention" className="mb-1 text-lg font-semibold">
            {t("attentionTitle", { count: openAttention })}
          </h2>
          <p className="mb-2 text-sm text-ink-2">{t("attentionLead")}</p>
          <ul className="flex flex-col gap-2">
            {attention.map((a, i) => (
              <li key={i} className={cx("rounded-xl border p-3", a.done ? "border-line opacity-60" : "border-warn bg-warn-soft")}>
                <p className="text-sm">{a.text}</p>
                {!a.done && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => setEditing({ kind: "attention", index: i, type: "achievement", preset: { text: a.text, kind: "responsibility", work_id: null } })}>
                      {t("asBullet")}
                    </Button>
                    <Button variant="secondary" onClick={() => setEditing({ kind: "attention", index: i, type: "skill", preset: { name: a.text.slice(0, 80) } })}>
                      {t("asSkill")}
                    </Button>
                    <Button variant="ghost" onClick={() => setAttention((prev) => prev.map((x, j) => (j === i ? { ...x, done: true } : x)))}>
                      {t("notNeeded")}
                    </Button>
                  </div>
                )}
                {a.done && <p className="mt-1 text-xs text-ink-2">{t("handled")}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(pendingCount > 0 || openAttention > 0) && (
        <Notice tone="warn">
          {pendingCount > 0 && t("pendingNote", { count: pendingCount })} {openAttention > 0 && t("attentionNote", { count: openAttention })}
        </Notice>
      )}
      <div className="sticky bottom-20 grid grid-cols-2 gap-2 rounded-2xl border border-line bg-surface p-2 shadow-lg">
        <Button variant="secondary" disabled={busy} onClick={() => save(false)}>
          {t("saveOnly")}
        </Button>
        <Button disabled={busy} onClick={() => save(true)}>
          {t("saveAndBuild")}
        </Button>
      </div>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={t("editTitle")}>
        {editing?.kind === "fact" && (
          <FactForm
            type={editing.fact.type}
            initial={editing.fact.data as FactData<typeof editing.fact.type>}
            works={drafts.filter((f): f is Extract<Fact, { type: "work" }> => f.type === "work" && state[f.id] !== "removed")}
            onSave={(data) => {
              setDrafts((prev) => prev.map((f) => (f.id === editing.fact.id ? ({ ...f, data } as Fact) : f)));
              setItem(editing.fact.id, "confirmed");
              setEditing(null);
            }}
          />
        )}
        {editing?.kind === "attention" && (
          <FactForm
            type={editing.type}
            initial={editing.preset as FactData<typeof editing.type>}
            works={[...existing, ...drafts].filter((f): f is Extract<Fact, { type: "work" }> => f.type === "work" && state[f.id] !== "removed")}
            onSave={(data) => {
              const fact = makeFact(editing.type, data as FactData<typeof editing.type>, { source: "import" }) as Fact;
              setDrafts((prev) => [...prev, fact]);
              setItem(fact.id, "confirmed");
              setAttention((prev) => prev.map((x, j) => (j === editing.index ? { ...x, done: true } : x)));
              setEditing(null);
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function ReviewItem({
  fact,
  state,
  unverified,
  onState,
  onEdit,
  bullets,
  bulletState,
  onBulletState,
  onBulletEdit,
  unverifiedIds,
}: {
  fact: Fact;
  state: ItemState;
  unverified: boolean;
  onState: (s: ItemState) => void;
  onEdit: () => void;
  bullets: Fact[];
  bulletState: Record<string, ItemState>;
  onBulletState: (id: string, s: ItemState) => void;
  onBulletEdit: (f: Fact) => void;
  unverifiedIds: Set<string>;
}) {
  const t = useTranslations("import");
  const { main, sub } = describe(fact);
  return (
    <Card className={cx(state === "removed" && "opacity-50", state === "confirmed" && "border-ok")}>
      <ItemLine main={main} sub={sub} state={state} unverified={unverified} onState={onState} onEdit={onEdit} />
      {bullets.length > 0 && state !== "removed" && (
        <ul className="mt-3 flex flex-col gap-2 border-s-2 border-line ps-3">
          {bullets.map((b) => (
            <li key={b.id} className={cx(bulletState[b.id] === "removed" && "opacity-50")}>
              <ItemLine
                main={describe(b).main}
                state={bulletState[b.id] ?? "pending"}
                unverified={unverifiedIds.has(b.id)}
                onState={(s) => onBulletState(b.id, s)}
                onEdit={() => onBulletEdit(b)}
                small
              />
            </li>
          ))}
          <li>
            <Button variant="ghost" onClick={() => bullets.forEach((b) => bulletState[b.id] === "pending" && onBulletState(b.id, "confirmed"))}>
              {t("confirmBullets")}
            </Button>
          </li>
        </ul>
      )}
    </Card>
  );
}

function ItemLine({
  main,
  sub,
  state,
  unverified,
  onState,
  onEdit,
  small,
}: {
  main: string;
  sub?: string;
  state: ItemState;
  unverified: boolean;
  onState: (s: ItemState) => void;
  onEdit: () => void;
  small?: boolean;
}) {
  const t = useTranslations("import");
  return (
    <div>
      <p className={cx(small ? "text-sm" : "font-semibold", state === "removed" && "line-through")}>{main || t("empty")}</p>
      {sub && <p className="text-sm text-ink-2">{sub}</p>}
      {unverified && state !== "removed" && <p className="mt-1 text-xs font-semibold text-warn">{t("unverified")}</p>}
      <p className="mt-1 text-xs text-ink-2">{t(`state.${state}`)}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {state !== "confirmed" && (
          <Button variant="ghost" className="text-sm" onClick={() => onState("confirmed")}>
            {t("confirm")}
          </Button>
        )}
        <Button variant="ghost" className="text-sm" onClick={onEdit}>
          {t("edit")}
        </Button>
        {state !== "removed" ? (
          <Button variant="ghost" className="text-sm" onClick={() => onState("removed")}>
            {t("remove")}
          </Button>
        ) : (
          <Button variant="ghost" className="text-sm" onClick={() => onState("pending")}>
            {t("undo")}
          </Button>
        )}
      </div>
    </div>
  );
}
