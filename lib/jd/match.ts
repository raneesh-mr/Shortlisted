import { tokens } from "@/lib/import/text";
import type { Fact, FactOf } from "@/lib/model";
import type { MatchItem, MatchLevel, Requirement } from "./schema";

/** Words that say nothing about whether someone has done a thing. */
const FILLER = new Set(
  (
    "experience experienced years year ability able strong excellent good great proven solid knowledge understanding skills skill " +
    "work working including include using use within across must will would should can role candidate company job position " +
    "responsible ensure ensuring support supporting provide providing other related required preferred plus etc minimum least " +
    "well new high level we you our your their this that these those who which also more all any each demonstrated track record " +
    "familiarity familiar proficiency proficient hands-on hands on background degree equivalent similar relevant environment"
  ).split(" "),
);

/** Crude stemming: "technicians" ~ "technician", "managing" ~ "manag". Good enough for overlap, never shown to users. */
export function stem(w: string): string {
  if (w.length <= 4) return w;
  return w.replace(/(ies)$/, "y").replace(/(ing|ers|er|ed|es|s)$/, "");
}

export function contentStems(text: string): string[] {
  return [...new Set(tokens(text).filter((t) => !FILLER.has(t) && !/^\d+\+?$/.test(t)).map(stem))];
}

/** The words a fact contributes, including the role it belongs to. */
export function factText(f: Fact, byId: Map<string, Fact>): string {
  switch (f.type) {
    case "achievement": {
      const w = f.data.work_id ? (byId.get(f.data.work_id) as FactOf<"work"> | undefined) : undefined;
      return [f.data.text, w?.data.title, w?.data.employer].filter(Boolean).join(" ");
    }
    case "work":
      return [f.data.title, f.data.employer, f.data.location].filter(Boolean).join(" ");
    case "education":
      return [f.data.qualification, f.data.field, f.data.institution].filter(Boolean).join(" ");
    case "skill":
      return f.data.name;
    case "language":
      return [f.data.name, f.data.level].filter(Boolean).join(" ");
    case "cert":
      return [f.data.name, f.data.issuer].filter(Boolean).join(" ");
    case "contact":
      return "";
  }
}

/** How a fact reads in the UI: the bullet, then its role in brackets. */
export function factLabel(f: Fact, byId: Map<string, Fact>): string {
  if (f.type === "achievement" && f.data.work_id) {
    const w = byId.get(f.data.work_id) as FactOf<"work"> | undefined;
    return w ? `${f.data.text} (${[w.data.title, w.data.employer].filter(Boolean).join(", ")})` : f.data.text;
  }
  return factText(f, byId);
}

export interface MatchOptions {
  /** Requirement keys the user said they haven't done: always a gap, never asked again. */
  notDone?: Set<string>;
}

export function matchBasic(reqs: Requirement[], facts: Fact[], opts: MatchOptions = {}): MatchItem[] {
  const confirmed = facts.filter((f) => f.confirmed && f.type !== "contact");
  const byId = new Map(facts.map((f) => [f.id, f]));
  const factStems = confirmed.map((f) => ({ id: f.id, type: f.type, stems: new Set(contentStems(factText(f, byId))) }));

  return reqs.map((r) => {
    const want = contentStems(r.text);
    const base = { key: r.key, text: r.text, kind: r.kind };
    if (opts.notDone?.has(r.key)) return { ...base, level: "gap" as MatchLevel, fact_ids: [], note: "You said you haven't done this." };
    if (want.length === 0) return { ...base, level: "gap" as MatchLevel, fact_ids: [], note: "" };

    const scored = factStems
      .map((f) => ({ id: f.id, hits: want.filter((w) => f.stems.has(w)).length }))
      .filter((s) => s.hits > 0)
      .sort((a, b) => b.hits - a.hits);
    const best = scored[0]?.hits ?? 0;
    const top = scored.slice(0, 3);
    const union = new Set(top.flatMap((s) => want.filter((w) => factStems.find((f) => f.id === s.id)!.stems.has(w))));
    const ratio = best / want.length;
    const unionRatio = union.size / want.length;

    let level: MatchLevel = "gap";
    if (ratio >= 0.6 || (best >= 3 && ratio >= 0.45)) level = "strong";
    else if (ratio >= 0.25 || unionRatio >= 0.5) level = "partial";

    const years = r.text.match(/(\d+)\+?\s*(?:years|yrs)/i)?.[1];
    const note = years && level !== "gap" ? `It asks for ${years}+ years; check your dates cover it.` : "";
    return { ...base, level, fact_ids: level === "gap" ? [] : top.map((s) => s.id), note };
  });
}

/** Changes whenever facts or requirements change, so a saved match can be marked stale. */
export function matchBasis(reqs: Requirement[], facts: Fact[]): string {
  const src = [...reqs.map((r) => r.key), ...facts.filter((f) => f.confirmed).map((f) => `${f.id}:${f.updated_at}`)].sort().join("|");
  let h = 5381;
  for (let i = 0; i < src.length; i++) h = ((h << 5) + h + src.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
