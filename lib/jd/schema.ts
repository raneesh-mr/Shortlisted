import { z } from "zod";
import { spellings } from "@/config/regions/schema";

/** Structured view of a job description. Every field is editable by the user. */
export const jdAnalysisSchema = z.object({
  title: z.string().trim().max(160).default(""),
  company: z.string().trim().max(160).default(""),
  seniority: z.enum(["entry", "mid", "senior", "lead", "executive", "unspecified"]).default("unspecified"),
  location: z.string().trim().max(160).default(""),
  work_mode: z.enum(["onsite", "hybrid", "remote", "unspecified"]).default("unspecified"),
  must_have: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
  nice_to_have: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
  tools: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
  responsibilities: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
  spelling_hint: z.enum(spellings).nullable().default(null),
  language_hints: z.array(z.string().trim().max(80)).max(10).default([]),
  keywords: z.array(z.string().trim().min(1).max(60)).max(14).default([]),
  /** Boilerplate we set aside (equal-opportunity text, benefits). Kept, never deleted. */
  removed: z.array(z.string().max(4000)).max(20).default([]),
  method: z.enum(["ai", "basic"]),
  edited: z.boolean().default(false),
});
export type JdAnalysis = z.infer<typeof jdAnalysisSchema>;

export const requirementKinds = ["must", "nice", "tool", "responsibility"] as const;
export type RequirementKind = (typeof requirementKinds)[number];

export interface Requirement {
  key: string;
  text: string;
  kind: RequirementKind;
}

export const matchLevels = ["strong", "partial", "gap"] as const;
export type MatchLevel = (typeof matchLevels)[number];

export const matchItemSchema = z.object({
  key: z.string(),
  text: z.string(),
  kind: z.enum(requirementKinds),
  level: z.enum(matchLevels),
  /** The facts this match relies on. Strong/partial always cite at least one. */
  fact_ids: z.array(z.string()),
  note: z.string().max(300).default(""),
});
export type MatchItem = z.infer<typeof matchItemSchema>;

export const matchResultSchema = z.object({
  method: z.enum(["ai", "basic"]),
  items: z.array(matchItemSchema),
  /** Fingerprint of facts + requirements at match time, to know when it's stale. */
  basis: z.string(),
});
export type MatchResult = z.infer<typeof matchResultSchema>;

/** What the user decided for each gap. Answers become facts; "not_done" is respected and never asked again. */
export const gapDecisionSchema = z.enum(["answered", "not_done"]);

/* ---------- Tailoring: proposed changes, nothing applied until accepted ---------- */

export const changeFlagSchema = z.object({
  rule: z.enum(["new_number", "new_name", "new_job_term", "lint"]),
  text: z.string(),
  message: z.string(),
});
export type ChangeFlag = z.infer<typeof changeFlagSchema>;

export const tailorChangeSchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.string(),
    kind: z.literal("summary"),
    before: z.string(),
    after: z.string(),
    fact_ids: z.array(z.string()),
    flags: z.array(changeFlagSchema),
  }),
  z.object({
    id: z.string(),
    kind: z.literal("wording"),
    fact_id: z.string(),
    before: z.string(),
    after: z.string(),
    flags: z.array(changeFlagSchema),
  }),
  z.object({
    id: z.string(),
    kind: z.literal("order"),
    /** e.g. "Facilities Manager, Harbour Estates" or "Skills". */
    group: z.string(),
    before: z.array(z.string()),
    after: z.array(z.string()),
    /** Display text for each fact id. */
    labels: z.record(z.string(), z.string()),
    flags: z.array(changeFlagSchema),
  }),
  z.object({
    id: z.string(),
    kind: z.literal("include"),
    fact_id: z.string(),
    text: z.string(),
    reason: z.string(),
    flags: z.array(changeFlagSchema),
  }),
]);
export type TailorChange = z.infer<typeof tailorChangeSchema>;

export const tailorDecisionSchema = z.object({
  status: z.enum(["pending", "accepted", "rejected"]),
  /** The user's own edit of the "after" text (summary and wording changes). */
  edited: z.string().max(1200).optional(),
});
export type TailorDecision = z.infer<typeof tailorDecisionSchema>;
