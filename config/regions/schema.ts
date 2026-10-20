import { z } from "zod";

export const sectionIds = [
  "header",
  "personal",
  "summary",
  "experience",
  "skills",
  "education",
  "languages",
  "certifications",
] as const;
export type SectionId = (typeof sectionIds)[number];

export const dateFormats = ["MMM YYYY", "MM/YYYY", "MM.YYYY", "YYYY-MM", "YYYY/MM"] as const;
export type DateFormat = (typeof dateFormats)[number];

export const spellings = ["en-US", "en-GB", "en-AU", "en-CA", "en-IN"] as const;
export type Spelling = (typeof spellings)[number];

const presence = z.enum(["omit", "optional", "common"]);

export const regionPackSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
    label: z.string().min(1),
    countries: z.array(z.string().regex(/^[A-Z]{2}$/)),
    document_name: z.enum(["Resume", "CV"]),
    paper: z.enum(["A4", "Letter"]),
    spelling: z.enum(spellings),
    max_pages: z.number().int().min(1).max(5),
    photo: z.enum(["avoid", "optional", "common"]),
    date_of_birth: presence,
    marital_status: presence,
    nationality: presence,
    visa_status: z.enum(["omit", "optional_if_relevant", "common"]),
    address: z.enum(["city_only", "city_country"]),
    sections_order: z.array(z.enum(sectionIds)).min(3),
    date_format: z.enum(dateFormats),
    references: z.enum(["omit_on_request_only", "on_request_line"]),
    email_tone: z.enum(["direct", "warm", "formal"]),
    support: z.enum(["full", "partial"]),
    support_note: z.string().optional(),
    notes: z.array(z.string()),
    last_reviewed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict()
  .refine((p) => p.sections_order[0] === "header", {
    message: "sections_order must start with header",
  })
  .refine((p) => new Set(p.sections_order).size === p.sections_order.length, {
    message: "sections_order must not repeat a section",
  });

export type RegionPack = z.infer<typeof regionPackSchema>;

/** Personal fields a user can toggle per CV. */
export const personalFields = [
  "photo",
  "date_of_birth",
  "marital_status",
  "nationality",
  "visa_status",
] as const;
export type PersonalField = (typeof personalFields)[number];
