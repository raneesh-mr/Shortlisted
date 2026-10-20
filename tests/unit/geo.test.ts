import { describe, expect, it } from "vitest";
import { countryFromAcceptLanguage, countryFromHeaders } from "@/lib/geo";

const headers = (h: Record<string, string>) => (name: string) => h[name] ?? null;

describe("country detection", () => {
  it("prefers Cloudflare's country header and ignores Tor/unknown", () => {
    expect(countryFromHeaders(headers({ "cf-ipcountry": "gb", "x-vercel-ip-country": "US" }))).toBe("GB");
    expect(countryFromHeaders(headers({ "cf-ipcountry": "T1", "accept-language": "en-AU" }))).toBe("AU");
  });

  it("falls back to the Vercel IP country header", () => {
    expect(countryFromHeaders(headers({ "x-vercel-ip-country": "ae", "accept-language": "en-GB" }))).toBe("AE");
  });

  it("ignores the unknown-country placeholder and falls back to Accept-Language", () => {
    expect(countryFromHeaders(headers({ "x-vercel-ip-country": "XX", "accept-language": "en-IN,en;q=0.9" }))).toBe("IN");
  });

  it("reads the first region subtag from Accept-Language", () => {
    expect(countryFromAcceptLanguage("fr,de-CH;q=0.8")).toBe("CH");
    expect(countryFromAcceptLanguage("en")).toBeNull();
    expect(countryFromAcceptLanguage(null)).toBeNull();
  });
});
