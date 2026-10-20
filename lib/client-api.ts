import type messages from "@/messages/en.json";

/** Client-side fetch helper that turns typed API errors into a code the UI can translate. */
export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    throw new ApiClientError("network");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string } & Record<string, unknown> } | null;
    throw new ApiClientError(body?.error?.code ?? "server_error", body?.error ?? {});
  }
  return res;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(name: string): string {
  return name.replace(/[^\p{L}\p{N} ._-]/gu, "").trim().replace(/\s+/g, "_").slice(0, 80) || "cv";
}

export type ErrorKey = keyof typeof messages.errors;
const knownErrors = new Set<string>([
  "network", "bad_request", "unauthorized", "rate_limited", "too_large", "unsupported_type", "unreadable", "empty",
  "ai_unavailable", "ai_refused", "ai_invalid", "unsupported_characters", "not_configured", "server_error",
  "missing_inputs", "ai_required",
] satisfies ErrorKey[]);

/** Maps any thrown value to a translatable error key. */
export function errorKey(err: unknown): ErrorKey {
  return err instanceof ApiClientError && knownErrors.has(err.code) ? (err.code as ErrorKey) : "server_error";
}
