import { describe, expect, it } from "vitest";
import { analyzeBasic, requirementsOf } from "@/lib/jd/basic";
import { splitBoilerplate } from "@/lib/jd/boilerplate";
import { matchBasic } from "@/lib/jd/match";
import { jdAnalysisSchema } from "@/lib/jd/schema";
import { makeFact } from "@/lib/model";
import { JD, sampleFacts } from "./fixtures";

describe("boilerplate", () => {
  it("sets aside benefits and equal-opportunity text without deleting it", () => {
    const { core, removed } = splitBoilerplate(JD);
    expect(core).not.toContain("Annual flights");
    expect(core).not.toContain("equal opportunity");
    expect(removed.join("\n")).toContain("Annual flights home");
    expect(removed.join("\n")).toContain("equal opportunity employer");
    expect(core).toContain("CAFM");
  });
});

describe("basic JD analysis", () => {
  const a = analyzeBasic(JD);

  it("is a valid analysis", () => {
    expect(jdAnalysisSchema.safeParse(a).success).toBe(true);
  });

  it("reads title, company, seniority, location and work mode", () => {
    console.log("PROBE", JSON.stringify({ title: a.title, company: a.company, seniority: a.seniority, work_mode: a.work_mode, location: a.location }));
    expect(a).toMatchObject({ title: "Senior Facilities Manager", company: "Marina Living", seniority: "senior", work_mode: "hybrid" });
    expect(a.location).toContain("Dubai");
  });

  it("splits must-haves, nice-to-haves and responsibilities by section, verbatim", () => {
    expect(a.must_have).toContain("Hands-on experience with CAFM systems");
    expect(a.nice_to_have).toContain("IOSH or NEBOSH certification");
    expect(a.responsibilities).toContain("Lead a team of technicians across residential towers");
  });

  it("finds tools and language hints", () => {
    expect(a.tools).toEqual(expect.arrayContaining(["CAFM", "Yardi", "IOSH", "NEBOSH"]));
    expect(a.language_hints).toEqual(expect.arrayContaining(["English", "Arabic"]));
  });

  it("returns 8–12 keywords, every one present in the job text", () => {
    expect(a.keywords.length).toBeGreaterThanOrEqual(8);
    expect(a.keywords.length).toBeLessThanOrEqual(12);
    for (const k of a.keywords) expect(JD.toLowerCase()).toContain(k.toLowerCase());
    for (const k of a.keywords) expect(k).not.toMatch(/(through|across|into|from|with|and)/i);
  });

  it("builds requirements with stable keys and no duplicate tools", () => {
    const reqs = requirementsOf(a);
    expect(reqs.find((r) => r.kind === "tool" && r.text === "CAFM")).toBeUndefined(); // already inside a must-have line
    expect(reqs.find((r) => r.kind === "tool" && r.text === "Yardi")).toBeUndefined(); // already inside a nice-to-have line
    expect(new Set(reqs.map((r) => r.key)).size).toBe(reqs.length);
  });
});

describe("matching requirements to facts", () => {
  const facts = sampleFacts();
  const reqs = requirementsOf(analyzeBasic(JD));
  const items = matchBasic(reqs, facts);
  const byText = (t: string) => items.find((i) => i.text === t)!;

  it("finds strong matches and cites the facts", () => {
    const m = byText("Lead a team of technicians across residential towers");
    expect(m.level).toBe("strong");
    const cited = facts.filter((f) => m.fact_ids.includes(f.id));
    expect(cited.some((f) => f.type === "achievement" && f.data.text.includes("14 technicians"))).toBe(true);
  });

  it("marks partial matches and gaps", () => {
    expect(byText("Hands-on experience with CAFM systems").level).not.toBe("gap");
    expect(byText("IOSH or NEBOSH certification").level).toBe("gap");
    expect(byText("IOSH or NEBOSH certification").fact_ids).toEqual([]);
  });

  it("adds a years note and never cites unconfirmed facts", () => {
    const m = byText("5+ years of facilities management experience");
    expect(m.note).toContain("5+ years");
    const unconfirmed = facts.find((f) => !f.confirmed)!;
    expect(items.flatMap((i) => i.fact_ids)).not.toContain(unconfirmed.id);
  });

  it("respects 'I haven't done this'", () => {
    const key = reqs.find((r) => r.text.includes("budgeting"))!.key;
    const again = matchBasic(reqs, facts, { notDone: new Set([key]) });
    expect(again.find((i) => i.key === key)!.level).toBe("gap");
  });

  it("an answered gap becomes a match once the fact exists", () => {
    const work = facts.find((f) => f.type === "work")!;
    const withAnswer = [...facts, makeFact("achievement", { work_id: work.id, kind: "responsibility", text: "Hold the IOSH Managing Safely certification" })];
    expect(matchBasic(reqs, withAnswer).find((i) => i.text === "IOSH or NEBOSH certification")!.level).not.toBe("gap");
  });
});
