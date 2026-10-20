import type { ComposeInputs, Tone } from "@/lib/model";

export type Slot = "greeting" | "opener" | "evidence" | "close" | "signoff";

export interface Paragraph {
  slot: Slot;
  text: string;
  /** Facts this paragraph is built from (the trace back to the user's truth). */
  fact_ids: string[];
}

export interface EmailDraft {
  subjects: string[];
  paragraphs: Paragraph[];
}

const TITLES = /^(mr|mrs|ms|mx|dr|prof)\.?$/i;

/** Uses the name only if the user typed one. Never invents a recipient. */
export function greeting(tone: Tone, inputs: Pick<ComposeInputs, "recipient_name">, company: string): string {
  const name = inputs.recipient_name.trim();
  if (name) {
    if (tone === "formal") return `Dear ${name},`;
    const parts = name.split(/\s+/);
    return `Hi ${TITLES.test(parts[0]!) ? name : parts[0]},`;
  }
  if (tone === "formal" && company.trim()) return `Dear ${company.trim()} team,`;
  return "Hello,";
}

export function signOff(tone: Tone, name: string, contact: string[]): string {
  const word = tone === "formal" ? "Kind regards," : tone === "warm" ? "Best wishes," : "Thanks,";
  return [word, name, ...(contact.length ? [contact.join(" | ")] : [])].filter(Boolean).join("\n");
}

export function bodyText(paragraphs: Paragraph[]): string {
  return paragraphs
    .map((p) => p.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

/** Everything the user wrote or confirmed: numbers, names and praise words in the email must come from here. */
export function claimSource(parts: { candidates: { text: string; context: string }[]; inputs: ComposeInputs; role: string; company: string; name: string; contact: string[] }): string {
  const i = parts.inputs;
  return [
    ...parts.candidates.flatMap((c) => [c.text, c.context]),
    i.recipient_name,
    i.source,
    i.company_detail,
    i.interview_detail,
    i.date_note,
    i.reason,
    parts.role,
    parts.company,
    parts.name,
    ...parts.contact,
  ]
    .filter(Boolean)
    .join("\n");
}

export function ensureSentence(s: string): string {
  const t = s.trim();
  if (!t) return "";
  return /[.!?]$/.test(t) ? t : `${t}.`;
}
