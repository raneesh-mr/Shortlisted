import "server-only";
import { llmConfigured } from "@/lib/llm";
import { checkCoverage } from "./coverage";
import { parseHeuristic } from "./heuristic";
import type { ImportResult } from "./types";

export async function runImport(text: string, preferAi: boolean): Promise<ImportResult> {
  const useAi = preferAi && llmConfigured();
  const draft = useAi ? await (await import("./ai")).parseWithAi(text) : parseHeuristic(text);
  const coverage = checkCoverage(text, draft.facts, draft.summary);
  return {
    method: useAi ? "ai" : "basic",
    facts: draft.facts,
    summary: draft.summary,
    attention: [...draft.notes, ...coverage.attention],
    unverified_fact_ids: coverage.unverified_fact_ids,
  };
}
