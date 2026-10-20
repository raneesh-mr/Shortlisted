import { buildCvDocument } from "@/lib/cv/document";
import { tokens } from "@/lib/import/text";
import type { Cv, Fact, FactOf } from "@/lib/model";

/** A fact the email may cite, worded as it appears on the chosen CV. */
export interface Candidate {
  ref: string;
  fact_id: string;
  type: Fact["type"];
  text: string;
  /** Role context for bullets, e.g. "Facilities Manager, Harbour Estates". */
  context: string;
  score: number;
}

/**
 * Facts that may appear in the email: confirmed, shown on the chosen CV, and
 * using that CV's wording. Ranked by overlap with the job description.
 */
export function emailCandidates(cv: Pick<Cv, "region_id" | "template_id" | "content">, facts: Fact[], jd: string): Candidate[] {
  const doc = buildCvDocument(cv, facts);
  const shown = new Map<string, string>();
  for (const s of doc.sections) {
    for (const b of s.blocks) {
      const lines = b.kind === "entry" ? [b.title, ...b.bullets] : b.kind === "inline" ? b.items : [];
      for (const l of lines) if (l.source_fact_id && !shown.has(l.source_fact_id)) shown.set(l.source_fact_id, l.text);
    }
  }
  const byId = new Map(facts.map((f) => [f.id, f]));
  const jdTokens = new Set(tokens(jd));
  const weight: Partial<Record<Fact["type"], number>> = { achievement: 3, work: 1.5, cert: 1.2, education: 1, skill: 0.8, language: 0.6 };

  const out: Candidate[] = [];
  for (const [id, text] of shown) {
    const fact = byId.get(id);
    if (!fact || fact.type === "contact") continue;
    let context = "";
    if (fact.type === "achievement" && fact.data.work_id) {
      const work = byId.get(fact.data.work_id) as FactOf<"work"> | undefined;
      if (work) context = [work.data.title, work.data.employer].filter(Boolean).join(", ");
    }
    if (fact.type === "work") context = [fact.data.employer, fact.data.location].filter(Boolean).join(", ");
    if (fact.type === "education") context = fact.data.institution;
    const ft = tokens(`${text} ${context}`);
    const overlap = ft.filter((t) => jdTokens.has(t)).length;
    const bonus = fact.type === "achievement" && fact.data.kind === "achievement" ? 0.5 : 0;
    out.push({ ref: "", fact_id: id, type: fact.type, text, context, score: (overlap + 0.1) * (weight[fact.type] ?? 1) + bonus });
  }
  out.sort((a, b) => b.score - a.score);
  return out.map((c, i) => ({ ...c, ref: `F${i + 1}` }));
}
