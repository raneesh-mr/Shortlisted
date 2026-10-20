import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildCvDocument, renderedToText } from "@/lib/cv/document";
import { analyzeBasic, requirementsOf } from "@/lib/jd/basic";
import { keywordCoverage } from "@/lib/jd/coverage";
import { matchBasic } from "@/lib/jd/match";
import type { TailorDecision } from "@/lib/jd/schema";
import { applyTailor } from "@/lib/tailor/apply";
import { tailorBasic } from "@/lib/tailor/basic";
import { checkRewrite } from "@/lib/tailor/check";
import { makeFact, type Fact, type FactOf } from "@/lib/model";
import { JD, cvFor, sampleFacts } from "./fixtures";

function setup() {
  const facts = sampleFacts();
  const work = facts.find((f): f is FactOf<"work"> => f.type === "work" && f.data.current)!;
  // A less relevant bullet first, so relevance ordering has something to move.
  const filler = makeFact("achievement", { work_id: work.id, kind: "responsibility", text: "Wrote the monthly newsletter" });
  const all: Fact[] = [...facts.slice(0, 3), filler, ...facts.slice(3)];
  // Make the newsletter bullet the oldest so it sorts first by default.
  filler.created_at = "2000-01-01T00:00:00.000Z";
  const cv = cvFor("AE");
  const analysis = analyzeBasic(JD);
  const items = matchBasic(requirementsOf(analysis), all);
  return { facts: all, cv, analysis, items, work, filler };
}

describe("rewrite truth checks", () => {
  const base = { before: "Cut reactive maintenance calls by 18% in 12 months", context: "Facilities Manager, Harbour Estates", jdText: JD };

  it("drops a rewrite that adds or changes a number", () => {
    expect(checkRewrite({ ...base, after: "Cut reactive maintenance calls by 25% in 12 months" }).drop).toBe(true);
    expect(checkRewrite({ ...base, after: "Cut reactive maintenance calls by 18% in 12 months across 3 sites" }).drop).toBe(true);
    expect(checkRewrite({ ...base, after: "Reduced reactive maintenance calls by 18% in 12 months" }).drop).toBe(false);
  });

  it("flags job terms the fact didn't use, and new names", () => {
    const r = checkRewrite({ ...base, after: "Cut reactive maintenance calls by 18% in 12 months using CAFM at Marina" });
    expect(r.flags.map((f) => f.rule)).toEqual(expect.arrayContaining(["new_job_term", "new_name"]));
    expect(r.flags.find((f) => f.rule === "new_job_term")!.text).toContain("cafm");
  });

  it("flags humanizer errors", () => {
    const r = checkRewrite({ ...base, after: "Spearheaded a cut in reactive maintenance calls by 18% in 12 months" });
    expect(r.flags.some((f) => f.rule === "lint")).toBe(true);
  });
});

describe("basic tailoring", () => {
  it("proposes putting the most relevant bullets first, without changing wording", () => {
    const { facts, cv, analysis, items, filler } = setup();
    const changes = tailorBasic(cv, facts, analysis, items);
    const order = changes.find((c) => c.kind === "order" && c.group.startsWith("Facilities Manager"));
    expect(order).toBeDefined();
    if (order?.kind !== "order") throw new Error();
    expect(order.before[0]).toBe(filler.id);
    expect(order.after.at(-1)).toBe(filler.id);
    expect(changes.some((c) => c.kind === "wording" || c.kind === "summary")).toBe(false);
  });

  it("offers to show a hidden fact that matches the job", () => {
    const { facts, cv, analysis, items } = setup();
    const bullet = facts.find((f) => f.type === "achievement" && f.data.text.includes("14 technicians"))!;
    cv.content.excluded_fact_ids = [bullet.id];
    const include = tailorBasic(cv, facts, analysis, items).find((c) => c.kind === "include");
    expect(include).toMatchObject({ fact_id: bullet.id });
  });
});

describe("applying accepted changes", () => {
  it("creates a new CV from accepted changes only and leaves the base untouched", () => {
    const { facts, cv, analysis, items } = setup();
    const bullet = facts.find((f) => f.type === "achievement" && f.data.text.includes("18%"))!;
    const changes = [
      ...tailorBasic(cv, facts, analysis, items),
      { id: "summary", kind: "summary" as const, before: "", after: "Facilities manager running residential towers.", fact_ids: [], flags: [] },
      { id: `wording:${bullet.id}`, kind: "wording" as const, fact_id: bullet.id, before: "x", after: "Reduced reactive maintenance calls by 18% in 12 months", flags: [] },
    ];
    const orderId = changes.find((c) => c.kind === "order")!.id;
    const decisions: Record<string, TailorDecision> = {
      [orderId]: { status: "accepted" },
      summary: { status: "accepted", edited: "Facilities manager for residential towers." },
      [`wording:${bullet.id}`]: { status: "rejected" },
    };
    const baseBefore = structuredClone(cv);
    const tailored = applyTailor(cv, changes, decisions, "Facilities Manager – Marina Living");
    expect(cv).toEqual(baseBefore);
    expect(tailored.id).not.toBe(cv.id);
    expect(tailored.base_cv_id).toBe(cv.id);
    expect(tailored.content.summary).toBe("Facilities manager for residential towers.");
    expect(tailored.content.text_overrides[bullet.id]).toBeUndefined();

    const text = renderedToText(buildCvDocument(tailored, facts));
    expect(text.indexOf("Wrote the monthly newsletter")).toBeGreaterThan(text.indexOf("Run a team of 14 technicians"));
  });
});

describe("keyword coverage", () => {
  it("counts only keywords found in fact lines, never the summary", () => {
    const { facts, cv } = setup();
    cv.content.summary = "Budgeting and NEBOSH and Yardi expert.";
    const cov = keywordCoverage(buildCvDocument(cv, facts), ["technicians", "Budgeting", "Yardi", "residential towers"]);
    const by = (k: string) => cov.find((c) => c.keyword === k)!;
    expect(by("technicians").covered).toBe(true);
    expect(by("Budgeting").covered).toBe(true); // it's a skill fact
    expect(by("Yardi").covered).toBe(false); // only in the summary
    expect(by("residential towers").covered).toBe(false); // words never appear together in a fact line
  });
});

describe("AI match and tailor (model mocked)", () => {
  const generate = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    generate.mockReset();
    vi.doMock("@/lib/llm", () => ({ generateStructured: generate, llmConfigured: () => true, LlmError: class extends Error {} }));
  });

  it("downgrades uncited matches to gaps and falls back when a requirement is skipped", async () => {
    const { matchWithAi } = await import("@/lib/jd/ai");
    const { facts, analysis } = setup();
    const reqs = requirementsOf(analysis).slice(0, 3);
    generate.mockResolvedValueOnce({
      results: [
        { requirement: "R1", level: "strong", refs: ["F2"], note: "" },
        { requirement: "R2", level: "strong", refs: [], note: "" },
      ],
    });
    const items = await matchWithAi(reqs, facts, new Set());
    expect(items[0]!.level).toBe("strong");
    expect(items[0]!.fact_ids).toHaveLength(1);
    expect(items[1]!.level).toBe("gap");
    expect(items[2]!.key).toBe(reqs[2]!.key); // skipped by the model: basic result used
  });

  it("drops AI rewrites with new numbers and flags new job terms", async () => {
    const { tailorWithAi } = await import("@/lib/tailor/ai");
    const { facts, cv, analysis, items } = setup();
    generate.mockResolvedValueOnce({
      summary: { text: "Facilities manager leading 14 technicians across 3 towers.", refs: ["S1", "S2"] },
      rewrites: [
        { ref: "F1", text: "Cut reactive maintenance calls by 40% in 12 months" },
        { ref: "F2", text: "Lead 14 technicians across 3 residential towers" },
      ],
    });
    const changes = await tailorWithAi(cv, facts, analysis, items, JD);
    const wording = changes.filter((c) => c.kind === "wording");
    expect(wording.every((c) => c.kind === "wording" && !c.after.includes("40%"))).toBe(true);
    const lead = wording.find((c) => c.kind === "wording" && c.after.startsWith("Lead 14"));
    if (lead) expect(lead.flags.some((f) => f.rule === "new_job_term")).toBe(true);
  });
});
