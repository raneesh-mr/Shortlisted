import type { SupabaseClient } from "@supabase/supabase-js";
import { brand } from "@/config/brand";
import { createStore, get, set, type UseStore } from "idb-keyval";
import {
  applicationSchema,
  consentSchema,
  cvSchema,
  cvVersionSchema,
  emailRecordSchema,
  emptyProfile,
  factSchema,
  profileSchema,
  type Application,
  type Consent,
  type Cv,
  type CvVersion,
  type EmailRecord,
  type Fact,
  type Profile,
} from "@/lib/model";
import type { DataBundle, Repo } from "./types";

export class OfflineError extends Error {
  constructor() {
    super("offline");
  }
}

const profileKeys = Object.keys(profileSchema.shape) as (keyof Profile)[];

function pickProfile(row: Record<string, unknown> | null): Profile {
  const out: Record<string, unknown> = { ...emptyProfile };
  if (row) for (const k of profileKeys) if (row[k] !== undefined && row[k] !== null) out[k] = row[k];
  return profileSchema.parse(out);
}

/**
 * Account data in Supabase (RLS-protected). Reads are mirrored to IndexedDB so
 * saved CVs stay viewable offline; writes need a connection.
 */
export class RemoteRepo implements Repo {
  readonly kind = "account" as const;
  private cache: UseStore;

  constructor(
    private readonly db: SupabaseClient,
    private readonly userId: string,
    /** Called when a read fell back to the offline copy. */
    private readonly onStale: () => void = () => {},
  ) {
    this.cache = createStore(`${brand.slug}-cache-${userId}`, "kv");
  }

  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    try {
      const value = await load();
      void set(key, value, this.cache);
      return value;
    } catch (err) {
      const hit = await get<T>(key, this.cache);
      if (hit === undefined) throw err;
      this.onStale();
      return hit;
    }
  }

  /** Removes the offline copy (sign-out and account deletion). */
  static async clearCache(userId: string) {
    const { clear } = await import("idb-keyval");
    await clear(createStore(`${brand.slug}-cache-${userId}`, "kv"));
  }

  private check<T>(res: { data: T; error: { message: string } | null }): T {
    if (res.error) {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new OfflineError();
      throw new Error(res.error.message);
    }
    return res.data;
  }

  async getProfile(): Promise<Profile> {
    return this.cached("profile", async () => {
      const row = this.check(await this.db.from("profiles").select("*").eq("user_id", this.userId).maybeSingle());
      return pickProfile(row as Record<string, unknown> | null);
    });
  }
  async saveProfile(patch: Partial<Profile>): Promise<Profile> {
    const next = { ...(await this.getProfile()), ...patch };
    this.check(await this.db.from("profiles").upsert({ user_id: this.userId, ...next }));
    void set("profile", next, this.cache);
    return next;
  }

  async listFacts(): Promise<Fact[]> {
    return this.cached("facts", async () => {
      const rows = this.check(await this.db.from("facts").select("id,type,data,confirmed,source,created_at,updated_at").order("created_at"));
      return (rows ?? []).flatMap((r) => {
        const parsed = factSchema.safeParse(r);
        return parsed.success ? [parsed.data] : [];
      });
    });
  }
  async saveFacts(facts: Fact[]) {
    if (!facts.length) return;
    this.check(
      await this.db.from("facts").upsert(
        facts.map((f) => ({ id: f.id, user_id: this.userId, type: f.type, data: f.data, confirmed: f.confirmed, source: f.source, created_at: f.created_at })),
      ),
    );
  }
  async deleteFacts(ids: string[]) {
    if (ids.length) this.check(await this.db.from("facts").delete().in("id", ids));
  }

  async listCvs(): Promise<Cv[]> {
    return this.cached("cvs", async () => {
      const rows = this.check(await this.db.from("cvs").select("*").order("updated_at", { ascending: false }));
      return (rows ?? []).flatMap((r) => {
        const parsed = cvSchema.safeParse(r);
        return parsed.success ? [parsed.data] : [];
      });
    });
  }
  async saveCv(cv: Cv) {
    const { updated_at: _ignored, ...row } = cv;
    void _ignored;
    this.check(await this.db.from("cvs").upsert({ ...row, user_id: this.userId }));
  }
  async deleteCv(id: string) {
    this.check(await this.db.from("cvs").delete().eq("id", id));
  }

  async listVersions(cvId: string): Promise<CvVersion[]> {
    const rows = this.check(
      await this.db.from("cv_versions").select("id,cv_id,title,content,created_at").eq("cv_id", cvId).order("created_at", { ascending: false }),
    );
    return (rows ?? []).flatMap((r) => {
      const parsed = cvVersionSchema.safeParse(r);
      return parsed.success ? [parsed.data] : [];
    });
  }
  async addVersion(cv: Cv) {
    this.check(await this.db.from("cv_versions").insert({ user_id: this.userId, cv_id: cv.id, title: cv.title, content: cv.content }));
  }

  async listConsents(): Promise<Consent[]> {
    const rows = this.check(await this.db.from("consents").select("purpose,text_version,granted,granted_at").order("granted_at"));
    return (rows ?? []).flatMap((r) => {
      const parsed = consentSchema.safeParse(r);
      return parsed.success ? [parsed.data] : [];
    });
  }
  async addConsents(consents: Consent[]) {
    if (!consents.length) return;
    this.check(await this.db.from("consents").insert(consents.map((c) => ({ ...c, user_id: this.userId }))));
  }

  async listApplications(): Promise<Application[]> {
    return this.cached("applications", async () => {
      const rows = this.check(
        await this.db.from("applications").select("id,role,company,jd_text,cv_id,base_cv_id,email_id,status,jd_analysis,match,gaps,tailor,compose,notes,created_at,updated_at").order("updated_at", { ascending: false }),
      );
      return (rows ?? []).flatMap((r) => {
        const parsed = applicationSchema.safeParse({ ...r, notes: r.notes ?? "", role: r.role ?? "", company: r.company ?? "", jd_text: r.jd_text ?? "" });
        return parsed.success ? [parsed.data] : [];
      });
    });
  }
  async saveApplication(app: Application) {
    const { updated_at: _ignored, ...row } = app;
    void _ignored;
    this.check(await this.db.from("applications").upsert({ ...row, user_id: this.userId }));
  }
  async deleteApplication(id: string) {
    this.check(await this.db.from("applications").delete().eq("id", id));
  }
  async listEmails(applicationId: string): Promise<EmailRecord[]> {
    const rows = this.check(
      await this.db
        .from("emails")
        .select("id,application_id,variant,subject,body,recipient,meta,lint_report,created_at,updated_at")
        .eq("application_id", applicationId)
        .order("created_at", { ascending: false }),
    );
    return (rows ?? []).flatMap((r) => {
      const parsed = emailRecordSchema.safeParse(r);
      return parsed.success ? [parsed.data] : [];
    });
  }
  /** Applications must exist before their emails (foreign key). */
  async saveEmail(email: EmailRecord) {
    const { updated_at: _ignored, ...row } = email;
    void _ignored;
    this.check(await this.db.from("emails").upsert({ ...row, user_id: this.userId }));
  }

  async exportAll(): Promise<DataBundle> {
    const cvs = await this.listCvs();
    const versions = (await Promise.all(cvs.map((c) => this.listVersions(c.id)))).flat();
    const applications = await this.listApplications();
    const emails = (await Promise.all(applications.map((a) => this.listEmails(a.id)))).flat();
    return { profile: await this.getProfile(), facts: await this.listFacts(), cvs, versions, consents: await this.listConsents(), applications, emails };
  }

  /** Copies a guest's on-device data into this account. Ids are UUIDs, so upserts are safe to retry. */
  async importBundle(bundle: Omit<DataBundle, "profile"> & { profile: Profile }) {
    await this.saveProfile({ ...bundle.profile, guest_migrated: true });
    await this.saveFacts(bundle.facts);
    const ordered = [...bundle.cvs].sort((a, b) => (a.base_cv_id ? 1 : 0) - (b.base_cv_id ? 1 : 0));
    for (const cv of ordered) await this.saveCv(cv);
    if (bundle.versions.length) {
      this.check(
        await this.db.from("cv_versions").upsert(
          bundle.versions.map((v) => ({ id: v.id, user_id: this.userId, cv_id: v.cv_id, title: v.title, content: v.content, created_at: v.created_at })),
        ),
      );
    }
    await this.addConsents(bundle.consents);
    // Applications and emails point at each other: insert apps without the link, then emails, then relink.
    for (const app of bundle.applications ?? []) await this.saveApplication({ ...app, email_id: null });
    for (const email of bundle.emails ?? []) await this.saveEmail(email);
    for (const app of (bundle.applications ?? []).filter((a) => a.email_id)) await this.saveApplication(app);
  }
}
