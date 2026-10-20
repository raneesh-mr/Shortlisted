/**
 * Words and phrases that make writing read as machine-made or generic.
 * Edit freely: the lint and the generation prompts both read this list.
 * `allowIfUserSaid` entries are fine when the user's own facts or inputs use them.
 */
export interface BannedEntry {
  phrase: string;
  allowIfUserSaid?: boolean;
  /** Suggested replacement shown to the user. */
  hint?: string;
}

export const bannedPhrases: BannedEntry[] = [
  { phrase: "spearheaded", hint: "led, started" },
  { phrase: "leveraged", hint: "used" },
  { phrase: "leverage", hint: "use" },
  { phrase: "synergy", hint: "say what actually worked together" },
  { phrase: "passionate", hint: "say what you did" },
  { phrase: "dynamic" },
  { phrase: "results-driven" },
  { phrase: "proven track record", hint: "name the result" },
  { phrase: "go-getter" },
  { phrase: "detail-oriented", allowIfUserSaid: true },
  { phrase: "fast-paced environment" },
  { phrase: "think outside the box" },
  { phrase: "cutting-edge" },
  { phrase: "robust" },
  { phrase: "seamless" },
  { phrase: "seamlessly" },
  { phrase: "unlock" },
  { phrase: "elevate" },
  { phrase: "delve" },
  { phrase: "tapestry" },
  { phrase: "I am writing to express my interest", hint: "start with the role and why" },
  { phrase: "I'm writing to express my interest", hint: "start with the role and why" },
  { phrase: "I am excited to apply" },
  { phrase: "I'm excited to apply" },
  { phrase: "Dear Hiring Manager", hint: "use their name, or a simple Hello" },
  { phrase: "I look forward to the opportunity to discuss" },
];

/** A lone closing sentence that's only this is flagged; mentioning the CV inside a fuller close is fine. */
export const loneClosingPhrases = ["Please find attached my CV", "Please find my CV attached", "Please find attached my resume", "Please find my resume attached"];

/** Corporate filler that inflates "buzzword density". */
export const buzzwords = [
  "innovative", "strategic", "holistic", "impactful", "best-in-class", "world-class", "game-changer", "game-changing",
  "stakeholder alignment", "value-add", "paradigm", "ecosystem", "empower", "empowered", "transformative", "streamline",
  "optimize", "optimise", "scalable", "agile", "proactive", "self-starter", "team player", "hard-working", "hardworking",
];

/** Evaluative words that are claims in disguise; flagged unless the user's own words contain them. */
export const evaluativeAdjectives = [
  "excellent", "exceptional", "outstanding", "extensive", "strong", "proven", "deep", "significant", "successful",
  "successfully", "highly", "expert", "seasoned", "skilled", "talented", "dedicated", "motivated", "unique", "remarkable",
  "impressive", "invaluable", "key", "major", "critical", "crucial", "instrumental",
];
