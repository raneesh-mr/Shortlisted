/** Shared text utilities for CV import (parsing and coverage). */

export const BULLET_PREFIX = /^\s*[•\-*–·▪●◦‣►✓]\s*/;

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", sept: "09", oct: "10", nov: "11", dec: "12",
};
const MONTH_NAMES = ["january","february","march","april","may","june","july","august","september","october","november","december"];

const MONTH_WORD = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
const DATE_TOKEN = `(?:${MONTH_WORD}\\s*['’]?\\d{2,4}|\\d{1,2}[/.\\-]\\d{4}|\\d{4}[/.\\-]\\d{1,2}|\\d{4})`;
export const DATE_RANGE = new RegExp(
  `(${DATE_TOKEN})\\s*(?:-|–|—|to|until|till)\\s*(present|current|now|today|date|${DATE_TOKEN})`,
  "i",
);
export const SINGLE_DATE = new RegExp(`\\b(${DATE_TOKEN})\\b`, "i");

/** Parses a date token into "YYYY-MM". Year-only values return { year } so callers can flag them. */
export function parseDateToken(raw: string): { month: string } | { year: string } | null {
  const s = raw.trim().toLowerCase().replace(/[’']/g, "");
  let m = s.match(/^([a-z]+)\.?\s*(\d{2,4})$/);
  if (m) {
    const mm = MONTHS[m[1]!.slice(0, 4)] ?? MONTHS[m[1]!.slice(0, 3)];
    let y = m[2]!;
    if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
    return mm ? { month: `${y}-${mm}` } : null;
  }
  m = s.match(/^(\d{1,2})[/.\-](\d{4})$/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return { month: `${m[2]}-${m[1]!.padStart(2, "0")}` };
  m = s.match(/^(\d{4})[/.\-](\d{1,2})$/);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return { month: `${m[1]}-${m[2]!.padStart(2, "0")}` };
  m = s.match(/^(\d{4})$/);
  if (m) return { year: m[1]! };
  return null;
}

const STOP = new Set(["and", "the", "of", "in", "at", "for", "to", "a", "an", "on", "with", "by", "&", "as", "or"]);

export function tokens(text: string): string[] {
  return (text.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}][\p{L}\p{N}+#.@'’]*/gu) ?? [])
    .map((t) => t.replace(/[.'’]+$/g, ""))
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** Tokens for a "YYYY-MM" value in all the ways a CV might write it. */
export function dateTokens(value: string | undefined): string[] {
  const m = value?.match(/^(\d{4})-(\d{2})$/);
  if (!m) return [];
  const idx = Number(m[2]) - 1;
  const name = MONTH_NAMES[idx]!;
  return [m[1]!, m[2]!, String(Number(m[2])), name, name.slice(0, 3), name.slice(0, 4), `${m[2]}/${m[1]}`, `${m[1]}-${m[2]}`];
}

export function normaliseLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0);
}
