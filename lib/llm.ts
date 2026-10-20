import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

/**
 * The only place that talks to an LLM provider. Swap the provider here.
 * Never log prompt or response content: they contain personal data.
 */

export type LlmErrorCode = "not_configured" | "refused" | "invalid_output" | "unavailable";

export class LlmError extends Error {
  constructor(public readonly code: LlmErrorCode) {
    super(code);
  }
}

const DEFAULT_MODEL = "claude-opus-5-5";

export function llmConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!llmConfigured()) throw new LlmError("not_configured");
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 90_000 });
  return client;
}

export interface StructuredRequest<S extends z.ZodType> {
  system: string;
  user: string;
  schema: S;
  /**
   * "extract" pulls facts out of text (lower effort, no creativity);
   * "wording" rewrites text (moderate effort). Current Claude models don't
   * accept a temperature parameter, so effort is the control we use.
   */
  task: "extract" | "wording";
  maxTokens?: number;
}

export async function generateStructured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<z.infer<S>> {
  const anthropic = getClient();
  const model = process.env.LLM_MODEL || DEFAULT_MODEL;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await anthropic.beta.messages.parse({
        model,
        max_tokens: req.maxTokens ?? 16000,
        // Server-side fallback: if the model declines for policy reasons, the API retries on a default fallback model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: {
          effort: req.task === "extract" ? "low" : "medium",
          format: betaZodOutputFormat(req.schema),
        },
        system: req.system,
        messages: [{ role: "user", content: req.user }],
      });
      if (response.stop_reason === "refusal") throw new LlmError("refused");
      const parsed = req.schema.safeParse(response.parsed_output);
      if (parsed.success) return parsed.data;
      console.warn("[llm] output failed validation", { attempt, stop_reason: response.stop_reason });
    } catch (err) {
      if (err instanceof LlmError) throw err;
      if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError || err instanceof Anthropic.APIConnectionError) {
        console.warn("[llm] provider unavailable", { name: err.name });
        throw new LlmError("unavailable");
      }
      if (err instanceof Anthropic.APIError) {
        console.warn("[llm] request failed", { status: err.status });
        throw new LlmError("unavailable");
      }
      // Parse failures from the SDK helper land here; retry once.
      console.warn("[llm] could not parse output", { attempt });
    }
  }
  throw new LlmError("invalid_output");
}
