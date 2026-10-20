import { buildCvDocument, type RenderedCv } from "@/lib/cv/document";
import { lintBullets, lintText, type LintFinding } from "@/lib/humanizer/lint";
import type { TailorChange, TailorDecision } from "@/lib/jd/schema";
import { newId, nowIso, type Cv, type Fact } from "@/lib/model";

/**
 * Builds the tailored CV from the base CV plus only the accepted changes.
 * The base CV is never modified.
 */
export function applyTailor(base: Cv, changes: TailorChange[], decisions: Record<string, TailorDecision>, title: string): Cv {
  const content = structuredClone(base.content);
  for (const c of changes) {
    const d = decisions[c.id];
    if (d?.status !== "accepted") continue;
    switch (c.kind) {
      case "summary":
        content.summary = (d.edited ?? c.after).trim();
        break;
      case "wording":
        content.text_overrides[c.fact_id] = (d.edited ?? c.after).trim();
        break;
      case "order":
        // Listed ids sort before unlisted ones, so putting the group first keeps every other group's order.
        content.order = [...c.after, ...content.order.filter((id) => !c.after.includes(id))];
        break;
      case "include":
        content.excluded_fact_ids = content.excluded_fact_ids.filter((id) => id !== c.fact_id);
        break;
    }
  }
  const ts = nowIso();
  return { ...base, id: newId(), title: title.slice(0, 120), base_cv_id: base.id, content, status: "draft", created_at: ts, updated_at: ts };
}

/** Humanizer flags on the tailored CV: the summary as prose, each role's bullets as a list. */
export function lintTailored(doc: RenderedCv, facts: Fact[]): LintFinding[] {
  const source = facts
    .filter((f) => f.confirmed)
    .map((f) => Object.values(f.data).filter((v) => typeof v === "string").join(" "))
    .join("\n");
  const findings: LintFinding[] = [];
  for (const s of doc.sections) {
    for (const b of s.blocks) {
      if (b.kind === "paragraph") findings.push(...lintText(b.line.text, { source }).findings);
      if (b.kind === "entry") {
        findings.push(...lintBullets(b.bullets.map((x) => x.text)));
        for (const bl of b.bullets.filter((x) => x.overridden)) findings.push(...lintText(bl.text, { source }).findings);
      }
    }
  }
  return findings;
}

export function previewTailored(base: Cv, changes: TailorChange[], decisions: Record<string, TailorDecision>, facts: Fact[]): RenderedCv {
  return buildCvDocument(applyTailor(base, changes, decisions, base.title), facts);
}
