// Verifies RLS against a real Supabase project: a second user must not see the first user's rows.
// Usage: npm run verify:rls   (reads .env.local; needs the service role key)
// Creates two throwaway users, checks isolation on every table, then deletes them.
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(url, service, { auth: { persistSession: false } });
const users = [];
let failed = 0;
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
};

async function makeUser() {
  const email = `rls-test-${randomUUID()}@example.invalid`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  users.push(data.user.id);
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, client };
}

try {
  const a = await makeUser();
  const b = await makeUser();

  const fact = await a.client.from("facts").insert({ type: "skill", data: { name: "SQL" }, confirmed: true }).select().single();
  check(!fact.error, "user A can insert a fact");
  const cv = await a.client.from("cvs").insert({ title: "CV", region_id: "uk", template_id: "modern", content: {} }).select().single();
  check(!cv.error, "user A can insert a CV");
  await a.client.from("consents").insert({ purpose: "core", text_version: "test", granted: true });
  await a.client.storage.from("user-files").upload(`${a.id}/test.txt`, new Blob(["x"]), { contentType: "text/plain" });

  for (const table of ["profiles", "facts", "cvs", "cv_versions", "consents", "applications", "emails", "audit"]) {
    const { data } = await b.client.from(table).select("*").eq("user_id", a.id);
    check((data ?? []).length === 0, `user B cannot read A's ${table}`);
  }
  const upd = await b.client.from("facts").update({ data: { name: "hacked" } }).eq("id", fact.data.id).select();
  check((upd.data ?? []).length === 0, "user B cannot update A's fact");
  const ins = await b.client.from("facts").insert({ user_id: a.id, type: "skill", data: { name: "x" } });
  check(Boolean(ins.error), "user B cannot insert a row owned by A");
  const files = await b.client.storage.from("user-files").list(a.id);
  check((files.data ?? []).length === 0, "user B cannot list A's files");
  const consentUpdate = await a.client.from("consents").update({ granted: false }).eq("user_id", a.id).select();
  check((consentUpdate.data ?? []).length === 0, "consent log is append-only");
} catch (err) {
  console.error("Error:", err.message);
  failed++;
} finally {
  for (const id of users) {
    const { data } = await admin.storage.from("user-files").list(id);
    if (data?.length) await admin.storage.from("user-files").remove(data.map((f) => `${id}/${f.name}`));
    await admin.auth.admin.deleteUser(id);
  }
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll RLS checks passed");
process.exit(failed ? 1 : 0);
