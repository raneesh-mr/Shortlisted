import { describe, expect, it } from "vitest";
import { newApplication } from "@/lib/email/new-application";
import { applicationSchema } from "@/lib/model";
import { followUpIcs } from "@/lib/tracker/ics";
import { addDays, dueReminders, markFollowUpSent, onStatusChange } from "@/lib/tracker/reminders";
import { checkPosting } from "@/lib/tracker/scam";
import { JD } from "./fixtures";

const found = (text: string, opts?: Parameters<typeof checkPosting>[1]) =>
  checkPosting(text, opts)
    .filter((c) => c.found)
    .map((c) => c.id);

describe("posting checks", () => {
  it("flags nothing on an ordinary posting with a named company", () => {
    expect(found(JD, { company: "Marina Living" })).toEqual([]);
  });

  it("flags payment requests, bank and ID requests, and untraceable payment", () => {
    const text = "Pay a small registration fee of $50 by Western Union. Send your bank account details and a scan of your passport.";
    expect(found(text, { company: "X" })).toEqual(expect.arrayContaining(["asks_payment", "bank_or_id", "untraceable_payment"]));
  });

  it("flags personal-email recruiters, chat-only contact, guarantees and urgency", () => {
    const text = "URGENT HIRING! Guaranteed job, no interview needed. Contact us on WhatsApp or email hr.jobs2026@gmail.com. Limited slots.";
    const ids = found(text, { company: "X" });
    expect(ids).toEqual(expect.arrayContaining(["personal_email", "chat_only", "guarantees", "urgency"]));
    const email = checkPosting(text, { company: "X" }).find((c) => c.id === "personal_email")!;
    expect(email.evidence).toEqual(["hr.jobs2026@gmail.com"]);
  });

  it("flags unrealistic pay and an unnamed company, with evidence snippets", () => {
    const text = "Work from home and earn $500 per day! Our client, a leading company, is hiring.";
    const results = checkPosting(text);
    expect(results.find((c) => c.id === "unrealistic_pay")!.evidence[0]).toContain("earn $500 per day");
    expect(results.find((c) => c.id === "unnamed_company")!.found).toBe(true);
  });

  it("doesn't flag a company email or ordinary words like 'fee' in context", () => {
    expect(found("Send your CV to careers@marinaliving.ae. We pay all visa costs; there is no fee to apply.", { company: "Marina Living" })).toEqual([]);
  });
});

describe("follow-up reminders", () => {
  const base = () => applicationSchema.parse({ ...newApplication([]), role: "FM", company: "Marina" });

  it("applying sets the date and the next action to day 7", () => {
    const app = onStatusChange(base(), "applied", "2026-10-01");
    expect(app).toMatchObject({ status: "applied", applied_at: "2026-10-01", next_action_at: "2026-10-08" });
    // A date the user already set is kept.
    expect(onStatusChange({ ...base(), applied_at: "2026-09-20", next_action_at: "2026-09-30" }, "applied", "2026-10-01")).toMatchObject({ applied_at: "2026-09-20", next_action_at: "2026-09-30" });
  });

  it("is due at day 7, then day 14, and only while applied", () => {
    const app = onStatusChange(base(), "applied", "2026-10-01");
    expect(dueReminders([app], "2026-10-07")).toEqual([]);
    expect(dueReminders([app], "2026-10-08").map((r) => r.key)).toEqual(["day7"]);
    expect(dueReminders([app], "2026-10-20").map((r) => [r.key, r.overdueDays])).toEqual([["day14", 5]]);
    expect(dueReminders([{ ...app, status: "interview" }], "2026-10-20")).toEqual([]);
  });

  it("skips reminders that are done or dismissed", () => {
    const app = onStatusChange(base(), "applied", "2026-10-01");
    expect(dueReminders([{ ...app, reminders: { day7: "done", day14: "pending" } }], "2026-10-10")).toEqual([]);
    expect(dueReminders([{ ...app, reminders: { day7: "done", day14: "dismissed" } }], "2026-10-30")).toEqual([]);
  });

  it("sending a follow-up clears only the reminders that are due", () => {
    const app = onStatusChange(base(), "applied", "2026-10-01");
    expect(markFollowUpSent(app, "2026-10-09").reminders).toEqual({ day7: "done", day14: "pending" });
    expect(markFollowUpSent(app, "2026-10-20").reminders).toEqual({ day7: "done", day14: "done" });
    expect(markFollowUpSent(app, "2026-10-03").reminders).toEqual({ day7: "pending", day14: "pending" });
  });

  it("reads database timestamps as days", () => {
    const parsed = applicationSchema.parse({ ...base(), applied_at: "2026-10-01T00:00:00+00:00", next_action_at: null });
    expect(parsed.applied_at).toBe("2026-10-01");
  });

  it("does date arithmetic across months and leap years", () => {
    expect(addDays("2028-02-25", 7)).toBe("2028-03-03");
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
  });
});

describe("calendar file", () => {
  it("has two all-day events with alarms at day 7 and 14, escaped and folded", () => {
    const ics = followUpIcs({ id: "abc", role: "Facilities Manager, Senior", company: "Marina; Living", appliedAt: "2026-10-01", product: "Shortlisted", stamp: new Date("2026-10-01T10:00:00Z") });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261008");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261015");
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2);
    expect(ics).toContain("Facilities Manager\\, Senior at Marina\\; Living");
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});
