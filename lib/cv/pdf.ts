import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { brand } from "@/config/brand";
import type { RenderedCv } from "./document";
import { templates } from "./templates";

const PAPER = { A4: [595.28, 841.89], Letter: [612, 792] } as const;
const MARGIN = 50;

/** Thrown when text uses characters the standard PDF fonts can't draw (e.g. Devanagari, Arabic). */
export class PdfCharsetError extends Error {
  constructor(public readonly chars: string[]) {
    super("unsupported_characters");
  }
}

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function collectText(doc: RenderedCv): string {
  const parts = [doc.name, doc.headline, ...doc.contact, doc.footer ?? ""];
  for (const s of doc.sections) {
    parts.push(s.title);
    for (const b of s.blocks) {
      if (b.kind === "paragraph") parts.push(b.line.text);
      if (b.kind === "inline") parts.push(...b.items.map((i) => i.text));
      if (b.kind === "pairs") parts.push(...b.items.flatMap((p) => [p.label, p.value]));
      if (b.kind === "entry") parts.push(b.title.text, b.subtitle, b.dates, ...b.bullets.map((x) => x.text));
    }
  }
  return parts.join("\n");
}

function unsupportedChars(font: PDFFont, text: string): string[] {
  const bad = new Set<string>();
  for (const ch of new Set(Array.from(text))) {
    if (ch === "\n") continue;
    try {
      font.encodeText(ch);
    } catch {
      bad.add(ch);
    }
  }
  return [...bad];
}

export async function renderPdf(doc: RenderedCv): Promise<{ bytes: Uint8Array; pages: number }> {
  const t = templates[doc.template_id];
  const pdf = await PDFDocument.create();
  const serif = t.pdfFont === "Times";
  const regular = await pdf.embedFont(serif ? StandardFonts.TimesRoman : StandardFonts.Helvetica);
  const bold = await pdf.embedFont(serif ? StandardFonts.TimesRomanBold : StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(serif ? StandardFonts.TimesRomanItalic : StandardFonts.HelveticaOblique);

  const bad = unsupportedChars(regular, collectText(doc));
  if (bad.length) throw new PdfCharsetError(bad);

  pdf.setTitle(`${doc.name} ${doc.document_name}`.trim());
  pdf.setAuthor(doc.name);
  pdf.setCreator(brand.name);
  pdf.setProducer(brand.name);

  const [W, H] = PAPER[doc.paper];
  const contentW = W - MARGIN * 2;
  const accent = hexToRgb(t.accent);
  const ink = rgb(0.07, 0.07, 0.07);
  const muted = rgb(0.3, 0.3, 0.3);
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - MARGIN;

  const lh = (size: number) => size * t.lineGap;
  const ensure = (needed: number) => {
    if (y - needed < MARGIN) {
      page = pdf.addPage([W, H]);
      y = H - MARGIN;
    }
  };
  const wrap = (text: string, font: PDFFont, size: number, width: number): string[] => {
    const lines: string[] = [];
    for (const para of text.split("\n")) {
      let current = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const attempt = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(attempt, size) <= width || !current) current = attempt;
        else {
          lines.push(current);
          current = word;
        }
      }
      lines.push(current);
    }
    return lines;
  };
  const draw = (text: string, opts: { font?: PDFFont; size?: number; x?: number; width?: number; color?: RGB; center?: boolean } = {}) => {
    const font = opts.font ?? regular;
    const size = opts.size ?? t.sizes.body;
    const x = opts.x ?? MARGIN;
    const width = opts.width ?? contentW - (x - MARGIN);
    for (const l of wrap(text, font, size, width)) {
      ensure(lh(size));
      y -= size;
      const lx = opts.center ? MARGIN + (contentW - font.widthOfTextAtSize(l, size)) / 2 : x;
      page.drawText(l, { x: lx, y, size, font, color: opts.color ?? ink });
      y -= lh(size) - size;
    }
  };

  // Header
  let headerWidth = contentW;
  if (doc.photo) {
    const photoW = 72;
    const photoH = 90;
    try {
      const base64 = doc.photo.split(",")[1] ?? "";
      const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
      const img = doc.photo.startsWith("data:image/png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      page.drawImage(img, { x: W - MARGIN - photoW, y: y - photoH, width: photoW, height: photoH });
      headerWidth = contentW - photoW - 12;
    } catch {
      // A broken photo must never block the export; the text CV is what matters.
    }
  }
  const center = t.centerHeader && !doc.photo;
  if (doc.name) draw(doc.name, { font: bold, size: t.sizes.name, width: headerWidth, center });
  if (doc.headline) draw(doc.headline, { size: t.sizes.headline, width: headerWidth, color: muted, center });
  if (doc.contact.length) draw(doc.contact.join("  |  "), { size: t.sizes.small, width: headerWidth, color: muted, center });
  if (doc.photo) y = Math.min(y, H - MARGIN - 96);

  for (const section of doc.sections) {
    y -= t.sectionGap;
    ensure(lh(t.sizes.heading) + lh(t.sizes.body) * 2);
    draw(t.headingUppercase ? section.title.toUpperCase() : section.title, { font: bold, size: t.sizes.heading, color: accent });
    if (t.headingRule) {
      page.drawLine({ start: { x: MARGIN, y: y + 2 }, end: { x: W - MARGIN, y: y + 2 }, thickness: 0.6, color: muted });
      y -= 4;
    } else y -= 2;

    for (const block of section.blocks) {
      if (block.kind === "paragraph") draw(block.line.text);
      if (block.kind === "inline") draw(block.items.map((i) => i.text).join(", "));
      if (block.kind === "pairs") for (const p of block.items) draw(`${p.label}: ${p.value}`);
      if (block.kind === "entry") {
        ensure(lh(t.sizes.body) * 3);
        const datesW = block.dates ? regular.widthOfTextAtSize(block.dates, t.sizes.small) : 0;
        const titleLines = wrap(block.title.text, bold, t.sizes.body, contentW - datesW - 12);
        titleLines.forEach((l, i) => {
          ensure(lh(t.sizes.body));
          y -= t.sizes.body;
          page.drawText(l, { x: MARGIN, y, size: t.sizes.body, font: bold, color: ink });
          if (i === 0 && block.dates) {
            page.drawText(block.dates, { x: W - MARGIN - datesW, y, size: t.sizes.small, font: regular, color: muted });
          }
          y -= lh(t.sizes.body) - t.sizes.body;
        });
        if (block.subtitle) draw(block.subtitle, { font: italic, color: muted });
        for (const b of block.bullets) {
          const indent = 12;
          const lines = wrap(b.text, regular, t.sizes.body, contentW - indent);
          lines.forEach((l, i) => {
            ensure(lh(t.sizes.body));
            y -= t.sizes.body;
            if (i === 0) page.drawText("•", { x: MARGIN + 2, y, size: t.sizes.body, font: regular, color: ink });
            page.drawText(l, { x: MARGIN + indent, y, size: t.sizes.body, font: regular, color: ink });
            y -= lh(t.sizes.body) - t.sizes.body;
          });
        }
        y -= 4;
      }
    }
  }

  if (doc.footer) {
    y -= t.sectionGap;
    draw(doc.footer, { size: t.sizes.small, color: muted });
  }

  const bytes = await pdf.save();
  return { bytes, pages: pdf.getPageCount() };
}
