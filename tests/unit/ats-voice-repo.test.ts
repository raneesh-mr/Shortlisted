import { describe, expect, it } from "vitest";
import { runAtsCheck } from "@/lib/ats/check";
import { buildCvDocument } from "@/lib/cv/document";
import { LocalRepo } from "@/lib/repo/local";
import { buildVoiceProfile } from "@/lib/voice/profile";
import { cvFor, sampleFacts } from "./fixtures";

describe("ATS check", () => {
  it("passes a clean CV and reports page length against the region norm", () => {
    const doc = buildCvDocument(cvFor("US"), sampleFacts());
    const checks = runAtsCheck({ doc, pages: 3, extractable: true });
    expect(checks.find((c) => c.id === "fonts")?.status).toBe("pass");
    expect(checks.find((c) => c.id === "length")).toMatchObject({ status: "warn", message: "This runs to 3 pages; the norm here is up to 2." });
    expect(checks.find((c) => c.id === "extractable")?.status).toBe("pass");
  });

  it("flags a missing name and missing email", () => {
    const doc = buildCvDocument(cvFor("GB"), []);
    const checks = runAtsCheck({ doc });
    expect(checks.find((c) => c.id === "name")?.status).toBe("fail");
    expect(checks.find((c) => c.id === "contact")?.status).toBe("warn");
  });
});

describe("voice profile", () => {
  it("needs a minimum sample", () => {
    expect(buildVoiceProfile("Too short.")).toBeNull();
  });

  it("measures contractions, spelling and formality", () => {
    const sample =
      "Hi Sam, thanks for the update. I've had a look and it's mostly fine. We should prioritise the colour changes before Friday. Let me know if you'd like me to call the supplier. Cheers!";
    const p = buildVoiceProfile(sample)!;
    expect(p.uses_contractions).toBe(true);
    expect(p.spelling).toBe("en-GB");
    expect(p.formality).toBe("casual");
    expect(p.punctuation.exclamations).toBe(true);
  });
});

describe("guest repo (IndexedDB)", () => {
  it("keeps only the last 10 versions and cleans up on delete", async () => {
    const repo = new LocalRepo(`test-${Math.random()}`);
    const cv = cvFor("GB");
    await repo.saveCv(cv);
    for (let i = 0; i < 13; i++) await repo.addVersion({ ...cv, title: `v${i}` });
    const versions = await repo.listVersions(cv.id);
    expect(versions).toHaveLength(10);
    expect(versions[0]!.title).toBe("v12");

    const copy = { ...cvFor("GB"), base_cv_id: cv.id };
    await repo.saveCv(copy);
    await repo.deleteCv(cv.id);
    expect(await repo.listVersions(cv.id)).toHaveLength(0);
    expect((await repo.listCvs()).find((c) => c.id === copy.id)?.base_cv_id).toBeNull();
  });

  it("exports and fully clears guest data", async () => {
    const repo = new LocalRepo(`test-${Math.random()}`);
    await repo.saveFacts(sampleFacts());
    expect((await repo.exportAll()).facts.length).toBeGreaterThan(0);
    await repo.clearAll();
    expect(await repo.hasData()).toBe(false);
  });
});
