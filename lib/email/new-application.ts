import { composeInputsSchema, newId, nowIso, type Application, type Cv } from "@/lib/model";

/** A blank application, pointing at the most recently edited CV. */
export function newApplication(cvs: Cv[]): Application {
  const ts = nowIso();
  const latest = [...cvs].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  return {
    id: newId(),
    role: "",
    company: "",
    jd_text: "",
    cv_id: latest?.id ?? null,
    base_cv_id: latest?.id ?? null,
    email_id: null,
    status: "saved",
    applied_at: null,
    next_action_at: null,
    reminders: { day7: "pending", day14: "pending" },
    jd_analysis: null,
    match: null,
    gaps: {},
    tailor: null,
    compose: composeInputsSchema.parse({}),
    quick: null,
    notes: "",
    created_at: ts,
    updated_at: ts,
  };
}
