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
    email_id: null,
    status: "saved",
    compose: composeInputsSchema.parse({}),
    notes: "",
    created_at: ts,
    updated_at: ts,
  };
}
