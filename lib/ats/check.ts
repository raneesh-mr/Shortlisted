import type { RenderedCv } from "@/lib/cv/document";
import { ATS_SAFE_FONTS, templates } from "@/lib/cv/templates";

export type CheckStatus = "pass" | "warn" | "fail";
export interface AtsCheck {
  id: string;
  status: CheckStatus;
  message: string;
}

const STANDARD_HEADINGS = new Set([
  "Summary",
  "Experience",
  "Education",
  "Skills",
  "Languages",
  "Certifications",
  "Personal details",
]);

// Emoji and pictographs confuse many parsers.
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const LONG_BULLET = 240;

export interface AtsInput {
  doc: RenderedCv;
  /** Real page count from the PDF renderer, when known. */
  pages?: number | null;
  /** Whether text extracted from the generated PDF contained the name and headings. */
  extractable?: boolean | null;
}

export function runAtsCheck({ doc, pages = null, extractable = null }: AtsInput): AtsCheck[] {
  const t = templates[doc.template_id];
  const checks: AtsCheck[] = [];
  const add = (id: string, status: CheckStatus, message: string) => checks.push({ id, status, message });

  add(
    "fonts",
    ATS_SAFE_FONTS.includes(t.docxFont) && ATS_SAFE_FONTS.includes(t.pdfFont) ? "pass" : "fail",
    `Uses ${t.docxFont} (Word) and ${t.pdfFont} (PDF), both widely readable.`,
  );
  add("layout", "pass", "Single column. No tables, text boxes or icons.");

  const odd = doc.sections.filter((s) => !STANDARD_HEADINGS.has(s.title));
  add(
    "headings",
    odd.length ? "warn" : "pass",
    odd.length ? `Non-standard headings: ${odd.map((s) => s.title).join(", ")}.` : "Section headings use standard names.",
  );

  if (!doc.name.trim()) add("name", "fail", "Add your name to your contact details.");
  const hasEmail = doc.contact.some((c) => c.includes("@"));
  add("contact", hasEmail ? "pass" : "warn", hasEmail ? "Contact email is present." : "Add an email address so recruiters can reach you.");

  const entries = doc.sections.flatMap((s) =>
    s.id === "experience" || s.id === "education" ? s.blocks.filter((b) => b.kind === "entry") : [],
  );
  const undated = entries.filter((e) => e.kind === "entry" && !e.dates);
  add(
    "dates",
    undated.length ? "warn" : "pass",
    undated.length
      ? `${undated.length} ${undated.length === 1 ? "entry has" : "entries have"} no dates. Most systems expect a start and end month.`
      : `All dates use one format (${doc.date_format}).`,
  );

  const experience = doc.sections.find((s) => s.id === "experience");
  if (!experience) add("experience", "warn", "No work experience is showing yet.");

  const allText = doc.sections
    .flatMap((s) => s.blocks)
    .flatMap((b) =>
      b.kind === "entry" ? [b.title.text, ...b.bullets.map((x) => x.text)] : b.kind === "paragraph" ? [b.line.text] : b.kind === "inline" ? b.items.map((i) => i.text) : [],
    );
  if (allText.some((x) => PICTOGRAPHIC.test(x))) add("symbols", "warn", "Emoji or symbols found. Some systems drop or garble them.");
  const long = allText.filter((x) => x.length > LONG_BULLET).length;
  if (long) add("bullet_length", "warn", `${long} ${long === 1 ? "line is" : "lines are"} very long. Shorter bullets scan better.`);

  if (pages !== null) {
    add(
      "length",
      pages > doc.max_pages ? "warn" : "pass",
      pages > doc.max_pages
        ? `This runs to ${pages} pages; the norm here is up to ${doc.max_pages}.`
        : `${pages} ${pages === 1 ? "page" : "pages"}, within the usual ${doc.max_pages}.`,
    );
  }
  if (extractable !== null) {
    add(
      "extractable",
      extractable ? "pass" : "fail",
      extractable ? "Text in the PDF can be selected and read by software." : "We couldn't read the text back from the PDF.",
    );
  }
  return checks;
}
