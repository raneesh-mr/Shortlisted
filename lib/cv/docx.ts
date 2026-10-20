import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
} from "docx";
import { brand } from "@/config/brand";
import type { RenderedCv } from "./document";
import { templates } from "./templates";

// Page sizes and margins in twips (1/20 pt).
const PAPER = { A4: { width: 11906, height: 16838 }, Letter: { width: 12240, height: 15840 } } as const;
const MARGIN = 1000;
const halfPts = (pt: number) => Math.round(pt * 2);

export async function renderDocx(doc: RenderedCv): Promise<Uint8Array> {
  const t = templates[doc.template_id];
  const size = PAPER[doc.paper];
  const contentWidth = size.width - MARGIN * 2;
  const accent = t.accent.replace("#", "");
  const center = t.centerHeader && !doc.photo;
  const children: Paragraph[] = [];

  if (doc.photo) {
    const [meta, base64 = ""] = doc.photo.split(",");
    children.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new ImageRun({
            type: meta?.includes("png") ? "png" : "jpg",
            data: Buffer.from(base64, "base64"),
            transformation: { width: 96, height: 120 },
            altText: { name: "Photo", description: `Photo of ${doc.name}`, title: "Photo" },
          }),
        ],
      }),
    );
  }

  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
      children: [new TextRun({ text: doc.name, bold: true, size: halfPts(t.sizes.name) })],
    }),
  );
  if (doc.headline) {
    children.push(
      new Paragraph({
        alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [new TextRun({ text: doc.headline, size: halfPts(t.sizes.headline), color: "444444" })],
      }),
    );
  }
  if (doc.contact.length) {
    children.push(
      new Paragraph({
        alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [new TextRun({ text: doc.contact.join("  |  "), size: halfPts(t.sizes.small), color: "444444" })],
      }),
    );
  }

  for (const section of doc.sections) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: t.sectionGap * 20, after: 60 },
        border: t.headingRule
          ? { bottom: { style: BorderStyle.SINGLE, size: 4, color: "777777", space: 2 } }
          : undefined,
        children: [
          new TextRun({
            text: t.headingUppercase ? section.title.toUpperCase() : section.title,
            bold: true,
            size: halfPts(t.sizes.heading),
            color: accent,
          }),
        ],
      }),
    );
    for (const block of section.blocks) {
      if (block.kind === "paragraph") children.push(new Paragraph({ children: [new TextRun(block.line.text)] }));
      if (block.kind === "inline") {
        children.push(new Paragraph({ children: [new TextRun(block.items.map((i) => i.text).join(", "))] }));
      }
      if (block.kind === "pairs") {
        for (const p of block.items) {
          children.push(new Paragraph({ children: [new TextRun({ text: `${p.label}: `, bold: true }), new TextRun(p.value)] }));
        }
      }
      if (block.kind === "entry") {
        children.push(
          new Paragraph({
            keepNext: true,
            spacing: { before: 80 },
            tabStops: [{ type: TabStopType.RIGHT, position: contentWidth }],
            children: [
              new TextRun({ text: block.title.text, bold: true }),
              ...(block.dates ? [new TextRun({ text: `\t${block.dates}`, color: "444444", size: halfPts(t.sizes.small) })] : []),
            ],
          }),
        );
        if (block.subtitle) {
          children.push(new Paragraph({ keepNext: block.bullets.length > 0, children: [new TextRun({ text: block.subtitle, italics: true, color: "444444" })] }));
        }
        for (const b of block.bullets) children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun(b.text)] }));
      }
    }
  }

  if (doc.footer) {
    children.push(new Paragraph({ spacing: { before: 240 }, children: [new TextRun({ text: doc.footer, color: "444444" })] }));
  }

  const document = new Document({
    creator: brand.name,
    title: `${doc.name} ${doc.document_name}`.trim(),
    styles: {
      default: {
        document: { run: { font: t.docxFont, size: halfPts(t.sizes.body), color: "111111" } },
        title: { run: { font: t.docxFont, color: "111111" } },
        heading1: { run: { font: t.docxFont, color: accent } },
      },
    },
    sections: [
      {
        properties: {
          page: { size, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(document);
  return new Uint8Array(buffer);
}
