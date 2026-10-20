import type { Application } from "@/lib/model";

/** Follow-up reminders at day 7 and day 14 after applying. In-app only; nothing is sent. */
export const REMINDER_DAYS = { day7: 7, day14: 14 } as const;
export type ReminderKey = keyof typeof REMINDER_DAYS;

export interface DueReminder {
  application: Application;
  key: ReminderKey;
  /** YYYY-MM-DD the reminder fell due. */
  due: string;
  overdueDays: number;
}

export function todayIso(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** Reminders that are due today or earlier and haven't been done or dismissed. Only while status is "applied". */
export function dueReminders(apps: Application[], today = todayIso()): DueReminder[] {
  const out: DueReminder[] = [];
  for (const app of apps) {
    if (app.status !== "applied" || !app.applied_at) continue;
    for (const key of Object.keys(REMINDER_DAYS) as ReminderKey[]) {
      if (app.reminders[key] !== "pending") continue;
      const due = addDays(app.applied_at, REMINDER_DAYS[key]);
      if (due <= today) out.push({ application: app, key, due, overdueDays: daysBetween(due, today) });
    }
  }
  // When both are due, only the later one matters: the day-7 nudge was missed.
  const latest = new Map<string, DueReminder>();
  for (const r of out) {
    const prev = latest.get(r.application.id);
    if (!prev || REMINDER_DAYS[r.key] > REMINDER_DAYS[prev.key]) latest.set(r.application.id, r);
  }
  return [...latest.values()].sort((a, b) => a.due.localeCompare(b.due));
}

/** Applying sets the date and the next action (day 7), unless the user already chose one. */
export function onStatusChange(app: Application, status: Application["status"], today = todayIso()): Application {
  const next: Application = { ...app, status };
  if (status === "applied") {
    next.applied_at = app.applied_at ?? today;
    next.next_action_at = app.next_action_at ?? addDays(next.applied_at, REMINDER_DAYS.day7);
  }
  return next;
}

/** Sending a follow-up marks every reminder that has fallen due as done; later ones stay pending. */
export function markFollowUpSent(app: Application, today = todayIso()): Application {
  if (!app.applied_at) return app;
  const reminders = { ...app.reminders };
  for (const key of Object.keys(REMINDER_DAYS) as ReminderKey[]) {
    if (reminders[key] === "pending" && addDays(app.applied_at, REMINDER_DAYS[key]) <= today) reminders[key] = "done";
  }
  return { ...app, reminders };
}
