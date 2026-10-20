/**
 * Deterministic "things to double-check" for a job posting. Never a verdict:
 * plenty of real jobs trip one check, and scams can pass all of them. The UI
 * presents findings as questions to ask, with the text that triggered them.
 */

export type CheckId =
  | "asks_payment"
  | "bank_or_id"
  | "personal_email"
  | "unnamed_company"
  | "unrealistic_pay"
  | "urgency"
  | "chat_only"
  | "guarantees"
  | "untraceable_payment";

export interface CheckResult {
  id: CheckId;
  found: boolean;
  /** Snippets of the posting that triggered the check. */
  evidence: string[];
}

const FREE_MAIL = /\b[\w.+-]+@(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|aol|icloud|me|proton|protonmail|gmx|mail|yandex|zoho)\.[a-z.]{2,6}\b/gi;

const PATTERNS: Record<Exclude<CheckId, "personal_email" | "unnamed_company">, RegExp[]> = {
  asks_payment: [
    /\b(registration|training|processing|application|placement|security|onboarding|visa|medical|uniform|kit)\s+(fee|fees|deposit|charges?)\b/gi,
    /\b(pay|paying|payment of)\s+(a|the|an)?\s*(small\s+)?(fee|deposit)\b/gi,
    /\b(upfront|up-front|advance|refundable)\s+(payment|fee|deposit)\b/gi,
  ],
  bank_or_id: [
    /\b(bank (account )?details|account number|iban|routing number|sort code|credit card|debit card|card (number|details)|cvv)\b/gi,
    /\b(copy|scan|photo) of (your )?(passport|id|national id|driving licen[cs]e)\b/gi,
    /\b(ssn|social security number|aadhaar|pan card)\b/gi,
  ],
  unrealistic_pay: [
    /\b(earn|make)\s+(up to\s+)?[$£€₹]?\s?\d[\d,]*\s?(k|\+)?\s*(per|a|\/)\s*(day|week)\b/gi,
    /\b(unlimited (earning|income)|easy money|no experience (needed|required)[^.]{0,60}(earn|pay|salary)|get rich|financial freedom)\b/gi,
    /\b(work from home|from home)[^.]{0,40}\b(earn|make)\b/gi,
  ],
  urgency: [
    /\b(urgent(ly)? (hiring|required|needed)|immediate (start|joining) required|hiring immediately)\b/gi,
    /\b(limited (slots|positions|seats|vacancies)|only \d+ (slots|positions) left|apply (today|now) or|offer expires|respond within \d+ (hours|hrs))\b/gi,
  ],
  chat_only: [
    /\b(contact|message|text|reach|apply)( us| me)? (on|via|through) (whatsapp|telegram|signal|wechat|viber)\b/gi,
    /\b(interview|chat) (on|via|over) (telegram|whatsapp|signal|google hangouts|hangouts)\b/gi,
    /\b(telegram|whatsapp) (only|interview)\b/gi,
  ],
  guarantees: [/\b(guaranteed|100% guaranteed?) (job|placement|visa|income|selection)\b/gi, /\bno interview (needed|required)\b/gi],
  untraceable_payment: [/\b(bitcoin|crypto(currency)?|usdt|gift cards?|wire transfer|western union|moneygram)\b/gi],
};

function snippet(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 40);
  const end = Math.min(text.length, index + length + 40);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
}

export function checkPosting(text: string, opts: { recruiterEmail?: string; company?: string } = {}): CheckResult[] {
  const results: CheckResult[] = [];
  for (const [id, regexes] of Object.entries(PATTERNS) as [keyof typeof PATTERNS, RegExp[]][]) {
    const evidence: string[] = [];
    for (const re of regexes) {
      for (const m of text.matchAll(re)) if (evidence.length < 3) evidence.push(snippet(text, m.index!, m[0].length));
    }
    results.push({ id, found: evidence.length > 0, evidence });
  }

  const emails = [...`${text}\n${opts.recruiterEmail ?? ""}`.matchAll(FREE_MAIL)].map((m) => m[0]);
  results.push({ id: "personal_email", found: emails.length > 0, evidence: [...new Set(emails)].slice(0, 3) });

  const vague = [...text.matchAll(/\b(confidential (client|company|employer)|a leading (company|firm|organi[sz]ation)|reputed (company|firm)|well[- ]known (company|brand)|our client)\b/gi)].map((m) =>
    snippet(text, m.index!, m[0].length),
  );
  const unnamed = !opts.company?.trim();
  results.push({ id: "unnamed_company", found: unnamed || vague.length > 0, evidence: vague.slice(0, 3) });

  const order: CheckId[] = ["asks_payment", "bank_or_id", "untraceable_payment", "personal_email", "chat_only", "unrealistic_pay", "guarantees", "urgency", "unnamed_company"];
  return results.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}
