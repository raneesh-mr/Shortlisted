import { z } from "zod";
import { jdAnalysisSchema, matchResultSchema } from "@/lib/jd/schema";
import { cvSchema, factSchema } from "@/lib/model";

export const tailorRequestSchema = z.object({
  mode: z.enum(["ai", "basic"]),
  jd_text: z.string().max(30_000).default(""),
  cv: cvSchema.pick({ region_id: true, template_id: true, content: true }),
  facts: z.array(factSchema).max(600),
  analysis: jdAnalysisSchema,
  match: matchResultSchema,
});

export const analyzeRequestSchema = z.object({
  mode: z.enum(["ai", "basic"]),
  jd_text: z.string().trim().min(1).max(30_000),
  title: z.string().trim().max(160).default(""),
  company: z.string().trim().max(160).default(""),
});

export const matchRequestSchema = z.object({
  mode: z.enum(["ai", "basic"]),
  analysis: jdAnalysisSchema,
  facts: z.array(factSchema).max(600),
  /** Requirement keys the user said they haven't done. */
  not_done: z.array(z.string().max(200)).max(200).default([]),
});
