import { describe, expect, it } from "vitest";
import { checkCoverage } from "@/lib/import/coverage";
import { parseHeuristic } from "@/lib/import/heuristic";
import { parseDateToken, tokens } from "@/lib/import/text";
import { makeFact, type FactOf } from "@/lib/model";

const CV = `Priya Nair
Operations Lead
priya.nair@example.com | +44 7700 900123 | linkedin.com/in/priyanair

Profile
Operations lead with eight years in logistics. I like fixing messy processes.

Experience
Operations Lead, Swift Freight, London    Mar 2020 – Present
• Reduced late deliveries from 9% to 4% over 18 months
• Manage a team of 12 coordinators
Coordinator | Northway Logistics | Jan 2016 - Feb 2020
- Scheduled 200+ weekly collections

Education
BSc Business Management
University of Leeds, Sep 2012 – Jun 2015

Skills
Excel, SQL, Route planning, Stakeholder management

Languages
English (Native), Malayalam (Fluent)

Interests
Long-distance running and community cooking classes`;

describe("date tokens", () => {
  it("parses common CV date formats", () => {
    expect(parseDateToken("Mar 2020")).toEqual({ month: "2020-03" });
    expect(parseDateToken("September 2012")).toEqual({ month: "2012-09" });
    expect(parseDateToken("03/2020")).toEqual({ month: "2020-03" });
    expect(parseDateToken("2015")).toEqual({ year: "2015" });
  });
});

describe("heuristic parser", () => {
  const draft = parseHeuristic(CV);
  const of = <T extends string>(t: T) => draft.facts.filter((f) => f.type === t);

  it("extracts contact details", () => {
    const c = of("contact")[0] as FactOf<"contact">;
    expect(c.data.full_name).toBe("Priya Nair");
    expect(c.data.email).toBe("priya.nair@example.com");
    expect(c.data.links[0]).toContain("linkedin.com/in/priyanair");
  });

  it("extracts roles with dates and their bullets, copied verbatim", () => {
    const works = of("work") as FactOf<"work">[];
    expect(works).toHaveLength(2);
    expect(works[0]!.data).toMatchObject({ title: "Operations Lead", employer: "Swift Freight", start: "2020-03", current: true });
    expect(works[1]!.data).toMatchObject({ title: "Coordinator", employer: "Northway Logistics", start: "2016-01", end: "2020-02" });
    const bullets = (of("achievement") as FactOf<"achievement">[]).map((a) => a.data.text);
    expect(bullets).toContain("Reduced late deliveries from 9% to 4% over 18 months");
  });

  it("extracts education, skills and languages", () => {
    const edu = of("education")[0] as FactOf<"education">;
    expect(edu.data.qualification).toBe("BSc Business Management");
    expect(edu.data.institution).toBe("University of Leeds");
    expect((of("skill") as FactOf<"skill">[]).map((s) => s.data.name)).toEqual(["Excel", "SQL", "Route planning", "Stakeholder management"]);
    expect((of("language") as FactOf<"language">[]).map((l) => l.data.level)).toEqual(["Native", "Fluent"]);
  });

  it("marks everything as unconfirmed imports", () => {
    expect(draft.facts.every((f) => !f.confirmed && f.source === "import")).toBe(true);
  });

  it("keeps the summary separately", () => {
    expect(draft.summary).toContain("eight years in logistics");
  });
});

describe("coverage check", () => {
  it("surfaces lines no fact explains instead of dropping them", () => {
    const draft = parseHeuristic(CV);
    const report = checkCoverage(CV, draft.facts, draft.summary);
    expect(report.attention).toContain("Long-distance running and community cooking classes");
    expect(report.attention).not.toContain("Manage a team of 12 coordinators");
  });

  it("every source line is either covered or listed for attention", () => {
    const draft = parseHeuristic(CV);
    // Drop all bullets: their lines must now appear in the attention list.
    const withoutBullets = draft.facts.filter((f) => f.type !== "achievement");
    const report = checkCoverage(CV, withoutBullets, draft.summary);
    expect(report.attention).toContain("Reduced late deliveries from 9% to 4% over 18 months");
    expect(report.attention).toContain("Scheduled 200+ weekly collections");
  });

  it("flags facts whose wording isn't in the source (possible invention)", () => {
    const invented = makeFact("work", { employer: "Google", title: "Principal Engineer", current: false }, { confirmed: false, source: "import" });
    const real = makeFact("skill", { name: "Route planning" }, { confirmed: false, source: "import" });
    const report = checkCoverage(CV, [invented, real], null);
    expect(report.unverified_fact_ids).toEqual([invented.id]);
  });

  it("tokenises across scripts", () => {
    expect(tokens("Gestión de proyectos, 東京")).toEqual(["gestión", "de", "proyectos", "東京"]);
  });
});
