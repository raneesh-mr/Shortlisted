"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { track } from "@/lib/analytics";
import { nowIso } from "@/lib/model";
import { dueReminders } from "@/lib/tracker/reminders";
import { useApp } from "../app-provider";
import { Button, Card } from "../ui";

/** Follow-ups that are due. In-app only: nothing is sent anywhere. */
export function DueReminders() {
  const t = useTranslations("tracker");
  const { applications, saveApplication } = useApp();
  const due = dueReminders(applications);
  if (!due.length) return null;

  return (
    <section aria-labelledby="due-title">
      <h2 id="due-title" className="mb-2 text-lg font-semibold">
        {t("dueTitle", { count: due.length })}
      </h2>
      <ul className="flex flex-col gap-2">
        {due.map(({ application: a, key, overdueDays }) => (
          <li key={`${a.id}-${key}`}>
            <Card className="border-accent">
              <p className="font-semibold">{[a.role || t("untitled"), a.company].filter(Boolean).join(" · ")}</p>
              <p className="text-sm text-ink-2">
                {t(key === "day7" ? "dueDay7" : "dueDay14")}
                {overdueDays > 0 ? ` ${t("overdue", { count: overdueDays })}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link href={`/apply/compose?id=${a.id}&variant=follow_up`} className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 font-medium text-accent-ink">
                  {t("writeFollowUp")}
                </Link>
                <Button
                  variant="secondary"
                  onClick={() => {
                    track({ name: "follow_up_marked" });
                    void saveApplication({ ...a, reminders: { ...a.reminders, [key]: "done" }, updated_at: nowIso() });
                  }}
                >
                  {t("markDone")}
                </Button>
                <Button variant="ghost" onClick={() => saveApplication({ ...a, reminders: { ...a.reminders, [key]: "dismissed" }, updated_at: nowIso() })}>
                  {t("dismiss")}
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
