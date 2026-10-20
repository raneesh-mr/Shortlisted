/**
 * Sets aside job-description boilerplate (equal-opportunity statements, benefits,
 * "about us" marketing, legal notices) so analysis focuses on the job. Nothing
 * is deleted: the removed blocks are returned so the UI can show them.
 */

const EEO =
  /\b(equal (employment )?opportunit|regardless of (race|age|gender|sex|religion)|without regard to|reasonable (adjustment|accommodation)|we (celebrate|value) diversity|diverse and inclusive|protected (veteran|characteristic|status)|e-?verify|privacy (notice|policy)|data protection notice|recruitment fraud|we do not accept (unsolicited|agency))/i;

const BENEFIT_HEADING = /^(benefits|perks|what we offer|what'?s in it for you|why (join|work for) us|our offer|compensation (and|&) benefits|rewards)\b/i;
const ANY_HEADING = /^[A-Z][^.!?]{1,60}:?$/;

export interface Split {
  /** Text used for analysis. */
  core: string;
  /** Blocks set aside, in original order. */
  removed: string[];
}

export function splitBoilerplate(jd: string): Split {
  const paragraphs = jd.replace(/\r\n?/g, "\n").split(/\n\s*\n/);
  const core: string[] = [];
  const removed: string[] = [];
  let inBenefits = false;

  for (const para of paragraphs) {
    const lines = para.split("\n");
    const first = lines[0]?.trim() ?? "";
    const isHeading = ANY_HEADING.test(first) && first.split(/\s+/).length <= 6;

    if (isHeading && BENEFIT_HEADING.test(first.replace(/:$/, ""))) inBenefits = true;
    else if (isHeading) inBenefits = false;

    if (inBenefits || EEO.test(para)) {
      if (para.trim()) removed.push(para.trim());
      continue;
    }
    core.push(para);
  }
  return { core: core.join("\n\n").trim(), removed };
}
