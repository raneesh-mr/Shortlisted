import "server-only";
import { NextResponse } from "next/server";
import type { ZodError } from "zod";

/** Typed error codes returned by every API route. The UI maps codes to plain-language messages. */
export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "rate_limited"
  | "too_large"
  | "unsupported_type"
  | "unreadable"
  | "empty"
  | "ai_unavailable"
  | "ai_refused"
  | "ai_invalid"
  | "unsupported_characters"
  | "missing_inputs"
  | "ai_required"
  | "not_configured"
  | "server_error";

export function apiError(code: ApiErrorCode, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: { code, ...extra } }, { status, headers: { "Cache-Control": "no-store" } });
}

export function zodError(err: ZodError) {
  // Only paths, never values: values may be personal data.
  return apiError("bad_request", 400, { fields: err.issues.map((i) => i.path.join(".")).slice(0, 10) });
}

// --- Rate limiting -----------------------------------------------------------
// Two layers:
//  1. Cloudflare rate-limit bindings (wrangler.jsonc): shared across every Worker
//     instance, per-minute windows.
//  2. An in-memory sliding window per instance for longer windows (e.g. per hour).
//     Best effort only, since Workers instances are short-lived. See DECISIONS.md.
const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  }
  return true;
}

export function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

type LimiterName = "LIMIT_IMPORT" | "LIMIT_COMPOSE" | "LIMIT_EXPORT" | "LIMIT_ACCOUNT";
interface RateLimiterBinding {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

/** The shared Cloudflare limiter, or null when running outside Workers (next dev / next start / tests). */
async function binding(name: LimiterName): Promise<RateLimiterBinding | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const env = getCloudflareContext().env as unknown as Record<string, RateLimiterBinding | undefined>;
    return env[name] ?? null;
  } catch {
    return null;
  }
}

export interface LimitRule {
  /** Cloudflare binding for the shared per-minute limit. */
  shared: LimiterName;
  /** Longer per-instance window as a backstop. */
  limit: number;
  windowMs: number;
}

/** Limits by IP and, when signed in, by user id too. */
export async function allow(req: Request, scope: string, userId: string | null, rule: LimitRule): Promise<boolean> {
  const keys = [`${scope}:ip:${clientIp(req)}`, ...(userId ? [`${scope}:user:${userId}`] : [])];
  const local = keys.map((k) => rateLimit(k, rule.limit, rule.windowMs)).every(Boolean);
  if (!local) return false;
  const shared = await binding(rule.shared);
  if (!shared) return true;
  const results = await Promise.all(keys.map((key) => shared.limit({ key })));
  return results.every((r) => r.success);
}
