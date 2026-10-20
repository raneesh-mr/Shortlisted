import { NextResponse } from "next/server";
import { allow, apiError, llmErrorResponse, zodError } from "@/lib/api";
import { analyzeBasic } from "@/lib/jd/basic";
import { jdAnalysisSchema } from "@/lib/jd/schema";
import { LlmError, llmConfigured } from "@/lib/llm";
import { getServerSupabase, getUserId } from "@/lib/supabase/server";
import { analyzeRequestSchema } from "@/lib/tailor/request";

const HOUR = 60 * 60 * 1000;

/** Job description → structured requirements. Nothing is stored here; the browser saves the result. */
export async function POST(req: Request) {
  const userId = await getUserId(await getServerSupabase());
  if (!(await allow(req, "jd-analyze", userId, { shared: "LIMIT_COMPOSE", limit: 60, windowMs: HOUR }))) return apiError("rate_limited", 429);
  const parsed = analyzeRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return zodError(parsed.error);
  const { mode, jd_text, title, company } = parsed.data;
  try {
    const analysis =
      mode === "ai" && llmConfigured()
        ? await (await import("@/lib/jd/ai")).analyzeWithAi(jd_text, { title, company })
        : analyzeBasic(jd_text, { title, company });
    return NextResponse.json(jdAnalysisSchema.parse(analysis), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof LlmError) return llmErrorResponse(err.code);
    console.error("[jd-analyze] failed", { name: err instanceof Error ? err.name : "unknown" });
    return apiError("server_error", 500);
  }
}
