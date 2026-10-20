/** Country detection helpers. Detection is a hint only; the user can always override. */

const ISO2 = /^[A-Z]{2}$/;

// "XX" = unknown, "T1" = Tor (Cloudflare). Neither is a real country.
const NOT_A_COUNTRY = new Set(["XX", "T1"]);

/** Cloudflare's cf-ipcountry first (production host), then Vercel's header, then Accept-Language. */
export function countryFromHeaders(get: (name: string) => string | null): string | null {
  for (const header of ["cf-ipcountry", "x-vercel-ip-country"]) {
    const value = get(header)?.toUpperCase();
    if (value && ISO2.test(value) && !NOT_A_COUNTRY.has(value)) return value;
  }
  return countryFromAcceptLanguage(get("accept-language"));
}

/** Picks the first region subtag, e.g. "en-GB,en;q=0.9" -> "GB". */
export function countryFromAcceptLanguage(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const tag = part.split(";")[0]?.trim();
    const region = tag?.split("-")[1]?.toUpperCase();
    if (region && ISO2.test(region)) return region;
  }
  return null;
}

export const GEO_COOKIE = "landed_geo";

/** ISO 3166-1 alpha-2 codes offered in country pickers. Names come from Intl.DisplayNames. */
export const countryCodes = (
  "AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PR PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN VU WS XK YE ZA ZM ZW"
).split(" ");

export function countryName(code: string | null | undefined, locale = "en"): string {
  if (!code) return "";
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}
