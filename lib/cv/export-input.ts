import { z } from "zod";
import { cvSchema, factSchema } from "@/lib/model";

/** Page-count check for the builder: renders nothing downloadable, so it needs no payment. */
export const measureInputSchema = z.object({
  mode: z.literal("measure"),
  cv: cvSchema.pick({ title: true, region_id: true, template_id: true, content: true }),
  facts: z.array(factSchema).max(600),
});

/** A real download: the server loads the CV itself and checks it's paid for. */
export const fileInputSchema = z.object({
  mode: z.literal("file"),
  cv_id: z.string().uuid(),
});

export const exportInputSchema = z.discriminatedUnion("mode", [measureInputSchema, fileInputSchema]);
export type ExportInput = z.input<typeof exportInputSchema>;
