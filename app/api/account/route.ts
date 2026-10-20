import { NextResponse } from "next/server";
import { z } from "zod";
import { DELETE_PHRASE } from "@/lib/account";
import { allow, apiError } from "@/lib/api";
import { getAdminSupabase, getServerSupabase, getUserId } from "@/lib/supabase/server";

const bodySchema = z.object({ confirm: z.literal(DELETE_PHRASE) });
const HOUR = 60 * 60 * 1000;

async function removeStorage(admin: ReturnType<typeof getAdminSupabase>, prefix: string): Promise<void> {
  // Walk the user's folder and delete every object, including nested folders.
  const { data, error } = await admin.storage.from("user-files").list(prefix, { limit: 1000 });
  if (error) throw error;
  const files = data.filter((o) => o.id).map((o) => `${prefix}/${o.name}`);
  const folders = data.filter((o) => !o.id).map((o) => `${prefix}/${o.name}`);
  for (const f of folders) await removeStorage(admin, f);
  if (files.length) {
    const { error: rmError } = await admin.storage.from("user-files").remove(files);
    if (rmError) throw rmError;
  }
}

/**
 * Hard delete. Removes storage files, then the auth user; every table row
 * cascades from auth.users. Requires the typed confirmation phrase.
 */
export async function DELETE(req: Request) {
  const supabase = await getServerSupabase();
  const userId = await getUserId(supabase);
  if (!userId) return apiError("unauthorized", 401);
  if (!(await allow(req, "account-delete", userId, { shared: "LIMIT_ACCOUNT", limit: 5, windowMs: HOUR }))) return apiError("rate_limited", 429);

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return apiError("bad_request", 400);

  let admin: ReturnType<typeof getAdminSupabase>;
  try {
    admin = getAdminSupabase();
  } catch {
    return apiError("not_configured", 503);
  }

  try {
    await removeStorage(admin, userId);
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
    // Anonymous record that a deletion happened; no user id, no personal data.
    await admin.from("audit").insert({ user_id: null, event: "account.deleted", metadata: {} });
  } catch (err) {
    console.error("[account-delete] failed", { name: err instanceof Error ? err.name : "unknown" });
    return apiError("server_error", 500);
  }

  await supabase!.auth.signOut().catch(() => undefined);
  return NextResponse.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
}
