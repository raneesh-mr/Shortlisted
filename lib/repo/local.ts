import { brand } from "@/config/brand";
import { clear, createStore, del, get, set, type UseStore } from "idb-keyval";
import {
  emptyProfile,
  newId,
  nowIso,
  type Application,
  type Consent,
  type Cv,
  type CvVersion,
  type EmailRecord,
  type Fact,
  type Profile,
} from "@/lib/model";
import { MAX_VERSIONS, type DataBundle, type Repo } from "./types";

/** Guest data lives only in this browser (IndexedDB). Nothing is sent to a server. */
export class LocalRepo implements Repo {
  readonly kind = "guest" as const;
  private store: UseStore;

  constructor(dbName = `${brand.slug}-guest`) {
    this.store = createStore(dbName, "kv");
  }

  private async read<T>(key: string, fallback: T): Promise<T> {
    return ((await get<T>(key, this.store)) ?? fallback) as T;
  }
  private write<T>(key: string, value: T) {
    return set(key, value, this.store);
  }

  async getProfile(): Promise<Profile> {
    return { ...emptyProfile, ...(await this.read<Partial<Profile>>("profile", {})) };
  }
  async saveProfile(patch: Partial<Profile>): Promise<Profile> {
    const next = { ...(await this.getProfile()), ...patch };
    await this.write("profile", next);
    return next;
  }

  listFacts() {
    return this.read<Fact[]>("facts", []);
  }
  async saveFacts(facts: Fact[]) {
    const all = await this.listFacts();
    const byId = new Map(all.map((f) => [f.id, f]));
    for (const f of facts) byId.set(f.id, { ...f, updated_at: nowIso() });
    await this.write("facts", [...byId.values()]);
  }
  async deleteFacts(ids: string[]) {
    const drop = new Set(ids);
    await this.write("facts", (await this.listFacts()).filter((f) => !drop.has(f.id)));
  }

  listCvs() {
    return this.read<Cv[]>("cvs", []);
  }
  async saveCv(cv: Cv) {
    const all = (await this.listCvs()).filter((c) => c.id !== cv.id);
    await this.write("cvs", [{ ...cv, updated_at: nowIso() }, ...all]);
  }
  async deleteCv(id: string) {
    await this.write(
      "cvs",
      (await this.listCvs())
        .filter((c) => c.id !== id)
        .map((c) => (c.base_cv_id === id ? { ...c, base_cv_id: null } : c)),
    );
    await del(`versions:${id}`, this.store);
  }

  listVersions(cvId: string) {
    return this.read<CvVersion[]>(`versions:${cvId}`, []);
  }
  async addVersion(cv: Cv) {
    const version: CvVersion = { id: newId(), cv_id: cv.id, title: cv.title, content: cv.content, created_at: nowIso() };
    const list = [version, ...(await this.listVersions(cv.id))].slice(0, MAX_VERSIONS);
    await this.write(`versions:${cv.id}`, list);
  }

  listConsents() {
    return this.read<Consent[]>("consents", []);
  }
  async addConsents(consents: Consent[]) {
    await this.write("consents", [...(await this.listConsents()), ...consents]);
  }

  listApplications() {
    return this.read<Application[]>("applications", []);
  }
  async saveApplication(app: Application) {
    const rest = (await this.listApplications()).filter((a) => a.id !== app.id);
    await this.write("applications", [{ ...app, updated_at: nowIso() }, ...rest]);
  }
  async deleteApplication(id: string) {
    await this.write("applications", (await this.listApplications()).filter((a) => a.id !== id));
    await this.write("emails", (await this.allEmails()).filter((e) => e.application_id !== id));
  }
  private allEmails() {
    return this.read<EmailRecord[]>("emails", []);
  }
  async listEmails(applicationId: string) {
    return (await this.allEmails()).filter((e) => e.application_id === applicationId);
  }
  async saveEmail(email: EmailRecord) {
    const rest = (await this.allEmails()).filter((e) => e.id !== email.id);
    await this.write("emails", [{ ...email, updated_at: nowIso() }, ...rest]);
  }

  async listPurchases() {
    return [];
  }

  async exportAll(): Promise<DataBundle> {
    const cvs = await this.listCvs();
    const versions = (await Promise.all(cvs.map((c) => this.listVersions(c.id)))).flat();
    return {
      profile: await this.getProfile(),
      facts: await this.listFacts(),
      cvs,
      versions,
      consents: await this.listConsents(),
      applications: await this.listApplications(),
      emails: await this.allEmails(),
    };
  }

  /** Hard delete of everything on this device. */
  clearAll() {
    return clear(this.store);
  }

  async hasData(): Promise<boolean> {
    return (await this.listFacts()).length > 0 || (await this.listCvs()).length > 0 || (await this.listApplications()).length > 0;
  }
}
