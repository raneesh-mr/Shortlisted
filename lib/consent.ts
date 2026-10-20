import { consentTexts, type ConsentPurpose } from "@/config/consents";
import { nowIso, type Consent } from "@/lib/model";

const PENDING_KEY = "landed_pending_consent";

export function consentRecord(purpose: ConsentPurpose, granted: boolean): Consent {
  return { purpose, text_version: consentTexts[purpose].version, granted, granted_at: nowIso() };
}

/** Held in the browser between "agree" and finishing sign-in, then written to the consents table. */
export function storePendingConsent(consents: Consent[]) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(consents));
}

export function takePendingConsent(): Consent[] {
  const raw = localStorage.getItem(PENDING_KEY);
  localStorage.removeItem(PENDING_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Consent[];
  } catch {
    return [];
  }
}

/** Latest decision per purpose. */
export function currentConsents(log: Consent[]): Partial<Record<ConsentPurpose, Consent>> {
  const out: Partial<Record<ConsentPurpose, Consent>> = {};
  for (const c of [...log].sort((a, b) => a.granted_at.localeCompare(b.granted_at))) out[c.purpose] = c;
  return out;
}
