import { lintText } from "@/lib/humanizer/lint";
import { contentStems } from "@/lib/jd/match";
import type { ChangeFlag } from "@/lib/jd/schema";
import { tokens } from "@/lib/import/text";

/**
 * Truth checks for a proposed rewrite. A rewrite may rephrase a fact; it may
 * not add to it.
 *  - New numbers: the change is dropped outright.
 *  - New names, or job-description terms the fact didn't use: flagged so the
 *    user only accepts them if true.
 *  - Humanizer errors (banned phrases and so on): flagged.
 */

const NUM = /\d[\d,.]*\d%?|\d%?/g;
const normNum = (n: string) => n.replace(/[.,]$/, "").replace(/,/g, "");

export function numbersIn(text: string): Set<string> {
  return new Set([...text.matchAll(NUM)].map((m) => normNum(m[0])));
}

const COMMON = new Set(["I", "I'm", "I've", "The", "A", "An", "And", "In", "On", "At", "For", "With", "To", "Of", "By", "Led", "Ran", "Built", "Managed"]);

export interface RewriteCheck {
  drop: boolean;
  flags: ChangeFlag[];
}

export function checkRewrite(opts: { before: string; after: string; context: string; jdText: string }): RewriteCheck {
  const { before, after, context, jdText } = opts;
  const source = `${before}\n${context}`;
  const allowed = numbersIn(source);
  const newNumbers = [...numbersIn(after)].filter((n) => !allowed.has(n));
  if (newNumbers.length) return { drop: true, flags: [] };

  const flags: ChangeFlag[] = [];
  const lowerSource = source.toLowerCase();
  const names = [...after.matchAll(/(?<=[\p{L}\p{N},;:)] )\p{Lu}[\p{L}&.'-]*/gu)].map((m) => m[0].replace(/[.']+$/, ""));
  for (const n of [...new Set(names)]) {
    if (COMMON.has(n) || lowerSource.includes(n.toLowerCase())) continue;
    flags.push({ rule: "new_name", text: n, message: `"${n}" isn't in your fact. Only accept if it's true.` });
  }

  const sourceStems = new Set(contentStems(source));
  const jdStems = new Set(contentStems(jdText));
  const newJdWords = [...new Set(tokens(after))].filter((w) => {
    const [s] = contentStems(w);
    return s && !sourceStems.has(s) && jdStems.has(s);
  });
  if (newJdWords.length) {
    flags.push({
      rule: "new_job_term",
      text: newJdWords.join(", "),
      message: `Uses words from the job that your fact doesn't: ${newJdWords.join(", ")}. Accept only if they describe what you actually did.`,
    });
  }

  for (const f of lintText(after, { source }).findings) {
    if (f.severity !== "error" || f.rule === "unsupported_number") continue;
    flags.push({ rule: "lint", text: f.text, message: f.hint ?? "Reads as generic." });
  }
  return { drop: false, flags };
}
