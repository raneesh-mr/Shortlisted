import { extractText, getDocumentProxy } from "unpdf";
import { describe, expect, it } from "vitest";
import { buildCvDocument } from "@/lib/cv/document";
import { renderDocx } from "@/lib/cv/docx";
import { PdfCharsetError, renderPdf } from "@/lib/cv/pdf";
import { makeFact } from "@/lib/model";
import { cvFor, sampleFacts } from "./fixtures";

describe("PDF export", () => {
  it("produces a text-selectable PDF on the region's paper size", async () => {
    const doc = buildCvDocument(cvFor("US"), sampleFacts());
    const { bytes, pages } = await renderPdf(doc);
    expect(pages).toBe(1);
    const pdf = await getDocumentProxy(bytes.slice());
    const page = await pdf.getPage(1);
    const [, , w, h] = page.view;
    expect(Math.round(w!)).toBe(612);
    expect(Math.round(h!)).toBe(792);
    const { text } = await extractText(pdf, { mergePages: true });
    expect(text).toContain("Amira Haddad");
    expect(text).toContain("Cut reactive maintenance calls by 18% in 12 months");
  });

  it("flows long CVs onto more pages", async () => {
    const facts = sampleFacts();
    const work = facts.find((f) => f.type === "work")!;
    for (let i = 0; i < 80; i++) {
      facts.push(makeFact("achievement", { work_id: work.id, kind: "responsibility", text: `Handled maintenance request batch number ${i} for the residential towers portfolio` }));
    }
    const { pages } = await renderPdf(buildCvDocument(cvFor("GB"), facts));
    expect(pages).toBeGreaterThan(1);
  });

  it("refuses characters the standard fonts can't draw instead of dropping them", async () => {
    const facts = [makeFact("contact", { full_name: "राहुल शर्मा", links: [] })];
    await expect(renderPdf(buildCvDocument(cvFor("IN"), facts))).rejects.toBeInstanceOf(PdfCharsetError);
  });
});

describe("DOCX export", () => {
  it("produces a valid .docx (zip) containing the CV text", async () => {
    const bytes = await renderDocx(buildCvDocument(cvFor("AE"), sampleFacts()));
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe("PK");
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("Amira Haddad");
    expect(xml).toContain("Jordanian");
  });

  it("keeps non-Latin scripts in Word files", async () => {
    const facts = [makeFact("contact", { full_name: "राहुल शर्मा", links: [] })];
    const zip = await (await import("jszip")).default.loadAsync(await renderDocx(buildCvDocument(cvFor("IN"), facts)));
    expect(await zip.file("word/document.xml")!.async("string")).toContain("राहुल शर्मा");
  });
});
