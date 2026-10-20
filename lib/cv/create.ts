import { newId, nowIso, type Cv, type Profile } from "@/lib/model";
import { regionForCountry } from "@/lib/regions";
import { defaultCvContent } from "./document";

export function newCv(title: string, profile: Profile | null, summary = ""): Cv {
  const country = profile?.target_country ?? profile?.home_country ?? null;
  const pack = regionForCountry(country);
  const ts = nowIso();
  return {
    id: newId(),
    title,
    region_id: pack.id,
    template_id: "modern",
    base_cv_id: null,
    content: { ...defaultCvContent(pack, country), summary },
    status: "draft",
    created_at: ts,
    updated_at: ts,
  };
}

export function duplicateCv(cv: Cv, title: string): Cv {
  const ts = nowIso();
  return { ...cv, id: newId(), title, base_cv_id: cv.id, created_at: ts, updated_at: ts };
}
