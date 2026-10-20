"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  achievementData,
  certData,
  contactData,
  educationData,
  languageData,
  skillData,
  workData,
  type Fact,
  type FactData,
  type FactType,
} from "@/lib/model";
import { CountrySelect } from "./region";
import { Button, Checkbox, Notice, Select, TextArea, TextInput } from "./ui";

type Draft = Record<string, unknown>;
const schemas = {
  contact: contactData,
  work: workData,
  achievement: achievementData,
  education: educationData,
  skill: skillData,
  language: languageData,
  cert: certData,
} as const;

/** Empty strings mean "not provided": drop them before validation. */
function clean(draft: Draft): Draft {
  const out: Draft = {};
  for (const [k, v] of Object.entries(draft)) {
    if (typeof v === "string" && v.trim() === "") continue;
    out[k] = v;
  }
  return out;
}

async function resizePhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const w = 300;
  const h = 375;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const scale = Math.max(w / bitmap.width, h / bitmap.height);
  const dw = bitmap.width * scale;
  const dh = bitmap.height * scale;
  ctx.drawImage(bitmap, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function FactForm<T extends FactType>({
  type,
  initial,
  works,
  onSave,
  onDelete,
}: {
  type: T;
  initial?: FactData<T>;
  works?: Extract<Fact, { type: "work" }>[];
  onSave: (data: FactData<T>) => Promise<void> | void;
  onDelete?: () => void;
}) {
  const t = useTranslations("facts.form");
  const [d, setD] = useState<Draft>(() => ({ ...defaults(type), ...(initial ?? {}) }));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (v: unknown) => setD((prev) => ({ ...prev, [k]: v }));
  const str = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
  const input = (k: string, label: string, extra: Partial<React.ComponentProps<"input">> & { hint?: string } = {}) => (
    <TextInput label={label} value={str(k)} onChange={(e) => set(k)(e.target.value)} {...extra} />
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = schemas[type].safeParse(clean(d));
    if (!parsed.success) {
      setError(t("invalid"));
      return;
    }
    const data = parsed.data as FactData<T>;
    const range = data as { start?: string; end?: string };
    if (range.start && range.end && range.end < range.start) {
      setError(t("endBeforeStart"));
      return;
    }
    setBusy(true);
    await onSave(data);
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {type === "contact" && (
        <>
          {input("full_name", t("fullName"), { required: true, autoComplete: "name" })}
          {input("headline", t("headline"), { hint: t("headlineHint") })}
          {input("email", t("email"), { type: "email", autoComplete: "email" })}
          {input("phone", t("phone"), { type: "tel", autoComplete: "tel" })}
          {input("city", t("city"), { autoComplete: "address-level2" })}
          <CountrySelect label={t("country")} value={str("country") || null} onChange={set("country")} />
          <TextArea
            label={t("links")}
            hint={t("linksHint")}
            rows={3}
            value={((d.links as string[] | undefined) ?? []).join("\n")}
            onChange={(e) => set("links")(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
          />
          <fieldset className="flex flex-col gap-4 rounded-2xl border border-line p-3">
            <legend className="px-1 text-sm font-semibold">{t("personal")}</legend>
            <p className="text-sm text-ink-2">{t("personalHint")}</p>
            {input("date_of_birth", t("dob"), { type: "date" })}
            {input("nationality", t("nationality"))}
            {input("marital_status", t("marital"))}
            {input("visa_status", t("visa"), { hint: t("visaHint") })}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="photo-input">
                {t("photo")}
              </label>
              {typeof d.photo === "string" && (
                // eslint-disable-next-line @next/next/no-img-element -- local data URL preview
                <img src={d.photo} alt={t("photoAlt")} className="h-30 w-24 rounded-lg object-cover" />
              )}
              <input
                id="photo-input"
                type="file"
                accept="image/jpeg,image/png"
                className="text-sm"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) set("photo")(await resizePhoto(f));
                }}
              />
              {typeof d.photo === "string" && (
                <Button variant="ghost" onClick={() => set("photo")(undefined)}>
                  {t("removePhoto")}
                </Button>
              )}
            </div>
          </fieldset>
        </>
      )}

      {type === "work" && (
        <>
          {input("title", t("jobTitle"), { required: true })}
          {input("employer", t("employer"), { required: true })}
          {input("location", t("location"))}
          {input("start", t("start"), { type: "month" })}
          <Checkbox checked={Boolean(d.current)} onChange={set("current")} label={t("current")} />
          {!d.current && input("end", t("end"), { type: "month" })}
        </>
      )}

      {type === "achievement" && (
        <>
          <TextArea label={t("bullet")} hint={t("bulletHint")} required value={str("text")} onChange={(e) => set("text")(e.target.value)} rows={3} />
          <Select
            label={t("kind")}
            value={str("kind") || "responsibility"}
            onChange={(e) => set("kind")(e.target.value)}
            options={[
              { value: "responsibility", label: t("responsibility") },
              { value: "achievement", label: t("achievement") },
            ]}
          />
          <Select
            label={t("role")}
            value={str("work_id")}
            onChange={(e) => set("work_id")(e.target.value || null)}
            options={[{ value: "", label: t("noRole") }, ...(works ?? []).map((w) => ({ value: w.id, label: `${w.data.title} · ${w.data.employer}` }))]}
          />
        </>
      )}

      {type === "education" && (
        <>
          {input("qualification", t("qualification"), { required: true })}
          {input("field", t("field"))}
          {input("institution", t("institution"), { required: true })}
          {input("location", t("location"))}
          {input("start", t("start"), { type: "month" })}
          {input("end", t("endOrExpected"), { type: "month" })}
          {input("grade", t("grade"))}
        </>
      )}

      {type === "skill" && input("name", t("skill"), { required: true, hint: t("skillHint") })}

      {type === "language" && (
        <>
          {input("name", t("language"), { required: true })}
          {input("level", t("level"), { hint: t("levelHint") })}
        </>
      )}

      {type === "cert" && (
        <>
          {input("name", t("certName"), { required: true })}
          {input("issuer", t("issuer"))}
          {input("date", t("certDate"), { type: "month" })}
        </>
      )}

      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex gap-3">
        {onDelete && (
          <Button variant="secondary" onClick={onDelete}>
            {t("delete")}
          </Button>
        )}
        <Button type="submit" className="flex-1" disabled={busy}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

function defaults(type: FactType): Draft {
  switch (type) {
    case "contact":
      return { full_name: "", links: [] };
    case "work":
      return { employer: "", title: "", current: false };
    case "achievement":
      return { work_id: null, kind: "responsibility", text: "" };
    default:
      return {};
  }
}
