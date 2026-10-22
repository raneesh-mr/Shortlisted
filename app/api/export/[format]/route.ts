import { NextResponse } from "next/server";
import { allow, apiError, zodError } from "@/lib/api";
import { buildCvDocument } from "@/lib/cv/document";
import { renderDocx } from "@/lib/cv/docx";
import { exportInputSchema } from "@/lib/cv/export-input";
import { PdfCharsetError, renderPdf } from "@/lib/cv/pdf";
import { loadPaidCv } from "@/lib/pay/entitlement";
import { getServerSupabase, getUserId } from "@/lib/supabase/server";

const MINUTE = 60 * 1000;
const MAX_BODY = 2 * 1024 * 1024;

/**
 * "measure": page count and readability for the builder; free, returns no file.
 * "file": the paid download. The server loads the CV from the database (as the
 * signed-in user) and requires a paid purchase for it.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/export/[format]">) {
  const { format } = await ctx.params;
  if (format !== "pdf" && format !== "docx") return apiError("bad_request", 404);

  const supabase = await getServerSupabase();
  const userId = await getUserId(supabase);
  if (!(await allow(req, "export", userId, { shared: "LIMIT_EXPORT", limit: 60, windowMs: MINUTE }))) return apiError("rate_limited", 429);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return apiError("too_large", 413);

  const input = exportInputSchema.safeParse(await req.json().catch(() => null));
  if (!input.success) return zodError(input.error);

  try {
    if (input.data.mode === "measure") {
      if (format !== "pdf") return apiError("bad_request", 400);
      const { pages } = await renderPdf(buildCvDocument(input.data.cv, input.data.facts));
      // Standard fonts with real text: readable by construction (tests/unit/export.test.ts reads it back).
      return NextResponse.json({ pages, extractable: true }, { headers: { "Cache-Control": "no-store" } });
    }

    if (!supabase || !userId) return apiError("unauthorized", 401);
    const paid = await loadPaidCv(supabase, input.data.cv_id);
    if (paid === "not_found") return apiError("not_found", 404);
    if (paid === "unpaid") return apiError("payment_required", 402, { cv_id: input.data.cv_id });
    const doc = buildCvDocument(paid.cv, paid.facts);

    if (format === "docx") {
      const bytes = await renderDocx(doc);
      return new NextResponse(Buffer.from(bytes), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Cache-Control": "no-store",
        },
      });
    }
    const { bytes, pages } = await renderPdf(doc);
    return new NextResponse(Buffer.from(bytes), {
      headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store", "X-Page-Count": String(pages) },
    });
  } catch (err) {
    if (err instanceof PdfCharsetError) return apiError("unsupported_characters", 422, { chars: err.chars.slice(0, 20) });
    console.error("[export] failed", { format, name: err instanceof Error ? err.name : "unknown" });
    return apiError("server_error", 500);
  }
}
