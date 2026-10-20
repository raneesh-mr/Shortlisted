import { describe, expect, it } from "vitest";
import { buildCvDocument, renderedToText } from "@/lib/cv/document";
import { formatMonth, formatRange } from "@/lib/cv/dates";
import { cvFor, sampleFacts } from "./fixtures";

describe("date formatting", () => {
  it("formats months per region convention", () => {
    expect(formatMonth("2021-03", "MMM YYYY")).toBe("Mar 2021");
    expect(formatMonth("2021-03", "MM/YYYY")).toBe("03/2021");
    expect(formatMonth("2021-03", "YYYY/MM")).toBe("2021/03");
    expect(formatMonth(undefined, "MMM YYYY")).toBe("");
    expect(formatRange("2021-03", undefined, true, "MMM YYYY")).toBe("Mar 2021 – Present");
  });
});

describe("buildCvDocument", () => {
  const facts = sampleFacts();

  it("traces every line back to a confirmed fact", () => {
    const doc = buildCvDocument(cvFor("GB"), facts);
    const confirmedIds = new Set(facts.filter((f) => f.confirmed).map((f) => f.id));
    for (const s of doc.sections) {
      for (const b of s.blocks) {
        const lines = b.kind === "entry" ? [b.title, ...b.bullets] : b.kind === "inline" ? b.items : [];
        for (const l of lines) expect(confirmedIds.has(l.source_fact_id!)).toBe(true);
      }
    }
  });

  it("never shows unconfirmed facts", () => {
    const text = renderedToText(buildCvDocument(cvFor("GB"), facts));
    expect(text).not.toContain("Unconfirmed skill");
    expect(buildCvDocument(cvFor("GB"), facts).hidden.unconfirmed).toBe(1);
  });

  it("orders current roles first and nests bullets under their role", () => {
    const doc = buildCvDocument(cvFor("GB"), facts);
    const exp = doc.sections.find((s) => s.id === "experience")!;
    const first = exp.blocks[0]!;
    expect(first.kind === "entry" && first.title.text).toBe("Facilities Manager");
    expect(first.kind === "entry" && first.bullets.map((b) => b.text)).toContain("Run a team of 14 technicians across 3 towers");
  });

  it("leaves personal details off for the UK and includes them for the Gulf", () => {
    const uk = renderedToText(buildCvDocument(cvFor("GB"), facts));
    expect(uk).not.toContain("Jordanian");
    expect(uk).not.toContain("1990");
    const gcc = buildCvDocument(cvFor("AE"), facts);
    const personal = gcc.sections.find((s) => s.id === "personal");
    expect(personal).toBeDefined();
    expect(renderedToText(gcc)).toContain("Nationality: Jordanian");
    expect(renderedToText(gcc)).toContain("Date of birth: 12 Apr 1990");
  });

  it("lets the user override a region default per CV", () => {
    const cv = cvFor("GB");
    cv.content.personal = { nationality: true };
    expect(renderedToText(buildCvDocument(cv, facts))).toContain("Nationality: Jordanian");
  });

  it("applies CV-only wording without changing the fact", () => {
    const cv = cvFor("GB");
    const bullet = facts.find((f) => f.type === "achievement")!;
    cv.content.text_overrides = { [bullet.id]: "Cut reactive calls by 18% in a year" };
    const text = renderedToText(buildCvDocument(cv, facts));
    expect(text).toContain("Cut reactive calls by 18% in a year");
    expect(bullet.type === "achievement" && bullet.data.text).toBe("Cut reactive maintenance calls by 18% in 12 months");
  });

  it("hides excluded facts", () => {
    const cv = cvFor("GB");
    const skill = facts.find((f) => f.type === "skill" && f.confirmed)!;
    cv.content.excluded_fact_ids = [skill.id];
    expect(renderedToText(buildCvDocument(cv, facts))).not.toContain("CAFM");
  });

  it("uses the region's paper, document name and date format", () => {
    const us = buildCvDocument(cvFor("US"), facts);
    expect(us.paper).toBe("Letter");
    expect(us.document_name).toBe("Resume");
    const de = buildCvDocument(cvFor("DE"), facts);
    expect(de.paper).toBe("A4");
    expect(renderedToText(de)).toContain("03/2021 – Present");
  });

  it("adds a referees line only where the region expects it", () => {
    expect(buildCvDocument(cvFor("AU"), facts).footer).toBe("Referees available on request.");
    expect(buildCvDocument(cvFor("GB"), facts).footer).toBeNull();
  });
});
