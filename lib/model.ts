import { z } from "zod";
import { personalFields, sectionIds, spellings } from "@/config/regions/schema";
import { gapDecisionSchema, jdAnalysisSchema, matchResultSchema, tailorChangeSchema, tailorDecisionSchema } from "@/lib/jd/schema";

/* ---------- Facts: the user's confirmed truth. Every CV line cites one. ---------- */

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");
const optText = (max: number) => z.string().trim().max(max).optional();

export const contactData = z.object({
  full_name: z.string().trim().max(120),
  headline: optText(160),
  email: optText(200),
  phone: optText(60),
  city: optText(120),
  country: optText(2),
  links: z.array(z.string().trim().max(300)).max(6).default([]),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  nationality: optText(80),
  marital_status: optText(40),
  visa_status: optText(160),
  /** Small JPEG data URL, resized on device. Only shown where the region pack allows. */
  photo: z.string().max(400_000).startsWith("data:image/").optional(),
});

export const workData = z.object({
  employer: z.string().trim().max(160),
  title: z.string().trim().max(160),
  location: optText(160),
  start: month.optional(),
  end: month.optional(),
  current: z.boolean().default(false),
});

export const achievementData = z.object({
  work_id: z.string().uuid().nullable(),
  kind: z.enum(["responsibility", "achievement"]),
  text: z.string().trim().min(1).max(600),
});

export const educationData = z.object({
  institution: z.string().trim().max(200),
  qualification: z.string().trim().max(200),
  field: optText(160),
  location: optText(160),
  start: month.optional(),
  end: month.optional(),
  grade: optText(80),
});

export const skillData = z.object({ name: z.string().trim().min(1).max(80) });
export const languageData = z.object({ name: z.string().trim().min(1).max(60), level: optText(60) });
export const certData = z.object({
  name: z.string().trim().min(1).max(200),
  issuer: optText(160),
  date: month.optional(),
});

const factBase = {
  id: z.string().uuid(),
  confirmed: z.boolean(),
  source: z.enum(["user", "import"]),
  created_at: z.string(),
  updated_at: z.string(),
};

export const factSchema = z.discriminatedUnion("type", [
  z.object({ ...factBase, type: z.literal("contact"), data: contactData }),
  z.object({ ...factBase, type: z.literal("work"), data: workData }),
  z.object({ ...factBase, type: z.literal("achievement"), data: achievementData }),
  z.object({ ...factBase, type: z.literal("education"), data: educationData }),
  z.object({ ...factBase, type: z.literal("skill"), data: skillData }),
  z.object({ ...factBase, type: z.literal("language"), data: languageData }),
  z.object({ ...factBase, type: z.literal("cert"), data: certData }),
]);

export type Fact = z.infer<typeof factSchema>;
export type FactType = Fact["type"];
export type FactOf<T extends FactType> = Extract<Fact, { type: T }>;
export type FactData<T extends FactType> = FactOf<T>["data"];
export const factTypes = ["contact", "work", "achievement", "education", "skill", "language", "cert"] as const;

/* ---------- CV content: references facts by id, never copies them. ---------- */

export const templateIds = ["classic", "modern", "compact"] as const;
export type TemplateId = (typeof templateIds)[number];

export const cvContentSchema = z.object({
  version: z.literal(1),
  target_country: z.string().length(2).nullable(),
  summary: z.string().max(1200).default(""),
  /** Section order and visibility. Defaults come from the region pack. */
  sections: z.array(z.object({ id: z.enum(sectionIds), visible: z.boolean() })),
  /** null means "use the region pack's recommendation". */
  personal: z.partialRecord(z.enum(personalFields), z.boolean().nullable()).default({}),
  paper: z.enum(["A4", "Letter"]).nullable().default(null),
  spelling: z.enum(spellings).nullable().default(null),
  excluded_fact_ids: z.array(z.string().uuid()).default([]),
  /** Per-fact ordering inside sections; facts not listed fall back to default sort. */
  order: z.array(z.string().uuid()).default([]),
  /** CV-only wording for a fact line. The fact itself stays unchanged. */
  text_overrides: z.record(z.string().uuid(), z.string().max(600)).default({}),
});
export type CvContent = z.infer<typeof cvContentSchema>;

export const cvSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  region_id: z.string().max(40),
  template_id: z.enum(templateIds),
  base_cv_id: z.string().uuid().nullable(),
  content: cvContentSchema,
  status: z.enum(["draft", "final", "archived"]),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Cv = z.infer<typeof cvSchema>;

export const cvVersionSchema = z.object({
  id: z.string().uuid(),
  cv_id: z.string().uuid(),
  title: z.string(),
  content: cvContentSchema,
  created_at: z.string(),
});
export type CvVersion = z.infer<typeof cvVersionSchema>;

/* ---------- Profile and voice ---------- */

export const voiceProfileSchema = z.object({
  avg_sentence_words: z.number(),
  sentence_length_spread: z.enum(["low", "medium", "high"]),
  formality: z.enum(["casual", "neutral", "formal"]),
  uses_contractions: z.boolean(),
  spelling: z.enum(spellings).nullable(),
  punctuation: z.object({
    exclamations: z.boolean(),
    dashes: z.boolean(),
    semicolons: z.boolean(),
  }),
  sample_words: z.number(),
});
export type VoiceProfile = z.infer<typeof voiceProfileSchema>;

export const profileSchema = z.object({
  home_country: z.string().length(2).nullable(),
  target_country: z.string().length(2).nullable(),
  detected_country: z.string().length(2).nullable(),
  spelling: z.enum(spellings).nullable(),
  locale: z.string().max(10),
  voice_profile: voiceProfileSchema.nullable(),
  guest_migrated: z.boolean(),
  onboarded: z.boolean(),
});
export type Profile = z.infer<typeof profileSchema>;

export const emptyProfile: Profile = {
  home_country: null,
  target_country: null,
  detected_country: null,
  spelling: null,
  locale: "en",
  voice_profile: null,
  guest_migrated: false,
  onboarded: false,
};

/* ---------- Consents ---------- */

export const consentSchema = z.object({
  purpose: z.enum(["core", "email_updates", "whatsapp"]),
  text_version: z.string(),
  granted: z.boolean(),
  granted_at: z.string(),
});
export type Consent = z.infer<typeof consentSchema>;

/* ---------- Applications and emails (Phase 3) ---------- */

export const emailVariants = [
  "apply_direct",
  "referral",
  "follow_up",
  "after_interview",
  "thank_you",
  "accept_offer",
  "decline_offer",
] as const;
export type EmailVariant = (typeof emailVariants)[number];
export const tones = ["direct", "warm", "formal"] as const;
export type Tone = (typeof tones)[number];
export const emailLengths = ["short", "standard"] as const;
export type EmailLength = (typeof emailLengths)[number];

/** Everything the user typed into the composer. Only these and their facts may appear in the email. */
export const composeInputsSchema = z.object({
  recipient_name: z.string().trim().max(120).default(""),
  recipient_email: z.union([z.literal(""), z.string().trim().email().max(200)]).default(""),
  /** How they found the role: a site, an event, or a referrer's name. */
  source: z.string().trim().max(160).default(""),
  /** Something specific about the company that the user knows. Never invented. */
  company_detail: z.string().trim().max(400).default(""),
  /** For interview follow-ups and thank-yous: something that came up. */
  interview_detail: z.string().trim().max(400).default(""),
  /** When they applied (follow-ups) or start date (offers), as the user wrote it. */
  date_note: z.string().trim().max(80).default(""),
  /** Optional reason for declining, in the user's words. */
  reason: z.string().trim().max(300).default(""),
  tone: z.enum(tones).nullable().default(null),
  length: z.enum(emailLengths).default("standard"),
});
export type ComposeInputs = z.infer<typeof composeInputsSchema>;

export const applicationStatuses = ["saved", "applied", "interview", "offer", "closed"] as const;

export const applicationSchema = z.object({
  id: z.string().uuid(),
  role: z.string().trim().max(160),
  company: z.string().trim().max(160),
  jd_text: z.string().max(30_000),
  /** The CV used for the email: the tailored one once created, else the base. */
  cv_id: z.string().uuid().nullable(),
  /** The CV the user started from (Phase 2 tailors a copy of it). */
  base_cv_id: z.string().uuid().nullable().default(null),
  email_id: z.string().uuid().nullable(),
  status: z.enum(applicationStatuses),
  jd_analysis: jdAnalysisSchema.nullable().default(null),
  match: matchResultSchema.nullable().default(null),
  /** Per requirement key: the user answered it (a fact was added) or said they haven't done it. */
  gaps: z.record(z.string(), gapDecisionSchema).default({}),
  tailor: z
    .object({
      method: z.enum(["ai", "basic"]),
      changes: z.array(tailorChangeSchema),
      decisions: z.record(z.string(), tailorDecisionSchema),
      tailored_cv_id: z.string().uuid().nullable(),
    })
    .nullable()
    .default(null),
  compose: composeInputsSchema,
  notes: z.string().max(4000).default(""),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Application = z.infer<typeof applicationSchema>;

export const emailParagraphSchema = z.object({
  slot: z.enum(["greeting", "opener", "evidence", "close", "signoff"]),
  text: z.string().max(3000),
  /** Facts this paragraph is built from (the trace back to the user's truth). */
  fact_ids: z.array(z.string()),
});

export const emailRecordSchema = z.object({
  id: z.string().uuid(),
  application_id: z.string().uuid(),
  variant: z.enum(emailVariants),
  subject: z.string().max(300),
  body: z.string().max(8000),
  recipient: z.string().max(200).nullable(),
  meta: z.object({
    subjects: z.array(z.string()).max(5),
    tone: z.enum(tones),
    length: z.enum(emailLengths),
    method: z.enum(["ai", "basic"]),
    used_fact_ids: z.array(z.string()),
    /** The user's own facts and inputs at compose time; edits are re-linted against it. */
    claim_source: z.string().max(60_000).default(""),
    edited: z.boolean(),
    /** Structure for editing paragraph by paragraph; `body` is the flat text. */
    paragraphs: z.array(emailParagraphSchema).max(10).default([]),
  }),
  lint_report: z.unknown().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type EmailRecord = z.infer<typeof emailRecordSchema>;

/* ---------- Helpers ---------- */

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function makeFact<T extends FactType>(
  type: T,
  data: FactData<T>,
  opts: { confirmed?: boolean; source?: "user" | "import"; id?: string } = {},
): FactOf<T> {
  const ts = nowIso();
  return {
    id: opts.id ?? newId(),
    type,
    data,
    confirmed: opts.confirmed ?? true,
    source: opts.source ?? "user",
    created_at: ts,
    updated_at: ts,
  } as FactOf<T>;
}
