import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Runs the real migration in an in-process Postgres with a minimal stand-in for
 * Supabase's auth and storage schemas, then checks RLS as two different users.
 * scripts/verify-rls.mjs runs the same idea against a live Supabase project.
 */

const SUPABASE_STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema auth, storage to authenticated;
grant execute on function auth.uid() to authenticated;
`;

const GRANTS = `
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
`;

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

let db: PGlite;

async function as<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`);
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const dir = join(process.cwd(), "supabase", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(dir, file), "utf8"));
  }
  await db.exec(GRANTS);
  await db.query(`insert into auth.users (id, email) values ($1, 'a@example.com'), ($2, 'b@example.com')`, [A, B]);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("row level security", () => {
  it("creates a profile row for each new user", async () => {
    const { rows } = await db.query(`select user_id from public.profiles order by user_id`);
    expect(rows).toHaveLength(2);
  });

  it("a user can create and read their own facts", async () => {
    await as(A, () => db.query(`insert into public.facts (type, data, confirmed) values ('skill', '{"name":"SQL"}', true)`));
    const { rows } = await as(A, () => db.query(`select * from public.facts`));
    expect(rows).toHaveLength(1);
  });

  it("a second user cannot read, change or delete the first user's rows", async () => {
    const read = await as(B, () => db.query(`select * from public.facts`));
    expect(read.rows).toHaveLength(0);
    const upd = await as(B, () => db.query(`update public.facts set data = '{"name":"hacked"}'`));
    expect(upd.affectedRows).toBe(0);
    const del = await as(B, () => db.query(`delete from public.facts`));
    expect(del.affectedRows).toBe(0);
    const profiles = await as(B, () => db.query(`select user_id from public.profiles`));
    expect(profiles.rows).toEqual([{ user_id: B }]);
  });

  it("a user cannot insert rows owned by someone else", async () => {
    await expect(
      as(B, () => db.query(`insert into public.facts (user_id, type, data) values ($1, 'skill', '{"name":"x"}')`, [A])),
    ).rejects.toThrow(/row-level security/);
  });

  it("anonymous requests see nothing", async () => {
    await db.exec(`set role anon`);
    try {
      await expect(db.query(`select * from public.facts`)).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec(`reset role`);
    }
  });

  it("applications and emails (with composer data) are private to their owner", async () => {
    const { rows } = await as(A, () =>
      db.query<{ id: string }>(`insert into public.applications (role, company, compose) values ('FM', 'Marina', '{"tone":"warm"}') returning id`),
    );
    const appId = rows[0]!.id;
    const email = await as(A, () =>
      db.query<{ id: string }>(`insert into public.emails (application_id, variant, subject, body, recipient, meta) values ($1, 'apply_direct', 'S', 'B', 'x@example.com', '{"method":"basic"}') returning id`, [appId]),
    );
    await as(A, () => db.query(`update public.applications set email_id = $1 where id = $2`, [email.rows[0]!.id, appId]));
    expect((await as(B, () => db.query(`select * from public.applications`))).rows).toHaveLength(0);
    expect((await as(B, () => db.query(`select * from public.emails`))).rows).toHaveLength(0);
    // B can't attach rows to A's application, CV or email, even knowing the ids.
    await expect(
      as(B, () => db.query(`insert into public.emails (application_id, variant, subject, body) values ($1, 'follow_up', 'S', 'B')`, [appId])),
    ).rejects.toThrow(/row-level security/);
    await expect(as(B, () => db.query(`insert into public.applications (email_id) values ($1)`, [email.rows[0]!.id]))).rejects.toThrow(/row-level security/);
    const cv = await as(A, () => db.query<{ id: string }>(`insert into public.cvs (title, region_id, template_id, content) values ('CV', 'uk', 'modern', '{}') returning id`));
    await expect(as(B, () => db.query(`insert into public.cv_versions (cv_id, title, content) values ($1, 'x', '{}')`, [cv.rows[0]!.id]))).rejects.toThrow(/row-level security/);
    await expect(
      as(B, () => db.query(`insert into public.cvs (title, region_id, template_id, content, base_cv_id) values ('Copy', 'uk', 'modern', '{}', $1)`, [cv.rows[0]!.id])),
    ).rejects.toThrow(/row-level security/);
    await expect(as(B, () => db.query(`insert into public.applications (base_cv_id) values ($1)`, [cv.rows[0]!.id]))).rejects.toThrow(/row-level security/);
    expect((await as(A, () => db.query(`select * from public.emails`))).rows).toHaveLength(1);
  });

  it("purchases are read-only for users and private to their owner", async () => {
    const cv = await as(A, () => db.query<{ id: string }>(`insert into public.cvs (title, region_id, template_id, content) values ('Paid CV', 'uk', 'modern', '{}') returning id`));
    // Only the server (superuser here, service role in production) records a payment.
    await db.query(`insert into public.purchases (user_id, cv_id, sku, amount, order_id, status) values ($1, $2, 'cv_download', 19900, 'order_test_1', 'paid')`, [A, cv.rows[0]!.id]);
    expect((await as(A, () => db.query(`select * from public.purchases`))).rows).toHaveLength(1);
    expect((await as(B, () => db.query(`select * from public.purchases`))).rows).toHaveLength(0);
    // A user can't grant themselves a purchase, or mark one paid.
    await expect(
      as(B, () => db.query(`insert into public.purchases (user_id, sku, amount, order_id, status) values ($1, 'cv_download', 1, 'order_fake', 'paid')`, [B])),
    ).rejects.toThrow(/row-level security/);
    const upd = await as(A, () => db.query(`update public.purchases set status = 'refunded'`));
    expect(upd.affectedRows).toBe(0);
  });

  it("consents are append-only for users", async () => {
    await as(A, () => db.query(`insert into public.consents (purpose, text_version, granted) values ('core', 'v1', true)`));
    const upd = await as(A, () => db.query(`update public.consents set granted = false`));
    expect(upd.affectedRows).toBe(0);
    const del = await as(A, () => db.query(`delete from public.consents`));
    expect(del.affectedRows).toBe(0);
  });

  it("keeps only the last 10 versions of a CV", async () => {
    const { rows } = await as(A, () =>
      db.query<{ id: string }>(`insert into public.cvs (title, region_id, template_id, content) values ('CV', 'uk', 'modern', '{}') returning id`),
    );
    const cvId = rows[0]!.id;
    for (let i = 0; i < 13; i++) {
      await as(A, () =>
        db.query(`insert into public.cv_versions (cv_id, title, content, created_at) values ($1, $2, '{}', now() + ($3 || ' seconds')::interval)`, [cvId, `v${i}`, String(i)]),
      );
    }
    const versions = await as(A, () => db.query<{ title: string }>(`select title from public.cv_versions where cv_id = $1 order by created_at desc`, [cvId]));
    expect(versions.rows).toHaveLength(10);
    expect(versions.rows[0]!.title).toBe("v12");
  });

  it("storage access is limited to the user's own folder", async () => {
    await as(A, () => db.query(`insert into storage.objects (bucket_id, name) values ('user-files', $1)`, [`${A}/cv.pdf`]));
    await expect(
      as(A, () => db.query(`insert into storage.objects (bucket_id, name) values ('user-files', $1)`, [`${B}/cv.pdf`])),
    ).rejects.toThrow(/row-level security/);
    const seen = await as(B, () => db.query(`select * from storage.objects`));
    expect(seen.rows).toHaveLength(0);
  });

  it("deleting the auth user removes all their rows", async () => {
    await db.query(`delete from auth.users where id = $1`, [A]);
    for (const table of ["profiles", "facts", "cvs", "cv_versions", "consents"]) {
      const { rows } = await db.query(`select 1 from public.${table} where user_id = $1`, [A]);
      expect(rows, table).toHaveLength(0);
    }
  });
});
