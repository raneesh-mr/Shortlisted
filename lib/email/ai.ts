import "server-only";
import { z } from "zod";
import { bannedPhrases } from "@/lib/humanizer/banned";
import type { LintReport } from "@/lib/humanizer/lint";
import { generateStructured } from "@/lib/llm";
import { loadPrompt } from "@/lib/prompts";
import type { EmailDraft, Paragraph } from "./assemble";
import { better, frame, lintDraft, type ComposeContext } from "./compose";

// Plain schema (no length constraints) for structured output; bounds are enforced in code.
const draftSchema = z.object({
  subjects: z.array(z.string()),
  opener: z.string(),
  evidence: z.array(z.object({ text: z.string(), refs: z.array(z.string()) })),
  close: z.string(),
});
const paragraphOut = z.object({ text: z.string(), refs: z.array(z.string()) });

const GREETING = /^(dear|hi|hello|hey)\b[^\n,]*,\s*/i;
const SIGNOFF = /\s*(kind regards|best wishes|best|thanks|thank you|regards|sincerely|cheers),?\s*$/i;

function system(): string {
  const prompt = loadPrompt("email-compose");
  const banned = bannedPhrases.map((b) => `- ${b.phrase}`).join("\n");
  return `${prompt.body}\n\nBanned phrases:\n${banned}`;
}

function brief(ctx: ComposeContext): string {
  const [minF, maxF] = ctx.spec.facts[ctx.length];
  const [minW, maxW] = ctx.spec.words[ctx.length];
  const v = ctx.voice;
  const settings = [
    `email type: ${ctx.spec.id}`,
    `opener: ${ctx.spec.guide.opener}`,
    `evidence: ${ctx.spec.guide.evidence} Use between ${minF} and ${maxF} items.`,
    `close: ${ctx.spec.guide.close}`,
    `tone: ${ctx.tone}`,
    `length: ${minW}–${maxW} words for the whole email, including a greeting and sign-off that code adds`,
    `spelling: ${ctx.spelling}`,
    `contractions: ${ctx.contractions ? "yes" : "no"}`,
    `exclamation marks: ${v?.punctuation.exclamations ? "at most one" : "none"}`,
    v ? `style: about ${v.avg_sentence_words} words per sentence, ${v.sentence_length_spread} variation, ${v.formality} register` : "",
  ].filter(Boolean);
  const i = ctx.inputs;
  const inputs = [
    ["role", ctx.role],
    ["company", ctx.company],
    ["recipient name", i.recipient_name],
    ["how they found the role or who referred them", i.source],
    ["company detail they know", i.company_detail],
    ["from the interview", i.interview_detail],
    ["date", i.date_note],
    ["reason (declining)", i.reason],
  ]
    .filter(([, val]) => val && String(val).trim())
    .map(([k, val]) => `${k}: ${val}`);
  const facts = ctx.candidates
    .slice(0, 15)
    .map((c) => `${c.ref} [${c.type}] ${c.text}${c.context ? ` (${c.context})` : ""}`);
  return [
    `<settings>\n${settings.join("\n")}\n</settings>`,
    `<user_inputs>\n${inputs.join("\n") || "(none)"}\n</user_inputs>`,
    `<facts>\n${facts.join("\n") || "(none)"}\n</facts>`,
    ctx.spec.usesJd && ctx.jd.trim() ? `<job_description>\n${ctx.jd.slice(0, 12_000)}\n</job_description>` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function feedback(report: LintReport): string {
  const lines = report.findings.slice(0, 12).map((f) => `- ${f.rule}: "${f.text}"${f.hint ? ` (${f.hint})` : ""}`);
  return `<lint_feedback>\nYour previous draft had these problems. Fix all of them:\n${lines.join("\n")}\n</lint_feedback>`;
}

function mapRefs(ctx: ComposeContext, refs: string[]): string[] {
  const byRef = new Map(ctx.candidates.map((c) => [c.ref, c.fact_id]));
  return [...new Set(refs.map((r) => byRef.get(r.trim().toUpperCase())).filter((x): x is string => !!x))];
}

/** Turns model output into paragraphs, dropping any evidence that doesn't cite a real fact. */
function toDraft(ctx: ComposeContext, out: z.infer<typeof draftSchema>): EmailDraft {
  const [, maxF] = ctx.spec.facts[ctx.length];
  const evidence = out.evidence
    .map((e) => ({ text: e.text.trim(), fact_ids: mapRefs(ctx, e.refs) }))
    .filter((e) => e.text && e.fact_ids.length)
    .slice(0, maxF);
  const middle: Paragraph[] = [
    { slot: "opener", text: out.opener.replace(GREETING, "").trim(), fact_ids: [] },
    { slot: "evidence", text: evidence.map((e) => e.text).join(" "), fact_ids: [...new Set(evidence.flatMap((e) => e.fact_ids))] },
    { slot: "close", text: out.close.replace(SIGNOFF, "").trim(), fact_ids: [] },
  ];
  const subjects = out.subjects.map((s) => s.trim()).filter(Boolean).slice(0, 3);
  return frame(ctx, middle, subjects.length ? subjects : [ctx.role || "Application"]);
}

export async function composeWithAi(ctx: ComposeContext): Promise<{ draft: EmailDraft; lint: LintReport; regenerated: boolean }> {
  const sys = system();
  const first = toDraft(ctx, await generateStructured({ system: sys, user: brief(ctx), schema: draftSchema, task: "wording" }));
  const firstLint = lintDraft(first, ctx);
  if (firstLint.passed) return { draft: first, lint: firstLint, regenerated: false };

  // One regeneration with the lint findings as constraints; keep whichever is better.
  const second = toDraft(ctx, await generateStructured({ system: sys, user: `${brief(ctx)}\n\n${feedback(firstLint)}`, schema: draftSchema, task: "wording" }));
  const secondLint = lintDraft(second, ctx);
  return better(secondLint, firstLint) ? { draft: second, lint: secondLint, regenerated: true } : { draft: first, lint: firstLint, regenerated: true };
}

/** "Another take": rewrites one paragraph with different phrasing. */
export async function rewriteWithAi(ctx: ComposeContext, slot: "opener" | "evidence" | "close", current: Paragraph[]): Promise<Paragraph> {
  const draftText = current.map((p) => `[${p.slot}] ${p.text}`).join("\n");
  const target = current.find((p) => p.slot === slot);
  const user = `${brief(ctx)}\n\n<current_draft>\n${draftText}\n</current_draft>\n\nRewrite only the ${slot} paragraph with different phrasing. Keep the same meaning and the same rules.${
    slot === "evidence" ? " Cite refs for every fact you use; you may pick a different fact if it fits the job better." : " Use an empty refs list."
  } Return it as { "text", "refs" }.${target ? `\nThe current ${slot} is: "${target.text}"` : ""}`;
  const out = await generateStructured({ system: system(), user, schema: paragraphOut, task: "wording" });
  const fact_ids = slot === "evidence" ? mapRefs(ctx, out.refs) : [];
  const text = out.text.replace(GREETING, "").replace(SIGNOFF, "").trim();
  if (slot === "evidence" && !fact_ids.length) return target ?? { slot, text: "", fact_ids: [] };
  return { slot, text, fact_ids };
}
