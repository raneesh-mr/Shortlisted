/**
 * Reads the text out of a CV file in the browser. The file itself never
 * leaves the device; only the extracted text is sent to /api/cv/import.
 * Heavy parsers are loaded on demand, so they don't weigh down other screens.
 */

import { MAX_TEXT_CHARS, MAX_UPLOAD_BYTES } from "./limits";

export { MAX_TEXT_CHARS, MAX_UPLOAD_BYTES };

export type ExtractErrorCode = "unsupported_type" | "too_large" | "empty" | "unreadable";

export class ExtractError extends Error {
  constructor(public readonly code: ExtractErrorCode) {
    super(code);
  }
}

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function extractText(file: File): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) throw new ExtractError("too_large");
  const name = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();
  let text = "";
  try {
    if (file.type === "application/pdf" || name.endsWith(".pdf")) {
      const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const out = await pdfText(pdf, { mergePages: false });
      text = out.text.join("\n");
    } else if (file.type === DOCX || name.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      text = (await mammoth.extractRawText({ arrayBuffer: buffer })).value;
    } else if (file.type.startsWith("text/") || name.endsWith(".txt")) {
      text = new TextDecoder().decode(buffer);
    } else {
      throw new ExtractError("unsupported_type");
    }
  } catch (err) {
    if (err instanceof ExtractError) throw err;
    throw new ExtractError("unreadable");
  }
  text = text.replace(/\u0000/g, "").trim();
  if (!text) throw new ExtractError("empty");
  if (text.length > MAX_TEXT_CHARS) throw new ExtractError("too_large");
  return text;
}
