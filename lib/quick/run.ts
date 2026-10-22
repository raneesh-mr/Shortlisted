import { ApiClientError, apiFetch } from "@/lib/client-api";
import { newCv } from "@/lib/cv/create";
import { newApplication } from "@/lib/email/new-application";
import { extractText } from "@/lib/import/extract";
import type { ImportResult } from "@/lib/import/types";
import type { JdAnalysis, MatchResult, TailorChange, TailorDecision } from "@/lib/jd/schema";
import { nowIso, type Application, type Cv, type Fact, type Profile } from "@/lib/model";
import { applyTailor } from "@/lib/tailor/apply";

/**
 * The quick flow: your CV + a job → a tailored CV, in one go.
 * Truth rules still hold: imported facts are saved unconfirmed until the user
 * taps "Looks right"; tailoring only rephrases, and changes the checks flagged
 * (new names or job terms) are not applied automatically.
 */

export type QuickStep = "cv" | "job" | "match" | "write";

export interface QuickInput {
  cvFile?: File | null;
  cvText?: string;
  jdFile?: File | null;
  jdText?: string;
  useAi: boolean;
}

export interface QuickDeps {
  facts: Fact[];
  cvs: Cv[];
  profile: Profile | null;
  saveFacts(facts: Fact[]): Promise<void>;
  saveCv(cv: Cv, opts?: { snapshot?: boolean }): Promise<void>;
  saveApplication(app: Application): Promise<void>;
}

export class QuickError extends Error {
  constructor(public readonly code: "need_cv" | "need_job") {
    super(code);
  }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await apiFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return (await res.json()) as T;
}

/** AI errors that the basic (rule-based) path can stand in for. */
const AI_FALLBACK = new Set(["not_configured", "ai_unavailable", "ai_invalid", "ai_refused"]);

/** A fact's identity for de-duplication against what the user already has. */
function factKey(f: Fact): string {
  const d = f.data as Record<string, unknown>;
  const main = [d.text, d.title, d.employer, d.name, d.qualification, d.institution].filter((x) => typeof x === "string").join("|");
  return `${f.type}:${main.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

export async function runQuick(input: QuickInput, deps: QuickDeps, onStep: (s: QuickStep) => void): Promise<{ appId: string; cvId: string }> {
  let mode: "ai" | "basic" = input.useAi ? "ai" : "basic";
  // Try AI; if it's off or failing, carry on with the basic method for the rest of the run.
  const call = async <T,>(url: string, body: Record<string, unknown>): Promise<T> => {
    try {
      return await post<T>(url, { ...body, mode });
    } catch (err) {
      if (mode === "ai" && err instanceof ApiClientError && AI_FALLBACK.has(err.code)) {
        mode = "basic";
        return post<T>(url, { ...body, mode });
      }
      throw err;
    }
  };

  // 1. Your CV → facts (unconfirmed until reviewed), skipping ones already saved.
  onStep("cv");
  let newFacts: Fact[] = [];
  let checkIds: string[] = [];
  let summary = "";
  const cvText = input.cvFile ? await extractText(input.cvFile) : (input.cvText ?? "").trim();
  if (cvText) {
    const imported = await call<ImportResult>("/api/cv/import", { text: cvText });
    const have = new Set(deps.facts.map(factKey));
    const hasContact = deps.facts.some((f) => f.type === "contact" && f.confirmed);
    newFacts = imported.facts.filter((f) => !have.has(factKey(f)) && !(f.type === "contact" && hasContact));
    const kept = new Set(newFacts.map((f) => f.id));
    checkIds = imported.unverified_fact_ids.filter((id) => kept.has(id));
    summary = imported.summary ?? "";
    if (newFacts.length) await deps.saveFacts(newFacts);
  } else if (!deps.facts.some((f) => f.confirmed && f.type === "work")) {
    throw new QuickError("need_cv");
  }

  // 2. The job → requirements.
  onStep("job");
  const jdText = input.jdFile ? await extractText(input.jdFile) : (input.jdText ?? "").trim();
  if (!jdText) throw new QuickError("need_job");
  const analysis = await call<JdAnalysis>("/api/jd/analyze", { jd_text: jdText, title: "", company: "" });

  // 3. Match. Imported facts count as yours while you review them.
  onStep("match");
  const working = [...deps.facts.filter((f) => !newFacts.some((n) => n.id === f.id)), ...newFacts].map((f) =>
    newFacts.some((n) => n.id === f.id) ? ({ ...f, confirmed: true } as Fact) : f,
  );
  const match = await call<MatchResult>("/api/match", { analysis, facts: working, not_done: [] });

  // 4. Write: a base CV (new when a CV was uploaded), then the tailored copy.
  onStep("write");
  const latestBase = [...deps.cvs].filter((c) => !c.base_cv_id).sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  const base = cvText || !latestBase ? newCv("My CV", deps.profile, summary) : latestBase;
  const proposed = await call<{ method: "ai" | "basic"; changes: TailorChange[] }>("/api/cv/tailor", {
    jd_text: jdText,
    cv: { region_id: base.region_id, template_id: base.template_id, content: base.content },
    facts: working,
    analysis,
    match,
  });
  // Clean changes are applied; anything flagged waits for the user.
  const decisions: Record<string, TailorDecision> = Object.fromEntries(
    proposed.changes.map((c) => [c.id, { status: c.flags.length ? "pending" : "accepted" } as TailorDecision]),
  );
  const title = [analysis.title, analysis.company].filter(Boolean).join(" – ") || "Tailored CV";
  const tailored = applyTailor(base, proposed.changes, decisions, title);

  const app: Application = {
    ...newApplication([tailored]),
    role: analysis.title,
    company: analysis.company,
    jd_text: jdText.slice(0, 30_000),
    jd_analysis: analysis,
    match,
    cv_id: tailored.id,
    base_cv_id: base.id,
    tailor: { method: proposed.method, changes: proposed.changes, decisions, tailored_cv_id: tailored.id },
    quick: { fact_ids: newFacts.map((f) => f.id), check_ids: checkIds, reviewed: newFacts.length === 0 },
    updated_at: nowIso(),
  };

  if (base !== latestBase) await deps.saveCv(base, { snapshot: true });
  await deps.saveCv(tailored, { snapshot: true });
  await deps.saveApplication(app);
  return { appId: app.id, cvId: tailored.id };
}
