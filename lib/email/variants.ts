import type { ComposeInputs, EmailLength, EmailVariant } from "@/lib/model";

/**
 * Each variant has a fixed structure. Code assembles greeting, paragraphs and
 * sign-off; the AI (or the basic templates) only fill the slots, from the
 * user's facts and inputs.
 */
export interface VariantSpec {
  id: EmailVariant;
  /** Facts the evidence paragraph should cite: [min, max] per length. */
  facts: Record<EmailLength, [number, number]>;
  /** Inputs the user must fill before composing. */
  requires: (keyof ComposeInputs)[];
  /** Word range for the whole email, per length. */
  words: Record<EmailLength, [number, number]>;
  /** What each slot should do. Passed to the AI as structure instructions. */
  guide: { opener: string; evidence: string; close: string };
  usesJd: boolean;
}

export const variants: Record<EmailVariant, VariantSpec> = {
  apply_direct: {
    id: "apply_direct",
    facts: { short: [2, 2], standard: [2, 3] },
    requires: [],
    words: { short: [60, 90], standard: [90, 150] },
    usesJd: true,
    guide: {
      opener: "One sentence on which role this is and, only if the user gave one, the specific reason or company detail they supplied. If they said how they found it, mention it briefly.",
      evidence: "Two or three sentences, each built from one cited fact that matches the job. Quote numbers exactly.",
      close: "One simple sentence: the CV is attached and they'd be glad to talk. No flattery, no pressure.",
    },
  },
  referral: {
    id: "referral",
    facts: { short: [2, 2], standard: [2, 3] },
    requires: ["source"],
    words: { short: [60, 90], standard: [90, 150] },
    usesJd: true,
    guide: {
      opener: "One sentence saying the referrer (the 'source' input, a person) suggested they get in touch about the role.",
      evidence: "Two or three sentences, each built from one cited fact that matches the job.",
      close: "One simple sentence: CV attached, happy to talk.",
    },
  },
  follow_up: {
    id: "follow_up",
    facts: { short: [0, 1], standard: [1, 1] },
    requires: [],
    words: { short: [40, 70], standard: [60, 100] },
    usesJd: true,
    guide: {
      opener: "One sentence: they applied for the role (mention the date only if the user gave it) and are checking in.",
      evidence: "At most one sentence with one cited fact that fits the role, as a gentle reminder.",
      close: "Ask plainly whether there's an update or a timeline. One sentence.",
    },
  },
  after_interview: {
    id: "after_interview",
    facts: { short: [0, 1], standard: [0, 1] },
    requires: ["interview_detail"],
    words: { short: [40, 70], standard: [60, 110] },
    usesJd: false,
    guide: {
      opener: "Thank them for the interview for the role, referring to the interview detail the user supplied, in the user's terms.",
      evidence: "Optionally one sentence connecting one cited fact to what was discussed. Leave empty if nothing fits.",
      close: "Ask politely about next steps or timing. One sentence.",
    },
  },
  thank_you: {
    id: "thank_you",
    facts: { short: [0, 0], standard: [0, 1] },
    requires: ["interview_detail"],
    words: { short: [30, 60], standard: [50, 90] },
    usesJd: false,
    guide: {
      opener: "Thank them for their time, mentioning the specific thing the user supplied.",
      evidence: "Optionally one sentence with one cited fact. Usually leave empty.",
      close: "A short, warm closing sentence. No request.",
    },
  },
  accept_offer: {
    id: "accept_offer",
    facts: { short: [0, 0], standard: [0, 0] },
    requires: [],
    words: { short: [30, 60], standard: [40, 90] },
    usesJd: false,
    guide: {
      opener: "Thank them for the offer for the role and accept it clearly.",
      evidence: "Leave empty.",
      close: "If the user gave a start date, confirm it; then ask what they need next. Two sentences at most.",
    },
  },
  decline_offer: {
    id: "decline_offer",
    facts: { short: [0, 0], standard: [0, 0] },
    requires: [],
    words: { short: [30, 60], standard: [40, 90] },
    usesJd: false,
    guide: {
      opener: "Thank them for the offer for the role and decline it clearly and kindly.",
      evidence: "Leave empty, unless the user gave a reason: then one sentence with that reason in their terms.",
      close: "One sentence keeping the door open. No apology spiral.",
    },
  },
};
