/**
 * Versioned consent texts. When wording changes, bump the version so that
 * every logged consent row records exactly what the person agreed to.
 */
export const consentTexts = {
  core: {
    version: "core-2026-10-19",
    text: "I agree that Landed stores the details I enter so it can build my CVs and emails. My data is never sold, shared or used to train AI models, and I can export or delete it at any time.",
  },
  email_updates: {
    version: "email-2026-10-19",
    text: "Send me occasional product updates by email. I can switch this off any time.",
  },
  whatsapp: {
    version: "whatsapp-2026-10-19",
    text: "Send me application reminders on WhatsApp. I can switch this off any time.",
  },
} as const;

export type ConsentPurpose = keyof typeof consentTexts;
export const consentPurposes = Object.keys(consentTexts) as ConsentPurpose[];
