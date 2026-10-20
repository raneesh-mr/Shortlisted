import "server-only";
import { z } from "zod";
import { buildCvDocument } from "@/lib/cv/document";
import { bannedPhrases } from "@/lib/humanizer/banned";
import { requirementsOf } from "@/lib/jd/basic";
import { factText } from "@/lib/jd/match";
import type { JdAnalysis, MatchItem, TailorChange } from "@/lib/jd/schema";
import { generateStructured } from "@/lib/llm";
import type { Cv, Fact } from "@/lib/model";
import { loadPrompt } from "@/lib/prompts";
import { relevance, tailorBasic } from "./basic";
import { checkRewrite } from "./check";

const outSchema = z.object({
  summary: z.object({ text: z.string(), refs: z.array(z.string()) }),
  rewrites: z.array(z.object({ ref: z.string(), text: z.string() })),
});

const MAX_REWRITES = 8;

/** Basic proposals plus AI wording and summary, each checked before the user ever sees it. */
export async function tailorWithAi(
  cv: Pick<Cv, "region_id" | "template_id" | "content">,
  facts: Fact[],
  analysis: JdAnalysis,
  items: MatchItem[],
  jdText: string,
): Promise<TailorChange[]> {
  const changes = tailorBasic(cv, facts, analysis, items);
  const rel = relevance(facts, items, analysis);
  const byId = new Map(facts.map((f) => [f.id, f]));
  const doc = buildCvDocument(cv, facts);

  // Bullets as they read on this CV, most relevant first.
  const bullets = doc.sections
    .filter((s) => s.id === "experience")
    .flatMap((s) => s.blocks)
    .flatMap((b) => (b.kind === "entry" ? b.bullets.map((bl) => ({ id: bl.source_fact_id!, text: bl.text, role: [b.title.text, b.subtitle].filter(Boolean).join(", ") })) : []))
    .filter((b) => b.id)
    .sort((a, b) => (rel.get(b.id) ?? 0) - (rel.get(a.id) ?? 0))
    .slice(0, 12)
    .map((b, i) => ({ ...b, ref: `F${i + 1}` }));
  const summaryFacts = facts
    .filter((f) => f.confirmed && f.type !== "contact" && f.type !== "language")
    .sort((a, b) => (rel.get(b.id) ?? 0) - (rel.get(a.id) ?? 0))
    .slice(0, 15)
    .map((f, i) => ({ id: f.id, ref: `S${i + 1}`, text: factText(f, byId) }));

  const reqs = requirementsOf(analysis).filter((r) => r.kind !== "responsibility").slice(0, 15);
  const user = [
    `<job>\ntitle: ${analysis.title}\nkeywords: ${analysis.keywords.join(", ")}\nrequirements:\n${reqs.map((r) => `- ${r.text}`).join("\n")}\n</job>`,
    `<bullets>\n${bullets.map((b) => `${b.ref} ${b.text} (role: ${b.role})`).join("\n")}\n</bullets>`,
    `<facts_for_summary>\n${summaryFacts.map((f) => `${f.ref} ${f.text}`).join("\n")}\n</facts_for_summary>`,
    `<current_summary>\n${cv.content.summary || "(none)"}\n</current_summary>`,
    `Return up to ${MAX_REWRITES} rewrites.`,
  ].join("\n\n");
  const system = `${loadPrompt("tailor").body}\n\nBanned phrases:\n${bannedPhrases.map((b) => `- ${b.phrase}`).join("\n")}`;
  const out = await generateStructured({ system, user, schema: outSchema, task: "wording" });

  const bulletByRef = new Map(bullets.map((b) => [b.ref, b]));
  for (const r of out.rewrites.slice(0, MAX_REWRITES)) {
    const b = bulletByRef.get(r.ref.trim().toUpperCase());
    const after = r.text.trim();
    if (!b || !after || after === b.text) continue;
    const check = checkRewrite({ before: b.text, after, context: b.role, jdText });
    if (check.drop) continue;
    changes.push({ id: `wording:${b.id}`, kind: "wording", fact_id: b.id, before: b.text, after, flags: check.flags });
  }

  const summaryText = out.summary.text.trim();
  const factIdsByRef = new Map(summaryFacts.map((f) => [f.ref, f]));
  const cited = out.summary.refs.map((r) => factIdsByRef.get(r.trim().toUpperCase())).filter((f): f is (typeof summaryFacts)[number] => !!f);
  if (summaryText && cited.length && summaryText !== cv.content.summary.trim()) {
    const check = checkRewrite({ before: cv.content.summary, after: summaryText, context: cited.map((f) => f.text).join("\n"), jdText });
    if (!check.drop) {
      changes.unshift({ id: "summary", kind: "summary", before: cv.content.summary, after: summaryText, fact_ids: cited.map((f) => f.id), flags: check.flags });
    }
  }
  return changes;
}
