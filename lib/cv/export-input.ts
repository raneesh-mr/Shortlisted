import { z } from "zod";
import { cvSchema, factSchema } from "@/lib/model";

export const exportInputSchema = z.object({
  cv: cvSchema.pick({ title: true, region_id: true, template_id: true, content: true }),
  facts: z.array(factSchema).max(600),
  mode: z.enum(["file", "measure"]).default("file"),
});
export type ExportInput = z.input<typeof exportInputSchema>;
