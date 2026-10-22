import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cvSchema, factSchema, type Cv, type Fact } from "@/lib/model";

export type PaidCv = { cv: Cv; facts: Fact[] };

/**
 * Loads a CV and the facts it renders from, as the signed-in user (RLS), and
 * confirms there's a paid purchase for it. The browser never supplies the
 * content of a paid download, so one payment can't unlock other CVs.
 */
export async function loadPaidCv(supabase: SupabaseClient, cvId: string): Promise<PaidCv | "not_found" | "unpaid"> {
  const [cvRes, paidRes, factsRes] = await Promise.all([
    supabase.from("cvs").select("*").eq("id", cvId).maybeSingle(),
    supabase.from("purchases").select("id").eq("cv_id", cvId).eq("status", "paid").limit(1),
    supabase.from("facts").select("id,type,data,confirmed,source,created_at,updated_at"),
  ]);
  const cv = cvSchema.safeParse(cvRes.data);
  if (cvRes.error || !cv.success) return "not_found";
  if (paidRes.error || !paidRes.data?.length) return "unpaid";
  const facts = (factsRes.data ?? []).flatMap((r) => {
    const p = factSchema.safeParse(r);
    return p.success ? [p.data] : [];
  });
  return { cv: cv.data, facts };
}

/** CVs this user has paid for (used by the account export). */
export async function paidCvIds(supabase: SupabaseClient): Promise<Set<string>> {
  const { data } = await supabase.from("purchases").select("cv_id").eq("status", "paid");
  return new Set((data ?? []).map((r) => r.cv_id as string | null).filter((x): x is string => !!x));
}
