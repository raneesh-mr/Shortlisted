import type { Fact } from "@/lib/model";
import { BULLET_PREFIX, dateTokens, normaliseLines, tokens } from "./text";
import { isHeading } from "./heuristic";

function factTokenSet(fact: Fact, withDates: boolean): Set<string> {
  const values: string[] = [];
  const dates: (string | undefined)[] = [];
  for (const [k, v] of Object.entries(fact.data)) {
    if (k === "photo" || k === "work_id") continue;
    if (typeof v === "string") {
      if (/^\d{4}-\d{2}(-\d{2})?$/.test(v)) dates.push(v.slice(0, 7));
      else values.push(v);
    } else if (Array.isArray(v)) values.push(...v.filter((x): x is string => typeof x === "string"));
  }
  const set = new Set(values.flatMap(tokens));
  if (withDates) for (const d of dates) for (const t of dateTokens(d)) set.add(t);
  return set;
}

export interface CoverageReport {
  attention: string[];
  unverified_fact_ids: string[];
}

/**
 * Two-way check between the source text and parsed facts:
 *  - every meaningful source line must be explained by a fact (or the summary), else it needs attention;
 *  - every fact's wording must be found in the source, else it is flagged as unverified.
 */
export function checkCoverage(source: string, facts: Fact[], summary: string | null): CoverageReport {
  const lines = normaliseLines(source);
  const factSets = facts.map((f) => factTokenSet(f, true));
  const summarySet = new Set(tokens(summary ?? ""));
  const union = new Set<string>([...summarySet, ...factSets.flatMap((s) => [...s])]);

  const attention: string[] = [];
  for (const raw of lines) {
    const line = raw.replace(BULLET_PREFIX, "");
    if (isHeading(line)) continue;
    const lt = tokens(line);
    if (lt.length === 0) continue;
    const ratio = (set: Set<string>) => lt.filter((t) => set.has(t)).length / lt.length;
    const best = Math.max(ratio(summarySet), ...factSets.map(ratio));
    if (best >= 0.6 || ratio(union) >= 0.9) continue;
    attention.push(line);
  }

  const sourceTokens = new Set(tokens(source));
  const unverified_fact_ids = facts
    .filter((f) => {
      const ft = [...factTokenSet(f, false)];
      if (ft.length === 0) return false;
      const found = ft.filter((t) => sourceTokens.has(t)).length / ft.length;
      return found < 0.7;
    })
    .map((f) => f.id);

  return { attention, unverified_fact_ids };
}
