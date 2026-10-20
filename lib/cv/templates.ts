import type { TemplateId } from "@/lib/model";

export interface TemplateSpec {
  id: TemplateId;
  label: string;
  description: string;
  /** PDF standard font family (text-selectable, no embedding needed). */
  pdfFont: "Helvetica" | "Times";
  /** Font named in the DOCX file; all are installed on Windows, macOS and Office online. */
  docxFont: "Arial" | "Calibri" | "Times New Roman";
  sizes: { name: number; headline: number; heading: number; body: number; small: number };
  lineGap: number;
  sectionGap: number;
  headingUppercase: boolean;
  headingRule: boolean;
  centerHeader: boolean;
  accent: string;
}

export const templates: Record<TemplateId, TemplateSpec> = {
  classic: {
    id: "classic",
    label: "Classic",
    description: "Serif, centred name, ruled headings. Traditional and formal.",
    pdfFont: "Times",
    docxFont: "Times New Roman",
    sizes: { name: 20, headline: 11, heading: 11.5, body: 10.5, small: 9.5 },
    lineGap: 1.3,
    sectionGap: 12,
    headingUppercase: true,
    headingRule: true,
    centerHeader: true,
    accent: "#111111",
  },
  modern: {
    id: "modern",
    label: "Modern",
    description: "Clean sans-serif, left-aligned, quiet colour on headings.",
    pdfFont: "Helvetica",
    docxFont: "Arial",
    sizes: { name: 19, headline: 10.5, heading: 11, body: 10, small: 9 },
    lineGap: 1.35,
    sectionGap: 12,
    headingUppercase: false,
    headingRule: false,
    centerHeader: false,
    accent: "#1f4d3a",
  },
  compact: {
    id: "compact",
    label: "Compact",
    description: "Tighter spacing to fit more on a page. Good for long histories.",
    pdfFont: "Helvetica",
    docxFont: "Calibri",
    sizes: { name: 16, headline: 9.5, heading: 10, body: 9.5, small: 8.5 },
    lineGap: 1.25,
    sectionGap: 8,
    headingUppercase: true,
    headingRule: true,
    centerHeader: false,
    accent: "#111111",
  },
};

export const ATS_SAFE_FONTS = ["Arial", "Calibri", "Times New Roman", "Helvetica", "Times", "Georgia"];
