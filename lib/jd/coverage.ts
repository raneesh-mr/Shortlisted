import type { RenderedCv } from "@/lib/cv/document";
import { contentStems } from "./match";

export interface KeywordCoverage {
  keyword: string;
  covered: boolean;
  /** The fact lines where it appears. */
  fact_ids: string[];
}

/**
 * A keyword counts only when it appears, in context, in a CV line that comes
 * from one of the user's facts. The summary and any free text don't count, so
 * adding words just to match earns nothing.
 */
export function keywordCoverage(doc: RenderedCv, keywords: string[]): KeywordCoverage[] {
  const lines: { stems: Set<string>; fact: string }[] = [];
  for (const s of doc.sections) {
    for (const b of s.blocks) {
      const ls = b.kind === "entry" ? [b.title, ...b.bullets] : b.kind === "inline" ? b.items : [];
      for (const l of ls) if (l.source_fact_id) lines.push({ stems: new Set(contentStems(l.text)), fact: l.source_fact_id });
    }
  }
  return keywords.map((keyword) => {
    const want = contentStems(keyword);
    const hits = want.length ? lines.filter((l) => want.every((w) => l.stems.has(w))) : [];
    return { keyword, covered: hits.length > 0, fact_ids: [...new Set(hits.map((h) => h.fact))] };
  });
}
