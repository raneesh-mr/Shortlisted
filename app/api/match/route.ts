import { NextResponse } from "next/server";
import { allow, apiError, llmErrorResponse, zodError } from "@/lib/api";
import { requirementsOf } from "@/lib/jd/basic";
import { matchBasic, matchBasis } from "@/lib/jd/match";
import type { MatchResult } from "@/lib/jd/schema";
import { LlmError, llmConfigured } from "@/lib/llm";
import { getServerSupabase, getUserId } from "@/lib/supabase/server";
import { matchRequestSchema } from "@/lib/tailor/request";

const HOUR = 60 * 60 * 1000;

/** Requirements vs the user's confirmed facts: strong / partial / gap, each citing its facts. */
export async function POST(req: Request) {
  const userId = await getUserId(await getServerSupabase());
  if (!(await allow(req, "match", userId, { shared: "LIMIT_COMPOSE", limit: 60, windowMs: HOUR }))) return apiError("rate_limited", 429);
  const parsed = matchRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return zodError(parsed.error);
  const { mode, analysis, facts, not_done } = parsed.data;
  const reqs = requirementsOf(analysis);
  const notDone = new Set(not_done);
  try {
    const useAi = mode === "ai" && llmConfigured();
    const items = useAi ? await (await import("@/lib/jd/ai")).matchWithAi(reqs, facts, notDone) : matchBasic(reqs, facts, { notDone });
    const result: MatchResult = { method: useAi ? "ai" : "basic", items, basis: matchBasis(reqs, facts) };
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof LlmError) return llmErrorResponse(err.code);
    console.error("[match] failed", { name: err instanceof Error ? err.name : "unknown" });
    return apiError("server_error", 500);
  }
}
