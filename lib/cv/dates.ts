import type { DateFormat } from "@/config/regions/schema";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Formats a "YYYY-MM" value. Returns "" for missing or malformed input. */
export function formatMonth(value: string | undefined, format: DateFormat): string {
  const m = value?.match(/^(\d{4})-(\d{2})$/);
  if (!m) return "";
  const [, y, mm] = m;
  switch (format) {
    case "MMM YYYY":
      return `${MONTHS[Number(mm) - 1]} ${y}`;
    case "MM/YYYY":
      return `${mm}/${y}`;
    case "MM.YYYY":
      return `${mm}.${y}`;
    case "YYYY-MM":
      return `${y}-${mm}`;
    case "YYYY/MM":
      return `${y}/${mm}`;
  }
}

export function formatRange(
  start: string | undefined,
  end: string | undefined,
  current: boolean,
  format: DateFormat,
): string {
  const s = formatMonth(start, format);
  const e = current ? "Present" : formatMonth(end, format);
  if (s && e) return `${s} – ${e}`;
  return s || e;
}

export function formatDay(value: string | undefined): string {
  const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}
