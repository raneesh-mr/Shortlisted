import { buildCvDocument } from "@/lib/cv/document";
import { requirementsOf } from "@/lib/jd/basic";
import { contentStems, factText } from "@/lib/jd/match";
import type { JdAnalysis, MatchItem, TailorChange } from "@/lib/jd/schema";
import type { Cv, Fact } from "@/lib/model";

/** How much each fact matters for this job: cited matches first, then keyword overlap. */
export function relevance(facts: Fact[], items: MatchItem[], analysis: JdAnalysis): Map<string, number> {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const score = new Map<string, number>();
  for (const it of items) {
    const weight = (it.level === "strong" ? 3 : it.level === "partial" ? 1.5 : 0) * (it.kind === "must" || it.kind === "tool" ? 1.5 : 1);
    for (const id of it.fact_ids) score.set(id, (score.get(id) ?? 0) + weight);
  }
  const kw = new Set(analysis.keywords.flatMap((k) => contentStems(k)));
  for (const f of facts) {
    if (!f.confirmed) continue;
    const hits = contentStems(factText(f, byId)).filter((s) => kw.has(s)).length;
    if (hits) score.set(f.id, (score.get(f.id) ?? 0) + hits * 0.5);
  }
  return score;
}

const sameOrder = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Deterministic proposals: put the most relevant bullets and skills first, and
 * offer to show hidden facts that match the job. Wording is never changed here.
 */
export function tailorBasic(cv: Pick<Cv, "region_id" | "template_id" | "content">, facts: Fact[], analysis: JdAnalysis, items: MatchItem[]): TailorChange[] {
  const rel = relevance(facts, items, analysis);
  const doc = buildCvDocument(cv, facts);
  const changes: TailorChange[] = [];
  const byRel = (ids: string[]) => [...ids].sort((a, b) => (rel.get(b) ?? 0) - (rel.get(a) ?? 0));

  for (const section of doc.sections) {
    for (const block of section.blocks) {
      if (section.id === "experience" && block.kind === "entry" && block.bullets.length > 1) {
        const before = block.bullets.map((b) => b.source_fact_id!).filter(Boolean);
        const after = byRel(before);
        if (!sameOrder(before, after)) {
          changes.push({
            id: `order:${block.fact_id}`,
            kind: "order",
            group: [block.title.text, block.subtitle].filter(Boolean).join(", "),
            before,
            after,
            labels: Object.fromEntries(block.bullets.map((b) => [b.source_fact_id!, b.text])),
            flags: [],
          });
        }
      }
      if (section.id === "skills" && block.kind === "inline" && block.items.length > 1) {
        const before = block.items.map((i) => i.source_fact_id!).filter(Boolean);
        const after = byRel(before);
        if (!sameOrder(before, after)) {
          changes.push({ id: "order:skills", kind: "order", group: "Skills", before, after, labels: Object.fromEntries(block.items.map((i) => [i.source_fact_id!, i.text])), flags: [] });
        }
      }
    }
  }

  const reqText = new Map(requirementsOf(analysis).map((r) => [r.key, r.text]));
  for (const id of cv.content.excluded_fact_ids) {
    const f = facts.find((x) => x.id === id);
    if (!f || !f.confirmed || !(rel.get(id) ?? 0)) continue;
    const why = items.find((i) => i.fact_ids.includes(id) && i.level !== "gap");
    changes.push({
      id: `include:${id}`,
      kind: "include",
      fact_id: id,
      text: factText(f, new Map(facts.map((x) => [x.id, x]))),
      reason: why ? `Matches "${reqText.get(why.key) ?? why.text}".` : "Uses words from this job.",
      flags: [],
    });
  }
  return changes;
}
