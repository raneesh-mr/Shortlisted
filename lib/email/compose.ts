import { z } from "zod";
import { spellings, type Spelling } from "@/config/regions/schema";
import { lintText, type LintReport } from "@/lib/humanizer/lint";
import {
  composeInputsSchema,
  cvSchema,
  emailParagraphSchema,
  emailVariants,
  factSchema,
  tones,
  voiceProfileSchema,
  type ComposeInputs,
  type EmailLength,
  type FactOf,
  type Tone,
  type VoiceProfile,
} from "@/lib/model";
import { getRegionPack } from "@/lib/regions";
import { bodyText, claimSource, greeting, signOff, type EmailDraft, type Paragraph } from "./assemble";
import { emailCandidates, type Candidate } from "./facts";
import { variants, type VariantSpec } from "./variants";

export const paragraphSchema = emailParagraphSchema;

export const composeRequestSchema = z.object({
  mode: z.enum(["ai", "basic"]),
  variant: z.enum(emailVariants),
  role: z.string().trim().max(160).default(""),
  company: z.string().trim().max(160).default(""),
  jd_text: z.string().max(30_000).default(""),
  inputs: composeInputsSchema,
  cv: cvSchema.pick({ region_id: true, template_id: true, content: true }),
  facts: z.array(factSchema).max(600),
  voice: voiceProfileSchema.nullable().default(null),
  spelling: z.enum(spellings).nullable().default(null),
  /** "Another take" on one paragraph of an existing draft. */
  rewrite: z
    .object({
      slot: z.enum(["opener", "evidence", "close"]),
      paragraphs: z.array(paragraphSchema).max(10),
      subjects: z.array(z.string().max(300)).max(5),
    })
    .optional(),
});
export type ComposeRequest = z.infer<typeof composeRequestSchema>;

export interface ComposeResult {
  method: "ai" | "basic";
  tone: Tone;
  length: EmailLength;
  subjects: string[];
  paragraphs: Paragraph[];
  lint: LintReport;
  /** Everything the user supplied; the client re-lints edits against it. */
  claim_source: string;
  regenerated: boolean;
}

export interface ComposeContext {
  spec: VariantSpec;
  tone: Tone;
  length: EmailLength;
  role: string;
  company: string;
  jd: string;
  inputs: ComposeInputs;
  candidates: Candidate[];
  /** Pre-selected facts for the evidence paragraph (basic mode uses these directly). */
  picks: Candidate[];
  name: string;
  contact: string[];
  contractions: boolean;
  spelling: Spelling;
  voice: VoiceProfile | null;
  source: string;
}

export class ComposeInputError extends Error {
  constructor(public readonly missing: string[]) {
    super("missing_inputs");
  }
}

export function buildContext(req: ComposeRequest): ComposeContext {
  const spec = variants[req.variant];
  const missing = spec.requires.filter((k) => !String(req.inputs[k] ?? "").trim());
  if (missing.length) throw new ComposeInputError(missing);

  const pack = getRegionPack(req.cv.region_id);
  const tone = req.inputs.tone ?? pack.email_tone;
  const length = req.inputs.length;
  const candidates = emailCandidates(req.cv, req.facts, spec.usesJd ? req.jd_text : "");
  const [, max] = spec.facts[length];
  // Prefer bullets for evidence; fall back to roles and qualifications.
  const evidence = [...candidates.filter((c) => c.type === "achievement"), ...candidates.filter((c) => c.type !== "achievement" && c.type !== "skill" && c.type !== "language")];
  const picks = evidence.slice(0, max);

  const contactFact = req.facts.find((f): f is FactOf<"contact"> => f.type === "contact" && f.confirmed);
  const name = contactFact?.data.full_name ?? "";
  const contact = length === "standard" ? [contactFact?.data.phone, contactFact?.data.email].filter((x): x is string => !!x) : [];
  const contractions = tone !== "formal" && (req.voice ? req.voice.uses_contractions : true);
  const spelling = req.spelling ?? pack.spelling;
  const source = claimSource({ candidates, inputs: req.inputs, role: req.role, company: req.company, name, contact });
  return { spec, tone, length, role: req.role, company: req.company, jd: req.jd_text, inputs: req.inputs, candidates, picks, name, contact, contractions, spelling, voice: req.voice, source };
}

export function frame(ctx: ComposeContext, middle: Paragraph[], subjects: string[]): EmailDraft {
  return {
    subjects,
    paragraphs: [
      { slot: "greeting", text: greeting(ctx.tone, ctx.inputs, ctx.company), fact_ids: [] },
      ...middle.filter((p) => p.text.trim()),
      { slot: "signoff", text: signOff(ctx.tone, ctx.name, ctx.contact), fact_ids: [] },
    ],
  };
}

export function lintDraft(draft: EmailDraft, ctx: Pick<ComposeContext, "source" | "voice">): LintReport {
  return lintText(`${draft.subjects[0] ?? ""}\n\n${bodyText(draft.paragraphs)}`, {
    source: ctx.source,
    allowExclamation: ctx.voice?.punctuation.exclamations ?? false,
  });
}

/** Fewer errors wins, then the higher score. */
export function better(a: LintReport, b: LintReport): boolean {
  const ea = a.findings.filter((f) => f.severity === "error").length;
  const eb = b.findings.filter((f) => f.severity === "error").length;
  return ea !== eb ? ea < eb : a.score >= b.score;
}

export const toneOptions = tones;
