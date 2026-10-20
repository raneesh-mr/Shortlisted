import { NextResponse } from "next/server";
import { z } from "zod";
import { allow, apiError, zodError } from "@/lib/api";
import { MAX_TEXT_CHARS } from "@/lib/import/limits";
import { runImport } from "@/lib/import/run";
import { importResultSchema } from "@/lib/import/types";
import { LlmError } from "@/lib/llm";
import { getServerSupabase, getUserId } from "@/lib/supabase/server";

// Files are read in the browser; only their text arrives here.
const bodySchema = z.object({
  mode: z.enum(["ai", "basic"]),
  text: z.string().trim().min(1).max(MAX_TEXT_CHARS),
});

const HOUR = 60 * 60 * 1000;

/** Parses CV text into unconfirmed facts. Nothing is stored server-side. */
export async function POST(req: Request) {
  const userId = await getUserId(await getServerSupabase());
  if (!(await allow(req, "cv-import", userId, { shared: "LIMIT_IMPORT", limit: 15, windowMs: HOUR }))) return apiError("rate_limited", 429);

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    const tooLong = body.error.issues.some((i) => i.code === "too_big");
    return tooLong ? apiError("too_large", 413) : zodError(body.error);
  }

  try {
    const result = importResultSchema.parse(await runImport(body.data.text, body.data.mode === "ai"));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof LlmError) {
      const map = { not_configured: "not_configured", refused: "ai_refused", invalid_output: "ai_invalid", unavailable: "ai_unavailable" } as const;
      return apiError(map[err.code], 502);
    }
    console.error("[cv-import] failed", { name: err instanceof Error ? err.name : "unknown" });
    return apiError("server_error", 500);
  }
}
