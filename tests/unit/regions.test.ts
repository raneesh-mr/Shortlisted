import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { regionPackSchema } from "@/config/regions/schema";
import { rawRegionPacks } from "@/config/regions/index.generated";
import { defaultPersonalFields, getRegionPack, regionForCountry, regionPacks, spellingForCountry } from "@/lib/regions";

const dir = join(process.cwd(), "config", "regions");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

describe("region packs", () => {
  it.each(files)("%s is valid against the schema", (file) => {
    const raw = JSON.parse(readFileSync(join(dir, file), "utf8"));
    const result = regionPackSchema.safeParse(raw);
    if (!result.success) throw new Error(`${file}: ${result.error.message}`);
    expect(`${result.data.id}.json`).toBe(file);
  });

  it("the generated index includes every JSON file", () => {
    expect(rawRegionPacks).toHaveLength(files.length);
  });

  it("seeds the required regions plus the international fallback", () => {
    const ids = regionPacks.map((p) => p.id).sort();
    for (const id of ["us", "uk", "eu", "dach", "fr", "nordics", "anz", "in", "gcc", "sea", "jp", "latam", "africa", "international"]) {
      expect(ids).toContain(id);
    }
  });

  it("assigns each country to at most one pack", () => {
    const seen = new Map<string, string>();
    for (const p of regionPacks) {
      for (const c of p.countries) {
        expect(seen.has(c), `${c} is in both ${seen.get(c)} and ${p.id}`).toBe(false);
        seen.set(c, p.id);
      }
    }
  });

  it("falls back to international for unknown or missing countries", () => {
    expect(regionForCountry("ZZ").id).toBe("international");
    expect(regionForCountry(null).id).toBe("international");
    expect(getRegionPack("nope").id).toBe("international");
  });

  it("maps countries to the expected packs", () => {
    expect(regionForCountry("AE").id).toBe("gcc");
    expect(regionForCountry("de").id).toBe("dach");
    expect(regionForCountry("US").paper).toBe("Letter");
    expect(regionForCountry("JP").support).toBe("partial");
  });

  it("derives recommended personal fields from the pack", () => {
    expect(defaultPersonalFields(getRegionPack("gcc"))).toMatchObject({ photo: true, nationality: true, visa_status: true });
    expect(defaultPersonalFields(getRegionPack("us"))).toEqual({
      photo: false,
      date_of_birth: false,
      marital_status: false,
      nationality: false,
      visa_status: false,
    });
  });

  it("uses country-specific spelling where it differs from the pack", () => {
    expect(spellingForCountry("CA")).toBe("en-CA");
    expect(spellingForCountry("US")).toBe("en-US");
    expect(spellingForCountry("AU")).toBe("en-AU");
    expect(spellingForCountry("IN")).toBe("en-IN");
  });

  it("rejects a pack whose sections don't start with the header", () => {
    const bad = { ...getRegionPack("us"), sections_order: ["summary", "header", "experience"] };
    expect(regionPackSchema.safeParse(bad).success).toBe(false);
  });
});
