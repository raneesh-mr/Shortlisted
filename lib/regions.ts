import { rawRegionPacks } from "@/config/regions/index.generated";
import {
  regionPackSchema,
  type PersonalField,
  type RegionPack,
  type Spelling,
} from "@/config/regions/schema";

export const FALLBACK_REGION_ID = "international";

function loadPacks(): RegionPack[] {
  return rawRegionPacks.map((raw) => regionPackSchema.parse(raw));
}

export const regionPacks: RegionPack[] = loadPacks();

const byId = new Map(regionPacks.map((p) => [p.id, p]));
const byCountry = new Map<string, RegionPack>();
for (const pack of regionPacks) {
  for (const c of pack.countries) byCountry.set(c, pack);
}

export function getRegionPack(id: string | null | undefined): RegionPack {
  return (id && byId.get(id)) || byId.get(FALLBACK_REGION_ID)!;
}

export function regionForCountry(country: string | null | undefined): RegionPack {
  if (!country) return getRegionPack(FALLBACK_REGION_ID);
  return byCountry.get(country.toUpperCase()) ?? getRegionPack(FALLBACK_REGION_ID);
}

/** Spelling follows the target country where it differs from its pack default. */
export function spellingForCountry(country: string | null | undefined): Spelling {
  if (country === "CA") return "en-CA";
  if (country === "PH") return "en-US";
  return regionForCountry(country).spelling;
}

/** Recommended default for each personal field under a pack. */
export function defaultPersonalFields(pack: RegionPack): Record<PersonalField, boolean> {
  return {
    photo: pack.photo === "common",
    date_of_birth: pack.date_of_birth === "common",
    marital_status: pack.marital_status === "common",
    nationality: pack.nationality === "common",
    visa_status: pack.visa_status === "common",
  };
}
