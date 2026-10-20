import { beforeEach, describe, expect, it, vi } from "vitest";
import { bodyText } from "@/lib/email/assemble";
import { composeBasic } from "@/lib/email/basic";
import { ComposeInputError, buildContext, composeRequestSchema, lintDraft, type ComposeRequest } from "@/lib/email/compose";
import { MAILTO_SOFT_LIMIT, buildEml, mailtoHref } from "@/lib/email/send";
import { composeInputsSchema, type EmailVariant } from "@/lib/model";
import { cvFor, sampleFacts } from "./fixtures";

const JD = "We need a Facilities Manager to lead technicians and reduce reactive maintenance across residential towers.";

function request(variant: EmailVariant, inputs: Partial<ReturnType<typeof composeInputsSchema.parse>> = {}, extra: Partial<ComposeRequest> = {}): ComposeRequest {
  const cv = cvFor("AE");
  return composeRequestSchema.parse({
    mode: "basic",
    variant,
    role: "Facilities Manager",
    company: "Marina Living",
    jd_text: JD,
    inputs: composeInputsSchema.parse(inputs),
    cv: { region_id: cv.region_id, template_id: cv.template_id, content: cv.content },
    facts: sampleFacts(),
    ...extra,
  });
}

describe("basic composer", () => {
  it("builds an application email from confirmed facts only, with a neutral greeting", () => {
    const ctx = buildContext(request("apply_direct"));
    const draft = composeBasic(ctx);
    const body = bodyText(draft.paragraphs);
    expect(draft.paragraphs[0]!.text).toBe("Dear Marina Living team,"); // GCC default tone is formal
    expect(body).toContain("I would like to apply for the Facilities Manager role at Marina Living.");
    expect(body).toContain("- Cut reactive maintenance calls by 18% in 12 months (Facilities Manager, Harbour Estates)");
    expect(body).not.toContain("Unconfirmed skill");
    expect(body).toContain("Kind regards,\nAmira Haddad");
    expect(draft.subjects).toHaveLength(3);
    const evidence = draft.paragraphs.find((p) => p.slot === "evidence")!;
    expect(evidence.fact_ids.length).toBeGreaterThanOrEqual(2);
  });

  it("uses the recipient's name only when given, and follows the tone", () => {
    const ctx = buildContext(request("apply_direct", { recipient_name: "Sara Khan", tone: "warm" }));
    const draft = composeBasic(ctx);
    expect(draft.paragraphs[0]!.text).toBe("Hi Sara,");
    expect(draft.paragraphs.at(-1)!.text.startsWith("Best wishes,")).toBe(true);
    expect(bodyText(draft.paragraphs)).toContain("I'd like to apply");
  });

  it("passes its own humanizer lint for every variant", () => {
    const inputs = { source: "Omar Said", interview_detail: "We talked about the tower handover plan.", date_note: "3 November", reason: "I've accepted another role closer to home." };
    for (const variant of ["apply_direct", "referral", "follow_up", "after_interview", "thank_you", "accept_offer", "decline_offer"] as const) {
      for (const tone of ["direct", "warm", "formal"] as const) {
        const ctx = buildContext(request(variant, { ...inputs, tone }));
        const report = lintDraft(composeBasic(ctx), ctx);
        expect(report.findings.filter((f) => f.severity === "error"), `${variant}/${tone}`).toEqual([]);
      }
    }
  });

  it("requires the inputs a variant depends on", () => {
    expect(() => buildContext(request("referral"))).toThrow(ComposeInputError);
    expect(() => buildContext(request("after_interview"))).toThrow(ComposeInputError);
  });

  it("puts the referrer in the opener", () => {
    const body = bodyText(composeBasic(buildContext(request("referral", { source: "Omar Said" }))).paragraphs);
    expect(body).toContain("Omar Said suggested I get in touch about the Facilities Manager role at Marina Living.");
  });

  it("picks the facts that match the job", () => {
    const ctx = buildContext(request("apply_direct", { length: "short" }));
    expect(ctx.picks).toHaveLength(2);
    expect(ctx.picks[0]!.text).toMatch(/reactive maintenance|technicians/);
  });
});

describe("AI composer (model mocked)", () => {
  const generate = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    generate.mockReset();
    vi.doMock("@/lib/llm", () => ({ generateStructured: generate, llmConfigured: () => true, LlmError: class extends Error {} }));
  });

  it("drops evidence that doesn't cite a real fact, and maps refs to fact ids", async () => {
    const { composeWithAi } = await import("@/lib/email/ai");
    const ctx = buildContext(request("apply_direct", { tone: "direct" }));
    const ref = ctx.candidates.find((c) => c.text.includes("18%"))!;
    generate.mockResolvedValueOnce({
      subjects: ["Facilities Manager application", "Facilities Manager role", "Application: Facilities Manager"],
      opener: "Hello, I'd like to apply for the Facilities Manager role at Marina Living.",
      evidence: [
        { text: "At Harbour Estates I cut reactive maintenance calls by 18% in 12 months.", refs: [ref.ref] },
        { text: "I also won an industry award.", refs: [] },
        { text: "I led a team of 50.", refs: ["F99"] },
      ],
      close: "My CV is attached, and I'm happy to talk. Thanks,",
    });
    const { draft, regenerated } = await composeWithAi(ctx);
    const evidence = draft.paragraphs.find((p) => p.slot === "evidence")!;
    expect(evidence.text).toBe("At Harbour Estates I cut reactive maintenance calls by 18% in 12 months.");
    expect(evidence.fact_ids).toEqual([ref.fact_id]);
    expect(draft.paragraphs.find((p) => p.slot === "opener")!.text).toBe("I'd like to apply for the Facilities Manager role at Marina Living.");
    expect(draft.paragraphs.find((p) => p.slot === "close")!.text).toBe("My CV is attached, and I'm happy to talk.");
    expect(regenerated).toBe(false);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("regenerates once with lint feedback, then shows remaining flags", async () => {
    const { composeWithAi } = await import("@/lib/email/ai");
    const ctx = buildContext(request("apply_direct", { tone: "direct" }));
    const ref = ctx.candidates[0]!.ref;
    const bad = { subjects: ["A", "B", "C"], opener: "I am writing to express my interest in this dynamic role.", evidence: [{ text: "I cut costs by 40%.", refs: [ref] }], close: "Thanks." };
    generate.mockResolvedValueOnce(bad).mockResolvedValueOnce(bad);
    const { lint, regenerated } = await composeWithAi(ctx);
    expect(regenerated).toBe(true);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]![0].user).toContain("<lint_feedback>");
    expect(lint.findings.map((f) => f.rule)).toEqual(expect.arrayContaining(["banned_phrase", "unsupported_number"]));
    expect(lint.passed).toBe(false);
  });
});

describe("send helpers", () => {
  it("encodes mailto links (spaces as %20, CRLF line breaks, & and ? escaped)", () => {
    const href = mailtoHref("sara@example.com", "Hello & welcome?", "Line one\nLine two");
    expect(href).toBe("mailto:sara@example.com?subject=Hello%20%26%20welcome%3F&body=Line%20one%0D%0ALine%20two");
    expect(MAILTO_SOFT_LIMIT).toBeGreaterThan(1000);
  });

  it("allows an empty recipient", () => {
    expect(mailtoHref("", "S", "B")).toBe("mailto:?subject=S&body=B");
  });

  it("builds an unsent .eml draft with encoded subject and UTF-8 body", () => {
    const eml = buildEml({ to: "sara@example.com", subject: "Candidature – Café", body: "Hi Sara,\nMerci.", date: new Date("2026-10-20T09:00:00Z") });
    expect(eml).toContain("To: sara@example.com\r\n");
    expect(eml).toContain("X-Unsent: 1\r\n");
    expect(eml).toMatch(/Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=\r\n/);
    const body = eml.split("\r\n\r\n")[1]!.replace(/\r\n/g, "");
    expect(new TextDecoder().decode(Uint8Array.from(atob(body), (c) => c.charCodeAt(0)))).toBe("Hi Sara,\r\nMerci.");
  });
});
