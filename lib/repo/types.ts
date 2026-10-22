import type { Application, Consent, Cv, CvVersion, EmailRecord, Fact, Profile, Purchase } from "@/lib/model";

export interface DataBundle {
  profile: Profile;
  facts: Fact[];
  cvs: Cv[];
  versions: CvVersion[];
  consents: Consent[];
  applications: Application[];
  emails: EmailRecord[];
}

/**
 * One interface, two homes for data: the browser (guest) or Supabase (account).
 * Components never know which one they're talking to.
 */
export interface Repo {
  readonly kind: "guest" | "account";
  getProfile(): Promise<Profile>;
  saveProfile(patch: Partial<Profile>): Promise<Profile>;
  listFacts(): Promise<Fact[]>;
  saveFacts(facts: Fact[]): Promise<void>;
  deleteFacts(ids: string[]): Promise<void>;
  listCvs(): Promise<Cv[]>;
  saveCv(cv: Cv): Promise<void>;
  deleteCv(id: string): Promise<void>;
  listVersions(cvId: string): Promise<CvVersion[]>;
  addVersion(cv: Cv): Promise<void>;
  listConsents(): Promise<Consent[]>;
  addConsents(consents: Consent[]): Promise<void>;
  listApplications(): Promise<Application[]>;
  saveApplication(app: Application): Promise<void>;
  deleteApplication(id: string): Promise<void>;
  listEmails(applicationId: string): Promise<EmailRecord[]>;
  saveEmail(email: EmailRecord): Promise<void>;
  /** Paid downloads. Guests never have any (paying requires an account). */
  listPurchases(): Promise<Purchase[]>;
  exportAll(): Promise<DataBundle>;
}

export const MAX_VERSIONS = 10;
