import type { Spelling } from "@/config/regions/schema";
import type { VoiceProfile } from "@/lib/model";

/**
 * Deterministic, on-device style profile from a short writing sample.
 * No LLM: the sample is only measured, never sent anywhere by this function.
 */

const CONTRACTION = /\b\w+'(s|t|re|ve|ll|d|m)\b/gi;
const FORMAL_MARKERS = /\b(furthermore|moreover|therefore|regards|sincerely|kindly|hereby|thus|accordingly)\b/gi;
const CASUAL_MARKERS = /\b(hey|hi|thanks|cheers|cool|yeah|btw|gonna|wanna|lol)\b/gi;

// Pairs of [US form, UK form]. Matching either side is evidence for that variant.
const SPELLING_PAIRS: [RegExp, RegExp][] = [
  [/\b\w+ize[sd]?\b/i, /\b\w+ise[sd]?\b/i],
  [/\bcolor\b/i, /\bcolour\b/i],
  [/\bfavorite\b/i, /\bfavourite\b/i],
  [/\bcenter\b/i, /\bcentre\b/i],
  [/\bbehavior\b/i, /\bbehaviour\b/i],
  [/\blicense\b/i, /\blicence\b/i],
  [/\btraveled\b/i, /\btravelled\b/i],
  [/\bprogram\b/i, /\bprogramme\b/i],
];

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)
    .map((s) => s.trim())
    .filter((s) => s.split(" ").length >= 2);
}

function detectSpelling(text: string, fallback: Spelling | null): Spelling | null {
  let us = 0;
  let uk = 0;
  for (const [usRe, ukRe] of SPELLING_PAIRS) {
    if (usRe.test(text)) us++;
    if (ukRe.test(text)) uk++;
  }
  if (us === uk) return fallback;
  if (us > uk) return fallback === "en-CA" ? "en-CA" : "en-US";
  return fallback && ["en-AU", "en-IN", "en-GB"].includes(fallback) ? fallback : "en-GB";
}

export function buildVoiceProfile(sample: string, regionSpelling: Spelling | null = null): VoiceProfile | null {
  const text = sample.trim();
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 15) return null;
  const sentences = splitSentences(text);
  const lengths = sentences.map((s) => s.split(/\s+/).length);
  const avg = lengths.reduce((a, b) => a + b, 0) / Math.max(lengths.length, 1);
  const variance = lengths.reduce((a, b) => a + (b - avg) ** 2, 0) / Math.max(lengths.length, 1);
  const cv = avg ? Math.sqrt(variance) / avg : 0;
  const contractions = (text.match(CONTRACTION) ?? []).length;
  const formal = (text.match(FORMAL_MARKERS) ?? []).length;
  const casual = (text.match(CASUAL_MARKERS) ?? []).length + contractions * 0.5;

  return {
    avg_sentence_words: Math.round(avg * 10) / 10,
    sentence_length_spread: cv < 0.25 ? "low" : cv < 0.5 ? "medium" : "high",
    formality: formal > casual ? "formal" : casual > formal + 1 ? "casual" : "neutral",
    uses_contractions: contractions > 0,
    spelling: detectSpelling(text, regionSpelling),
    punctuation: {
      exclamations: text.includes("!"),
      dashes: /\s[-–—]\s|—/.test(text),
      semicolons: text.includes(";"),
    },
    sample_words: words.length,
  };
}
