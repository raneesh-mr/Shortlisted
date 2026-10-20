import { describe, expect, it } from "vitest";
import { lintBullets, lintText, type LintRule } from "@/lib/humanizer/lint";

const rules = (text: string, source?: string) => lintText(text, { source }).findings.map((f) => f.rule);
const has = (text: string, rule: LintRule, source?: string) => rules(text, source).includes(rule);

describe("humanizer lint", () => {
  it("passes plain, specific writing", () => {
    const text =
      "Hello,\n\nI'd like to apply for the Facilities Manager role. At Harbour Estates I cut reactive maintenance calls by 18% in 12 months. I also run a team of 14 technicians.\n\nMy CV is attached. Happy to talk.\n\nThanks,\nAmira";
    const source = "Facilities Manager Harbour Estates Cut reactive maintenance calls by 18% in 12 months Run a team of 14 technicians Amira";
    const report = lintText(text, { source });
    expect(report.findings).toEqual([]);
    expect(report.passed).toBe(true);
    expect(report.score).toBe(100);
  });

  it("flags banned phrases with offsets", () => {
    const text = "I am writing to express my interest in this role. I spearheaded a project.";
    const report = lintText(text);
    const banned = report.findings.filter((f) => f.rule === "banned_phrase");
    expect(banned.map((f) => f.text)).toEqual(["I am writing to express my interest", "spearheaded"]);
    expect(text.slice(banned[1]!.start, banned[1]!.end)).toBe("spearheaded");
    expect(report.passed).toBe(false);
  });

  it("allows detail-oriented only when the user said it", () => {
    expect(has("I'm detail-oriented.", "banned_phrase")).toBe(true);
    expect(has("I'm detail-oriented.", "banned_phrase", "Detail-oriented planner")).toBe(false);
  });

  it("flags 'Please find attached my CV' only as a lone sentence", () => {
    expect(has("Thanks for reading.\nPlease find attached my CV.", "lone_closing")).toBe(true);
    expect(has("Please find attached my CV.", "lone_closing")).toBe(true);
    expect(has("My CV is attached, along with two references you asked for.", "lone_closing")).toBe(false);
  });

  it("flags three sentences in a row with the same opener", () => {
    expect(has("I led the team in Dubai. I ran the budget for two towers. I hired four technicians last year.", "repeated_openers")).toBe(true);
    expect(has("I led the team in Dubai. The budget covered two towers. I hired four technicians last year.", "repeated_openers")).toBe(false);
  });

  it("flags uniform sentence length", () => {
    const flat = "I ran the main team here. I set the weekly budget plan. I hired the new site staff. I fixed the slow ticket queue.";
    expect(has(flat, "uniform_length")).toBe(true);
    const varied = "I ran the team. Over two years we moved every tower onto one maintenance contract and cut costs. It worked. I also hired staff.";
    expect(has(varied, "uniform_length")).toBe(false);
  });

  it("allows one em dash, flags the rest, and flags exclamation marks", () => {
    expect(rules("One — fine.").filter((r) => r === "em_dash")).toHaveLength(0);
    expect(rules("One — two — three.").filter((r) => r === "em_dash")).toHaveLength(1);
    expect(has("Great news!", "exclamation")).toBe(true);
    expect(lintText("Great news!", { allowExclamation: true }).findings).toHaveLength(0);
  });

  it("flags 'not just X, but Y', rhetorical questions and stacked adjectives", () => {
    expect(has("It was not just a job, but a calling.", "not_just_but")).toBe(true);
    expect(has("Have you ever wondered why towers leak?", "rhetorical_question")).toBe(true);
    expect(has("Could you tell me about next steps?", "rhetorical_question")).toBe(false);
    expect(has("I am creative, reliable and motivated.", "triple_adjectives")).toBe(true);
    expect(has("I know Excel, SQL and Python.", "triple_adjectives")).toBe(false);
  });

  it("flags buzzword density", () => {
    expect(has("An innovative, strategic and holistic approach.", "buzzwords")).toBe(true);
    expect(has("I took a strategic view of the budget.", "buzzwords")).toBe(false);
  });

  it("flags numbers, names and praise not found in the user's own facts", () => {
    const source = "Cut calls by 18% in 12 months at Harbour Estates";
    expect(has("I cut calls by 18% in 12 months.", "unsupported_number", source)).toBe(false);
    expect(has("I cut calls by 25% in 12 months.", "unsupported_number", source)).toBe(true);
    expect(has("At Harbour Estates I cut calls.", "unsupported_name", source)).toBe(false);
    expect(has("I used Salesforce daily.", "unsupported_name", source)).toBe(true);
    expect(has("I have extensive experience.", "unsupported_adjective", source)).toBe(true);
    expect(has("I have extensive experience.", "unsupported_adjective", "extensive experience in towers")).toBe(false);
  });

  it("treats 1,200 and 1200 as the same number", () => {
    expect(has("I managed 1,200 units.", "unsupported_number", "managed 1200 units")).toBe(false);
  });
});

describe("bullet parallelism", () => {
  it("flags lists where every bullet is '-ed verb … %'", () => {
    expect(lintBullets(["Increased sales by 10%", "Reduced costs by 5%", "Improved NPS by 12%"])).toHaveLength(1);
    expect(lintBullets(["Increased sales by 10%", "Run a team of 14", "Improved NPS by 12%"])).toHaveLength(0);
  });
});
