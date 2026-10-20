import { features } from "@/config/features";

/**
 * Privacy-safe analytics seam (Phase 5). Events are fixed names with no free
 * text, so CV content, names or job text can't leak in by accident. It's a
 * no-op until an aggregated, cookie-less provider is chosen and reviewed.
 */
export type AnalyticsEvent =
  | { name: "cv_created" }
  | { name: "cv_exported"; format: "pdf" | "docx" }
  | { name: "cv_imported"; method: "ai" | "basic" }
  | { name: "application_created" }
  | { name: "cv_tailored"; method: "ai" | "basic" }
  | { name: "email_composed"; method: "ai" | "basic" }
  | { name: "follow_up_marked" };

export function track(event: AnalyticsEvent): void {
  if (!features.analytics) return;
  // Send `event` only: no user id, no URL with query strings, no content.
  void event;
}
