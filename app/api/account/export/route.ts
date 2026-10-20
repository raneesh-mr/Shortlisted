import { NextResponse } from "next/server";
import { z } from "zod";
import { allow, apiError, zodError } from "@/lib/api";
import { buildExportZip } from "@/lib/export/bundle";
import {
  applicationSchema,
  consentSchema,
  cvSchema,
  cvVersionSchema,
  emailRecordSchema,
  emptyProfile,
  factSchema,
  profileSchema,
} from "@/lib/model";
import { getServerSupabase, getUserId } from "@/lib/supabase/server";

const HOUR = 60 * 60 * 1000;
const MAX_BODY = 8 * 1024 * 1024;

const guestBundleSchema = z.object({
  profile: profileSchema,
  facts: z.array(factSchema),
  cvs: z.array(cvSchema),
  versions: z.array(cvVersionSchema),
  consents: z.array(consentSchema),
  applications: z.array(applicationSchema).default([]),
  emails: z.array(emailRecordSchema).default([]),
});

const zipResponse = (bytes: Uint8Array) =>
  new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/zip", "Cache-Control": "no-store" },
  });

/**
 * Signed in: exports every row the user owns (read with their own RLS session).
 * Guest: the browser sends its on-device data; we only package it and keep nothing.
 */
export async function POST(req: Request) {
  const supabase = await getServerSupabase();
  const userId = await getUserId(supabase);
  if (!(await allow(req, "account-export", userId, { shared: "LIMIT_ACCOUNT", limit: 10, windowMs: HOUR }))) return apiError("rate_limited", 429);

  if (supabase && userId) {
    const tables = ["profiles", "facts", "cvs", "cv_versions", "applications", "emails", "consents", "audit"] as const;
    const results = await Promise.all(tables.map((t) => supabase.from(t).select("*")));
    const failed = results.find((r) => r.error);
    if (failed) return apiError("server_error", 500);
    const rows = Object.fromEntries(tables.map((t, i) => [t, results[i]!.data ?? []])) as Record<(typeof tables)[number], Record<string, unknown>[]>;
    const profileRow = rows.profiles[0] ?? {};
    const profile = profileSchema.safeParse({ ...emptyProfile, ...Object.fromEntries(Object.entries(profileRow).filter(([, v]) => v !== null)) });
    const parse = <T,>(schema: z.ZodType<T>, list: unknown[]) => list.flatMap((r) => {
      const p = schema.safeParse(r);
      return p.success ? [p.data] : [];
    });
    const zip = await buildExportZip({
      account: { id: userId, exported_at: new Date().toISOString() },
      profile: profile.success ? profile.data : emptyProfile,
      facts: parse(factSchema, rows.facts),
      cvs: parse(cvSchema, rows.cvs),
      versions: parse(cvVersionSchema, rows.cv_versions),
      consents: parse(consentSchema, rows.consents),
      applications: parse(applicationSchema, rows.applications.map((r) => ({ ...r, role: r.role ?? "", company: r.company ?? "", jd_text: r.jd_text ?? "", notes: r.notes ?? "" }))),
      emails: parse(emailRecordSchema, rows.emails),
      audit: rows.audit,
      raw_rows: rows,
    });
    await supabase.from("audit").insert({ user_id: userId, event: "account.exported", metadata: {} });
    return zipResponse(zip);
  }

  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return apiError("too_large", 413);
  const body: unknown = await req.json().catch(() => null);
  const bundle = guestBundleSchema.safeParse(body);
  if (!bundle.success) return zodError(bundle.error);
  return zipResponse(await buildExportZip(bundle.data));
}
