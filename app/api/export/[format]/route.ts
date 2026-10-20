import { NextResponse } from "next/server";
import { allow, apiError, zodError } from "@/lib/api";
import { buildCvDocument } from "@/lib/cv/document";
import { renderDocx } from "@/lib/cv/docx";
import { exportInputSchema } from "@/lib/cv/export-input";
import { PdfCharsetError, renderPdf } from "@/lib/cv/pdf";
import { getServerSupabase, getUserId } from "@/lib/supabase/server";

const MINUTE = 60 * 1000;
const MAX_BODY = 2 * 1024 * 1024;

/** Builds the file from the user's facts on request. Nothing is stored. */
export async function POST(req: Request, ctx: RouteContext<"/api/export/[format]">) {
  const { format } = await ctx.params;
  if (format !== "pdf" && format !== "docx") return apiError("bad_request", 404);

  const userId = await getUserId(await getServerSupabase());
  if (!(await allow(req, "export", userId, { shared: "LIMIT_EXPORT", limit: 60, windowMs: MINUTE }))) return apiError("rate_limited", 429);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return apiError("too_large", 413);

  const body: unknown = await req.json().catch(() => null);
  const input = exportInputSchema.safeParse(body);
  if (!input.success) return zodError(input.error);
  const { cv, facts, mode } = input.data;
  const doc = buildCvDocument(cv, facts);

  try {
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
    if (mode === "measure") {
      // The PDF only ever uses standard fonts with real text, and renderPdf refuses
      // characters it can't encode, so a successful render is extractable by
      // construction. tests/unit/export.test.ts reads the text back to prove it.
      return NextResponse.json({ pages, extractable: true }, { headers: { "Cache-Control": "no-store" } });
    }
    return new NextResponse(Buffer.from(bytes), {
      headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store", "X-Page-Count": String(pages) },
    });
  } catch (err) {
    if (err instanceof PdfCharsetError) return apiError("unsupported_characters", 422, { chars: err.chars.slice(0, 20) });
    console.error("[export] failed", { format, name: err instanceof Error ? err.name : "unknown" });
    return apiError("server_error", 500);
  }
}
