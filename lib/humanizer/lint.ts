import { bannedPhrases, buzzwords, evaluativeAdjectives, loneClosingPhrases } from "./banned";

/**
 * Deterministic "does this read like a person wrote it" lint. No LLM.
 * Findings carry character offsets so the UI can highlight them; flags are
 * always shown to the user, never hidden.
 */

export type Severity = "error" | "warn";
export type LintRule =
  | "banned_phrase"
  | "lone_closing"
  | "repeated_openers"
  | "uniform_length"
  | "bullet_parallelism"
  | "em_dash"
  | "exclamation"
  | "buzzwords"
  | "not_just_but"
  | "rhetorical_question"
  | "triple_adjectives"
  | "unsupported_number"
  | "unsupported_adjective"
  | "unsupported_name";

export interface LintFinding {
  rule: LintRule;
  severity: Severity;
  start: number;
  end: number;
  /** The flagged text, for display. */
  text: string;
  hint?: string;
}

export interface LintReport {
  score: number;
  passed: boolean;
  findings: LintFinding[];
  stats: { words: number; sentences: number; em_dashes: number; exclamations: number };
}

export interface LintOptions {
  /**
   * Everything the user wrote or confirmed (facts, inputs, voice sample).
   * Numbers, names and praise words must come from here.
   */
  source?: string;
  /** The user's own writing uses exclamation marks, so allow one. */
  allowExclamation?: boolean;
}

interface Sentence {
  text: string;
  start: number;
  end: number;
  words: string[];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

export function splitSentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  // Line breaks and terminal punctuation both end a sentence; greetings and sign-offs sit on their own lines.
  const re = /[^.!?\n]+(?:[.!?]+|$)/gm;
  for (const m of text.matchAll(re)) {
    const raw = m[0];
    const lead = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const start = m.index! + lead;
    out.push({ text: trimmed, start, end: start + trimmed.length, words: trimmed.match(WORD) ?? [] });
  }
  return out;
}

const COMMON_CAPITALISED = new Set(
  (
    "I I'm I've I'd I'll Hi Hello Dear Thanks Thank Best Kind Regards Warm Many Yours Sincerely Cheers CV Resume OK " +
    "Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August " +
    "September October November December Mr Mrs Ms Mx Dr"
  ).split(" "),
);

function contains(source: string, needle: string): boolean {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(needle)}(?![\\p{L}\\p{N}])`, "iu").test(source);
}

export function lintText(text: string, opts: LintOptions = {}): LintReport {
  const findings: LintFinding[] = [];
  const add = (rule: LintRule, severity: Severity, start: number, end: number, hint?: string) =>
    findings.push({ rule, severity, start, end, text: text.slice(start, end), hint });
  const source = opts.source ?? "";
  const sentences = splitSentences(text);
  const words = text.match(WORD) ?? [];

  // Banned phrases.
  for (const b of bannedPhrases) {
    if (b.allowIfUserSaid && source && contains(source, b.phrase)) continue;
    const re = new RegExp(`(?<![\\p{L}])${escapeRe(b.phrase).replace(/'/g, "['’]")}(?![\\p{L}])`, "giu");
    for (const m of text.matchAll(re)) add("banned_phrase", "error", m.index!, m.index! + m[0].length, b.hint);
  }

  // "Please find attached my CV." as a sentence on its own.
  for (const s of sentences) {
    const bare = s.text.replace(/[.!]+$/, "").trim().toLowerCase();
    if (loneClosingPhrases.some((p) => bare === p.toLowerCase() || bare === `${p.toLowerCase()} for your consideration`)) {
      add("lone_closing", "error", s.start, s.end, "Say something useful with it, or drop it and just attach the file.");
    }
  }

  // Same first word three or more sentences in a row.
  const body = sentences.filter((s) => s.words.length >= 4);
  for (let i = 2; i < body.length; i++) {
    const w = (k: number) => body[k]!.words[0]!.toLowerCase();
    if (w(i) === w(i - 1) && w(i) === w(i - 2)) add("repeated_openers", "warn", body[i]!.start, body[i]!.start + body[i]!.words[0]!.length, "Vary how these sentences start.");
  }

  // Every sentence about the same length reads as generated.
  if (body.length >= 4) {
    const lens = body.map((s) => s.words.length);
    const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
    const sd = Math.sqrt(lens.reduce((a, b) => a + (b - avg) ** 2, 0) / lens.length);
    if (avg > 0 && sd / avg < 0.2) add("uniform_length", "warn", body[0]!.start, body[body.length - 1]!.end, "Mix in a shorter or longer sentence.");
  }

  // At most one em dash per document.
  const dashes = [...text.matchAll(/—/g)];
  dashes.slice(1).forEach((m) => add("em_dash", "warn", m.index!, m.index! + 1, "Use a comma or a full stop."));

  // Exclamation marks.
  const bangs = [...text.matchAll(/!/g)];
  bangs.slice(opts.allowExclamation ? 1 : 0).forEach((m) => add("exclamation", "warn", m.index!, m.index! + 1, "A full stop reads calmer."));

  // Buzzword density.
  const buzzHits: [number, number][] = [];
  for (const b of buzzwords) {
    for (const m of text.matchAll(new RegExp(`(?<![\\p{L}])${escapeRe(b)}(?![\\p{L}])`, "giu"))) buzzHits.push([m.index!, m.index! + m[0].length]);
  }
  if (buzzHits.length >= 3 || (buzzHits.length >= 2 && buzzHits.length / Math.max(words.length, 1) > 0.02)) {
    for (const [s, e] of buzzHits) add("buzzwords", "warn", s, e, "Say what you actually did.");
  }

  // "not just X, but Y"
  for (const m of text.matchAll(/\bnot (?:just|only|merely|simply) [^.!?\n]{1,80}?,? but\b/gi)) {
    add("not_just_but", "warn", m.index!, m.index! + m[0].length, "State the point directly.");
  }

  // Rhetorical questions.
  for (const s of sentences) {
    if (s.text.endsWith("?") && /^(what if|have you ever|why not|who doesn'?t|isn'?t it|ever wondered|looking for|want to|imagine)\b/i.test(s.text)) {
      add("rhetorical_question", "warn", s.start, s.end, "Make it a plain statement.");
    }
  }

  // Three stacked adjectives: "creative, reliable and motivated".
  const adjLike = (w: string) => evaluativeAdjectives.includes(w.toLowerCase()) || buzzwords.includes(w.toLowerCase()) || /(ive|ful|ous|ic|able|ible|ent|ant|ed)$/i.test(w);
  for (const m of text.matchAll(/\b([\p{L}-]+), ([\p{L}-]+),? and ([\p{L}-]+)\b/gu)) {
    if ([m[1]!, m[2]!, m[3]!].every(adjLike)) add("triple_adjectives", "warn", m.index!, m.index! + m[0].length, "Keep the one that matters most.");
  }

  // Claims must come from the user's own facts and inputs.
  if (source) {
    for (const m of text.matchAll(/\d[\d,.]*\d%?|\d%?/g)) {
      const raw = m[0].replace(/[.,]$/, "");
      const bare = raw.replace(/,/g, "");
      if (!contains(source, raw) && !contains(source.replace(/(\d),(\d)/g, "$1$2"), bare)) {
        add("unsupported_number", "error", m.index!, m.index! + raw.length, "This number isn't in your facts. Remove it or add it to your facts.");
      }
    }
    for (const adj of evaluativeAdjectives) {
      if (contains(source, adj)) continue;
      for (const m of text.matchAll(new RegExp(`(?<![\\p{L}])${escapeRe(adj)}(?![\\p{L}])`, "giu"))) {
        add("unsupported_adjective", "warn", m.index!, m.index! + m[0].length, "You didn't describe it this way. Let the fact speak.");
      }
    }
    for (const s of sentences) {
      for (const m of s.text.matchAll(/(?<=[\p{L}\p{N},;:)] )\p{Lu}[\p{L}'’&.-]*/gu)) {
        const word = m[0].replace(/[.'’]+$/, "");
        if (COMMON_CAPITALISED.has(word) || contains(source, word)) continue;
        const start = s.start + m.index!;
        add("unsupported_name", "warn", start, start + word.length, "This name isn't in your facts or the details you gave.");
      }
    }
  }

  findings.sort((a, b) => a.start - b.start);
  const penalty = (rule: LintRule) => findings.filter((f) => f.rule === rule).slice(0, 3).reduce((p, f) => p + (f.severity === "error" ? 20 : 7), 0);
  const rules = [...new Set(findings.map((f) => f.rule))];
  const score = Math.max(0, 100 - rules.reduce((p, r) => p + penalty(r), 0));
  return {
    score,
    passed: score >= 70 && !findings.some((f) => f.severity === "error"),
    findings,
    stats: { words: words.length, sentences: sentences.length, em_dashes: dashes.length, exclamations: bangs.length },
  };
}

/** For bullet lists (CV, or a list inside an email): every bullet "-ed verb … %" reads as templated. */
export function lintBullets(bullets: string[]): LintFinding[] {
  const clean = bullets.map((b) => b.trim()).filter(Boolean);
  if (clean.length < 3) return [];
  const templated = clean.every((b) => /^[\p{L}]+ed\b/iu.test(b) && /%[.)]?$/.test(b));
  return templated
    ? [{ rule: "bullet_parallelism", severity: "warn", start: 0, end: 0, text: clean.join(" / "), hint: "Not every line needs a past-tense verb and a percentage." }]
    : [];
}
