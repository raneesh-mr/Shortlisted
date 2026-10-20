import "server-only";
import { z } from "zod";
import { spellings } from "@/config/regions/schema";
import { generateStructured } from "@/lib/llm";
import { loadPrompt } from "@/lib/prompts";
import type { Fact } from "@/lib/model";
import { splitBoilerplate } from "./boilerplate";
import { contentStems, factText, matchBasic } from "./match";
import type { JdAnalysis, MatchItem, Requirement } from "./schema";

const aiAnalysisSchema = z.object({
  title: z.string(),
  company: z.string(),
  seniority: z.string(),
  location: z.string(),
  work_mode: z.string(),
  must_have: z.array(z.string()),
  nice_to_have: z.array(z.string()),
  tools: z.array(z.string()),
  responsibilities: z.array(z.string()),
  spelling_hint: z.string(),
  language_hints: z.array(z.string()),
  keywords: z.array(z.string()),
});

const SENIORITY = ["entry", "mid", "senior", "lead", "executive", "unspecified"] as const;
const MODES = ["onsite", "hybrid", "remote", "unspecified"] as const;

/** Keeps an extracted line only if most of its words come from the job text. */
function grounded(item: string, jdStems: Set<string>): boolean {
  const s = contentStems(item);
  if (s.length === 0) return false;
  return s.filter((w) => jdStems.has(w)).length / s.length >= 0.6;
}

export async function analyzeWithAi(jd: string, hints: { title?: string; company?: string }): Promise<JdAnalysis> {
  const { core, removed } = splitBoilerplate(jd);
  const out = await generateStructured({
    system: loadPrompt("jd-analyze").body,
    user: `<job_description>\n${core.slice(0, 20_000)}\n</job_description>`,
    schema: aiAnalysisSchema,
    task: "extract",
  });
  const jdStems = new Set(contentStems(core));
  const lower = core.toLowerCase();
  const verbatim = (s: string) => s.trim() && lower.includes(s.trim().toLowerCase());
  const lines = (xs: string[], max: number) => [...new Set(xs.map((x) => x.trim()).filter((x) => x && grounded(x, jdStems)))].slice(0, max);

  return {
    title: hints.title || out.title.trim().slice(0, 160),
    company: hints.company || out.company.trim().slice(0, 160),
    seniority: (SENIORITY as readonly string[]).includes(out.seniority) ? (out.seniority as JdAnalysis["seniority"]) : "unspecified",
    location: out.location.trim().slice(0, 160),
    work_mode: (MODES as readonly string[]).includes(out.work_mode) ? (out.work_mode as JdAnalysis["work_mode"]) : "unspecified",
    must_have: lines(out.must_have, 30),
    nice_to_have: lines(out.nice_to_have, 30),
    tools: [...new Set(out.tools.filter(verbatim).map((t) => t.trim()))].slice(0, 40),
    responsibilities: lines(out.responsibilities, 30),
    spelling_hint: (spellings as readonly string[]).includes(out.spelling_hint) ? (out.spelling_hint as JdAnalysis["spelling_hint"]) : null,
    language_hints: out.language_hints.filter(verbatim).slice(0, 10),
    keywords: [...new Set(out.keywords.filter(verbatim).map((k) => k.trim()))].slice(0, 12),
    removed,
    method: "ai",
    edited: false,
  };
}

const aiMatchSchema = z.object({
  results: z.array(z.object({ requirement: z.string(), level: z.string(), refs: z.array(z.string()), note: z.string() })),
});

/**
 * AI judgement of each requirement, validated: refs must be real facts, and a
 * strong/partial match with no valid ref becomes a gap. Requirements the model
 * skipped fall back to the basic matcher.
 */
export async function matchWithAi(reqs: Requirement[], facts: Fact[], notDone: Set<string>): Promise<MatchItem[]> {
  const basic = matchBasic(reqs, facts, { notDone });
  const confirmed = facts.filter((f) => f.confirmed && f.type !== "contact");
  if (!confirmed.length || !reqs.length) return basic;
  const byId = new Map(facts.map((f) => [f.id, f]));
  const factRefs = confirmed.slice(0, 80).map((f, i) => ({ ref: `F${i + 1}`, id: f.id, text: factText(f, byId) }));
  const reqRefs = reqs.map((r, i) => ({ ref: `R${i + 1}`, req: r }));

  const out = await generateStructured({
    system: loadPrompt("match").body,
    user: [
      `<requirements>\n${reqRefs.map((r) => `${r.ref} [${r.req.kind}] ${r.req.text}`).join("\n")}\n</requirements>`,
      `<facts>\n${factRefs.map((f) => `${f.ref} ${f.text}`).join("\n")}\n</facts>`,
    ].join("\n\n"),
    schema: aiMatchSchema,
    task: "extract",
  });

  const idByRef = new Map(factRefs.map((f) => [f.ref, f.id]));
  const byReq = new Map(out.results.map((r) => [r.requirement.trim().toUpperCase(), r]));
  return reqRefs.map(({ ref, req }, i) => {
    const fallback = basic[i]!;
    if (notDone.has(req.key)) return fallback;
    const r = byReq.get(ref);
    if (!r) return fallback;
    const fact_ids = [...new Set(r.refs.map((x) => idByRef.get(x.trim().toUpperCase())).filter((x): x is string => !!x))];
    const claimed = r.level === "strong" || r.level === "partial" ? r.level : "gap";
    const level = claimed !== "gap" && fact_ids.length === 0 ? "gap" : claimed;
    return { key: req.key, text: req.text, kind: req.kind, level, fact_ids: level === "gap" ? [] : fact_ids, note: level === "partial" ? r.note.trim().slice(0, 300) : fallback.note };
  });
}
