import { NextResponse } from "next/server";
import { allow, apiError, llmErrorResponse, zodError } from "@/lib/api";
import { LlmError, llmConfigured } from "@/lib/llm";
import { getServerSupabase, getUserId } from "@/lib/supabase/server";
import { tailorBasic } from "@/lib/tailor/basic";
import { tailorRequestSchema } from "@/lib/tailor/request";

const HOUR = 60 * 60 * 1000;
const MAX_BODY = 2 * 1024 * 1024;

/** Returns proposed changes only. Nothing is applied until the user accepts each one. */
export async function POST(req: Request) {
  const userId = await getUserId(await getServerSupabase());
  if (!(await allow(req, "cv-tailor", userId, { shared: "LIMIT_COMPOSE", limit: 60, windowMs: HOUR }))) return apiError("rate_limited", 429);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return apiError("too_large", 413);
  const parsed = tailorRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return zodError(parsed.error);
  const { mode, cv, facts, analysis, match, jd_text } = parsed.data;
  try {
    const useAi = mode === "ai" && llmConfigured();
    const changes = useAi
      ? await (await import("@/lib/tailor/ai")).tailorWithAi(cv, facts, analysis, match.items, jd_text)
      : tailorBasic(cv, facts, analysis, match.items);
    return NextResponse.json({ method: useAi ? "ai" : "basic", changes }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof LlmError) return llmErrorResponse(err.code);
    console.error("[cv-tailor] failed", { name: err instanceof Error ? err.name : "unknown" });
    return apiError("server_error", 500);
  }
}
