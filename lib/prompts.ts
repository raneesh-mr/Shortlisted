import "server-only";
import { rawPrompts } from "@/prompts/index.generated";

export interface Prompt {
  id: string;
  version: string;
  body: string;
}

/** Returns /prompts/{id}.md (bundled at build time). The header documents purpose and constraints. */
export function loadPrompt(id: string): Prompt {
  const raw = rawPrompts[id];
  if (!raw) throw new Error(`Unknown prompt ${id}`);
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`Prompt ${id} is missing its header`);
  const version = m[1]!.match(/^version:\s*(.+)$/m)?.[1]?.trim() ?? "unknown";
  return { id, version, body: m[2]!.trim() };
}
