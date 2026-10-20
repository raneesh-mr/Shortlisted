import { z } from "zod";
import { factSchema } from "@/lib/model";

export const importResultSchema = z.object({
  method: z.enum(["ai", "basic"]),
  facts: z.array(factSchema),
  summary: z.string().nullable(),
  /** Source lines no fact accounts for. Shown as "needs your attention", never dropped. */
  attention: z.array(z.string()),
  /** Facts whose wording we couldn't find in the source. The user must check them. */
  unverified_fact_ids: z.array(z.string()),
});
export type ImportResult = z.infer<typeof importResultSchema>;

export interface ParsedDraft {
  facts: z.infer<typeof factSchema>[];
  summary: string | null;
  /** Extra notes the parser wants the user to see (e.g. a year with no month). */
  notes: string[];
}
