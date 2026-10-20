import { NextResponse } from "next/server";
import { z } from "zod";
import { allow, apiError, zodError } from "@/lib/api";
import { lintBullets, lintText } from "@/lib/humanizer/lint";

const bodySchema = z.object({
  text: z.string().max(20_000),
  /** The user's own facts and inputs; numbers, names and praise words must come from here. */
  source: z.string().max(60_000).optional(),
  bullets: z.array(z.string().max(600)).max(100).optional(),
  allow_exclamation: z.boolean().optional(),
});

const MINUTE = 60 * 1000;

/** Deterministic humanizer lint (no AI). The same function also runs in the browser after edits. */
export async function POST(req: Request) {
  if (!(await allow(req, "lint", null, { shared: "LIMIT_EXPORT", limit: 120, windowMs: MINUTE }))) return apiError("rate_limited", 429);
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return zodError(parsed.error);
  const { text, source, bullets, allow_exclamation } = parsed.data;
  const report = lintText(text, { source, allowExclamation: allow_exclamation });
  if (bullets?.length) report.findings.push(...lintBullets(bullets));
  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
