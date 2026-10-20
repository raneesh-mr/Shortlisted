import type { DateFormat, PersonalField, RegionPack, SectionId, Spelling } from "@/config/regions/schema";
import { defaultPersonalFields, getRegionPack } from "@/lib/regions";
import { countryName } from "@/lib/geo";
import type { Cv, CvContent, Fact, FactOf, TemplateId } from "@/lib/model";
import { formatDay, formatMonth, formatRange } from "./dates";

/** A single rendered line. `source_fact_id` is the trace back to the user's truth. */
export interface CvLine {
  text: string;
  source_fact_id: string | null;
  overridden?: boolean;
}

export type CvBlock =
  | { kind: "entry"; fact_id: string; title: CvLine; subtitle: string; dates: string; bullets: CvLine[] }
  | { kind: "inline"; items: CvLine[] }
  | { kind: "paragraph"; line: CvLine }
  | { kind: "pairs"; items: { label: string; value: string; source_fact_id: string }[] };

export interface CvSection {
  id: SectionId;
  title: string;
  blocks: CvBlock[];
}

export interface RenderedCv {
  name: string;
  headline: string;
  contact: string[];
  contact_fact_id: string | null;
  photo: string | null;
  sections: CvSection[];
  footer: string | null;
  paper: "A4" | "Letter";
  max_pages: number;
  document_name: string;
  date_format: DateFormat;
  spelling: Spelling;
  template_id: TemplateId;
  /** Facts the CV can't show yet, so the UI can explain why. */
  hidden: { unconfirmed: number; unlinked_achievements: number };
}

export const sectionTitles: Record<SectionId, string> = {
  header: "Header",
  personal: "Personal details",
  summary: "Summary",
  experience: "Experience",
  skills: "Skills",
  education: "Education",
  languages: "Languages",
  certifications: "Certifications",
};

const personalLabels: Record<Exclude<PersonalField, "photo">, string> = {
  date_of_birth: "Date of birth",
  nationality: "Nationality",
  marital_status: "Marital status",
  visa_status: "Visa status",
};

export function defaultCvContent(pack: RegionPack, targetCountry: string | null): CvContent {
  return {
    version: 1,
    target_country: targetCountry,
    summary: "",
    sections: pack.sections_order.map((id) => ({ id, visible: true })),
    personal: {},
    paper: null,
    spelling: null,
    excluded_fact_ids: [],
    order: [],
    text_overrides: {},
  };
}

export interface EffectiveSettings {
  paper: "A4" | "Letter";
  spelling: Spelling;
  personal: Record<PersonalField, boolean>;
}

export function effectiveSettings(content: CvContent, pack: RegionPack): EffectiveSettings {
  const defaults = defaultPersonalFields(pack);
  const personal = { ...defaults };
  for (const [k, v] of Object.entries(content.personal) as [PersonalField, boolean | null][]) {
    if (v !== null && v !== undefined) personal[k] = v;
  }
  return { paper: content.paper ?? pack.paper, spelling: content.spelling ?? pack.spelling, personal };
}

function sortWithOrder<T extends Fact>(items: T[], order: string[], fallback: (a: T, b: T) => number): T[] {
  const idx = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const ia = idx.get(a.id);
    const ib = idx.get(b.id);
    if (ia !== undefined && ib !== undefined) return ia - ib;
    if (ia !== undefined) return -1;
    if (ib !== undefined) return 1;
    return fallback(a, b);
  });
}

const byRecent = (a: { data: { start?: string; end?: string; current?: boolean } }, b: typeof a) => {
  const ca = a.data.current ? 1 : 0;
  const cb = b.data.current ? 1 : 0;
  if (ca !== cb) return cb - ca;
  return (b.data.end ?? b.data.start ?? "").localeCompare(a.data.end ?? a.data.start ?? "");
};

export function buildCvDocument(cv: Pick<Cv, "region_id" | "template_id" | "content">, facts: Fact[]): RenderedCv {
  const pack = getRegionPack(cv.region_id);
  const content = cv.content;
  const settings = effectiveSettings(content, pack);
  const excluded = new Set(content.excluded_fact_ids);
  const confirmed = facts.filter((f) => f.confirmed);
  const usable = confirmed.filter((f) => !excluded.has(f.id));
  const ofType = <T extends Fact["type"]>(t: T) => usable.filter((f): f is FactOf<T> => f.type === t);
  const line = (f: Fact, text: string): CvLine => {
    const o = content.text_overrides[f.id];
    return o !== undefined && o.trim() !== ""
      ? { text: o.trim(), source_fact_id: f.id, overridden: true }
      : { text, source_fact_id: f.id };
  };

  const contact = ofType("contact")[0] ?? null;
  const c = contact?.data;
  const place =
    pack.address === "city_only"
      ? c?.city
      : [c?.city, c?.country ? countryName(c.country) : undefined].filter(Boolean).join(", ");
  const contactParts = [c?.email, c?.phone, place, ...(c?.links ?? [])].filter((x): x is string => !!x && x.trim() !== "");

  const personalPairs: { label: string; value: string; source_fact_id: string }[] = [];
  if (contact && c) {
    const vals: Record<Exclude<PersonalField, "photo">, string | undefined> = {
      date_of_birth: c.date_of_birth ? formatDay(c.date_of_birth) : undefined,
      nationality: c.nationality,
      marital_status: c.marital_status,
      visa_status: c.visa_status,
    };
    for (const key of Object.keys(personalLabels) as (keyof typeof personalLabels)[]) {
      const v = vals[key];
      if (settings.personal[key] && v) personalPairs.push({ label: personalLabels[key], value: v, source_fact_id: contact.id });
    }
  }

  const achievements = ofType("achievement");
  const fmt = pack.date_format;
  const sections: CvSection[] = [];
  const visible = content.sections.filter((s) => s.visible && s.id !== "header");
  const personalAsSection = visible.some((s) => s.id === "personal");

  for (const { id } of visible) {
    const blocks: CvBlock[] = [];
    switch (id) {
      case "personal":
        if (personalPairs.length) blocks.push({ kind: "pairs", items: personalPairs });
        break;
      case "summary":
        if (content.summary.trim()) blocks.push({ kind: "paragraph", line: { text: content.summary.trim(), source_fact_id: null } });
        break;
      case "experience":
        for (const w of sortWithOrder(ofType("work"), content.order, byRecent)) {
          const bullets = sortWithOrder(
            achievements.filter((a) => a.data.work_id === w.id),
            content.order,
            (a, b) => a.created_at.localeCompare(b.created_at),
          ).map((a) => line(a, a.data.text));
          blocks.push({
            kind: "entry",
            fact_id: w.id,
            title: line(w, w.data.title),
            subtitle: [w.data.employer, w.data.location].filter(Boolean).join(", "),
            dates: formatRange(w.data.start, w.data.end, w.data.current, fmt),
            bullets,
          });
        }
        break;
      case "education":
        for (const e of sortWithOrder(ofType("education"), content.order, byRecent)) {
          const title = [e.data.qualification, e.data.field].filter(Boolean).join(", ");
          blocks.push({
            kind: "entry",
            fact_id: e.id,
            title: line(e, title),
            subtitle: [e.data.institution, e.data.location].filter(Boolean).join(", "),
            dates: formatRange(e.data.start, e.data.end, false, fmt),
            bullets: e.data.grade ? [{ text: e.data.grade, source_fact_id: e.id }] : [],
          });
        }
        break;
      case "skills": {
        const items = sortWithOrder(ofType("skill"), content.order, () => 0).map((s) => line(s, s.data.name));
        if (items.length) blocks.push({ kind: "inline", items });
        break;
      }
      case "languages": {
        const items = sortWithOrder(ofType("language"), content.order, () => 0).map((l) =>
          line(l, l.data.level ? `${l.data.name} (${l.data.level})` : l.data.name),
        );
        if (items.length) blocks.push({ kind: "inline", items });
        break;
      }
      case "certifications":
        for (const cert of sortWithOrder(ofType("cert"), content.order, () => 0)) {
          blocks.push({
            kind: "entry",
            fact_id: cert.id,
            title: line(cert, cert.data.name),
            subtitle: cert.data.issuer ?? "",
            dates: formatMonth(cert.data.date, fmt),
            bullets: [],
          });
        }
        break;
    }
    if (blocks.length) sections.push({ id, title: sectionTitles[id], blocks });
  }

  const contactLine = personalAsSection
    ? contactParts
    : [...contactParts, ...personalPairs.map((p) => `${p.label}: ${p.value}`)];
  const workIds = new Set(confirmed.filter((f) => f.type === "work").map((f) => f.id));

  return {
    name: c?.full_name ?? "",
    headline: c?.headline ?? "",
    contact: contactLine,
    contact_fact_id: contact?.id ?? null,
    photo: settings.personal.photo && c?.photo ? c.photo : null,
    sections,
    footer:
      pack.references === "on_request_line"
        ? settings.spelling === "en-AU"
          ? "Referees available on request."
          : "References available on request."
        : null,
    paper: settings.paper,
    max_pages: pack.max_pages,
    document_name: pack.document_name,
    date_format: fmt,
    spelling: settings.spelling,
    template_id: cv.template_id,
    hidden: {
      unconfirmed: facts.length - confirmed.length,
      unlinked_achievements: confirmed.filter(
        (f) => f.type === "achievement" && (!f.data.work_id || !workIds.has(f.data.work_id)),
      ).length,
    },
  };
}

/** Plain text form, used for extractability checks and the account export. */
export function renderedToText(doc: RenderedCv): string {
  const out: string[] = [doc.name, doc.headline, doc.contact.join(" | ")];
  for (const s of doc.sections) {
    out.push("", s.title.toUpperCase());
    for (const b of s.blocks) {
      if (b.kind === "paragraph") out.push(b.line.text);
      if (b.kind === "inline") out.push(b.items.map((i) => i.text).join(", "));
      if (b.kind === "pairs") for (const p of b.items) out.push(`${p.label}: ${p.value}`);
      if (b.kind === "entry") {
        out.push([b.title.text, b.subtitle, b.dates].filter(Boolean).join(" | "));
        for (const bl of b.bullets) out.push(`- ${bl.text}`);
      }
    }
  }
  if (doc.footer) out.push("", doc.footer);
  return out.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").trim();
}
