import { NextResponse } from "next/server";
import { allow, apiError, zodError } from "@/lib/api";
import { composeBasic } from "@/lib/email/basic";
import { ComposeInputError, buildContext, composeRequestSchema, lintDraft, type ComposeResult } from "@/lib/email/compose";
import { LlmError, llmConfigured } from "@/lib/llm";
import { getServerSupabase, getUserId } from "@/lib/supabase/server";

const HOUR = 60 * 60 * 1000;
const MAX_BODY = 2 * 1024 * 1024;

/**
 * Drafts an email (or rewrites one paragraph) from the user's confirmed facts.
 * Nothing is stored or sent here; the browser saves the result.
 */
export async function POST(req: Request) {
  const userId = await getUserId(await getServerSupabase());
  if (!(await allow(req, "email-compose", userId, { shared: "LIMIT_COMPOSE", limit: 60, windowMs: HOUR }))) return apiError("rate_limited", 429);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return apiError("too_large", 413);

  const parsed = composeRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return zodError(parsed.error);
  const request = parsed.data;

  let ctx;
  try {
    ctx = buildContext(request);
  } catch (err) {
    if (err instanceof ComposeInputError) return apiError("missing_inputs", 422, { fields: err.missing });
    throw err;
  }

  const useAi = request.mode === "ai" && llmConfigured();
  if (request.rewrite && !useAi) return apiError("ai_required", 422);

  try {
    if (request.rewrite) {
      const { rewriteWithAi } = await import("@/lib/email/ai");
      const paragraph = await rewriteWithAi(ctx, request.rewrite.slot, request.rewrite.paragraphs);
      const paragraphs = request.rewrite.paragraphs.map((p) => (p.slot === paragraph.slot ? paragraph : p));
      const draft = { subjects: request.rewrite.subjects, paragraphs };
      return json({ method: "ai", tone: ctx.tone, length: ctx.length, ...draft, lint: lintDraft(draft, ctx), claim_source: ctx.source, regenerated: false });
    }

    if (useAi) {
      const { composeWithAi } = await import("@/lib/email/ai");
      const { draft, lint, regenerated } = await composeWithAi(ctx);
      return json({ method: "ai", tone: ctx.tone, length: ctx.length, ...draft, lint, claim_source: ctx.source, regenerated });
    }

    const draft = composeBasic(ctx);
    return json({ method: "basic", tone: ctx.tone, length: ctx.length, ...draft, lint: lintDraft(draft, ctx), claim_source: ctx.source, regenerated: false });
  } catch (err) {
    if (err instanceof LlmError) {
      const map = { not_configured: "not_configured", refused: "ai_refused", invalid_output: "ai_invalid", unavailable: "ai_unavailable" } as const;
      return apiError(map[err.code], 502);
    }
    console.error("[email-compose] failed", { name: err instanceof Error ? err.name : "unknown" });
    return apiError("server_error", 500);
  }
}

function json(result: ComposeResult) {
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
