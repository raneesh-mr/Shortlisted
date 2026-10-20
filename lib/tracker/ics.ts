import { addDays } from "./reminders";

/**
 * A calendar file with the day-7 and day-14 follow-up reminders, so people get
 * nudged by their own calendar without us sending anything.
 */

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const ymd = (d: string) => d.replace(/-/g, "");

/** RFC 5545 lines must be folded at 75 octets. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (new TextEncoder().encode(rest).length > 75) {
    let cut = 75;
    while (new TextEncoder().encode(rest.slice(0, cut)).length > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

export function followUpIcs(opts: { id: string; role: string; company: string; appliedAt: string; product: string; stamp?: Date }): string {
  const what = [opts.role || "your application", opts.company].filter(Boolean).join(" at ");
  const stamp = (opts.stamp ?? new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const event = (days: number, label: string) => {
    const start = addDays(opts.appliedAt, days);
    return [
      "BEGIN:VEVENT",
      `UID:${opts.id}-day${days}@${opts.product.toLowerCase()}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(start)}`,
      `DTEND;VALUE=DATE:${ymd(addDays(start, 1))}`,
      `SUMMARY:${esc(`${label}: ${what}`)}`,
      `DESCRIPTION:${esc(`You applied on ${opts.appliedAt}. If you haven't heard back, a short, polite follow-up is fine.`)}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${esc(`${label}: ${what}`)}`,
      "TRIGGER:PT9H",
      "END:VALARM",
      "END:VEVENT",
    ];
  };
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${opts.product}//Follow-up reminders//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...event(7, "Follow up"),
    ...event(14, "Second follow-up"),
    "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
