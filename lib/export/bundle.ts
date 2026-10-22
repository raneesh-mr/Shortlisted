import "server-only";
import JSZip from "jszip";
import { brand } from "@/config/brand";
import { buildCvDocument } from "@/lib/cv/document";
import { renderDocx } from "@/lib/cv/docx";
import type { DataBundle } from "@/lib/repo/types";

/** Builds the "Export my data" ZIP: everything as JSON, plus each CV as an editable DOCX. */
/**
 * `paidCvIds`: Word files are included only for CVs the person paid for. Every
 * CV is always in data.json (that is their data); the formatted file is the
 * paid product.
 */
export async function buildExportZip(bundle: DataBundle & Record<string, unknown>, paidCvIds: Set<string> = new Set()): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "README.txt",
    [
      `Your ${brand.name} data export.`,
      "",
      "data.json  - everything stored about you: profile, facts, CVs, versions, consents.",
      "cvs/       - each CV you paid for, as a Word document you can open and edit.",
      "",
      `Exported ${new Date().toISOString()}.`,
    ].join("\n"),
  );
  zip.file("data.json", JSON.stringify(bundle, null, 2));
  const used = new Set<string>();
  for (const cv of bundle.cvs.filter((c) => paidCvIds.has(c.id))) {
    const doc = buildCvDocument(cv, bundle.facts);
    let name = cv.title.replace(/[^\p{L}\p{N} ._-]/gu, "").trim().slice(0, 60) || "cv";
    while (used.has(name)) name += "_";
    used.add(name);
    zip.file(`cvs/${name}.docx`, await renderDocx(doc));
  }
  return zip.generateAsync({ type: "uint8array" });
}
