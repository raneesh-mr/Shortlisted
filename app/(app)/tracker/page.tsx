"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useApp } from "@/components/app-provider";
import { PostingCheck } from "@/components/posting-check";
import { Sheet } from "@/components/sheet";
import { ApplicationSheet } from "@/components/tracker/application-sheet";
import { DueReminders } from "@/components/tracker/due-reminders";
import { Button, Card, PageHeader, TextArea, TextInput, cx } from "@/components/ui";
import { applicationStatuses, type ApplicationStatus } from "@/lib/model";
import { dueReminders } from "@/lib/tracker/reminders";

export default function Tracker() {
  const t = useTranslations("tracker");
  const ts = useTranslations("apply.status");
  const { applications, cvs, saveApplication, deleteApplication } = useApp();
  const [active, setActive] = useState<ApplicationStatus>("saved");
  const [openId, setOpenId] = useState<string | null>(null);
  const [posting, setPosting] = useState("");
  const [recruiter, setRecruiter] = useState("");
  const [postingCompany, setPostingCompany] = useState("");
  const board = useRef<HTMLDivElement>(null);
  const dueIds = new Set(dueReminders(applications).map((r) => r.application.id));
  const open = applications.find((a) => a.id === openId) ?? null;

  const byStatus = (s: ApplicationStatus) =>
    applications
      .filter((a) => a.status === s)
      .sort((a, b) => (a.next_action_at ?? "9999").localeCompare(b.next_action_at ?? "9999") || b.updated_at.localeCompare(a.updated_at));

  // Swipe between columns on phones; the tabs follow the scroll position.
  function goTo(s: ApplicationStatus) {
    setActive(s);
    board.current?.querySelector<HTMLElement>(`[data-col="${s}"]`)?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  }
  function onScroll() {
    const el = board.current;
    if (!el) return;
    const col = Math.round(el.scrollLeft / Math.max(el.clientWidth * 0.86, 1));
    const s = applicationStatuses[Math.min(Math.max(col, 0), applicationStatuses.length - 1)]!;
    if (s !== active) setActive(s);
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <DueReminders />

      {applications.length === 0 ? (
        <Card>
          <p className="font-semibold">{t("emptyTitle")}</p>
          <p className="mt-1 text-ink-2">{t("emptyBody")}</p>
        </Card>
      ) : (
        <section aria-label={t("boardLabel")} className="flex flex-col gap-3">
          <div role="tablist" aria-label={t("stages")} className="flex gap-1 overflow-x-auto md:hidden">
            {applicationStatuses.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={active === s}
                onClick={() => goTo(s)}
                className={cx("min-h-11 shrink-0 rounded-full border px-3 text-sm", active === s ? "border-accent bg-accent-soft font-semibold" : "border-line text-ink-2")}
              >
                {ts(s)} ({byStatus(s).length})
              </button>
            ))}
          </div>
          <div ref={board} onScroll={onScroll} className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-5 md:overflow-visible md:px-0">
            {applicationStatuses.map((s) => {
              const list = byStatus(s);
              return (
                <div key={s} data-col={s} className="w-[86%] shrink-0 snap-start rounded-2xl bg-surface-2 p-2 md:w-auto">
                  <h2 className="px-1 py-2 text-sm font-semibold">
                    {ts(s)} <span className="text-ink-2">({list.length})</span>
                  </h2>
                  {list.length === 0 && <p className="px-1 pb-2 text-sm text-ink-2">{t("columnEmpty")}</p>}
                  <ul className="flex flex-col gap-2">
                    {list.map((a) => (
                      <li key={a.id}>
                        <button type="button" onClick={() => setOpenId(a.id)} className="w-full rounded-xl border border-line bg-surface p-3 text-start">
                          <p className="font-medium">{a.role || t("untitled")}</p>
                          {a.company && <p className="text-sm text-ink-2">{a.company}</p>}
                          <p className="mt-1 text-xs text-ink-2">
                            {a.applied_at ? t("appliedShort", { date: a.applied_at }) : t("updatedShort", { date: a.updated_at.slice(0, 10) })}
                            {a.next_action_at ? ` · ${t("nextShort", { date: a.next_action_at })}` : ""}
                          </p>
                          {dueIds.has(a.id) && <p className="mt-1 inline-block rounded bg-accent-soft px-1.5 py-0.5 text-xs font-semibold">{t("followUpDue")}</p>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section aria-labelledby="check-title" className="flex flex-col gap-3">
        <h2 id="check-title" className="text-lg font-semibold">
          {t("checkTitle")}
        </h2>
        <p className="text-sm text-ink-2">{t("checkLead")}</p>
        <TextArea label={t("postingLabel")} rows={6} value={posting} onChange={(e) => setPosting(e.target.value)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label={t("postingCompany")} value={postingCompany} onChange={(e) => setPostingCompany(e.target.value)} />
          <TextInput label={t("recruiterEmail")} type="email" value={recruiter} onChange={(e) => setRecruiter(e.target.value)} />
        </div>
        {posting.trim().length > 20 && <PostingCheck text={posting} company={postingCompany} recruiterEmail={recruiter} />}
      </section>

      <Sheet open={open !== null} onClose={() => setOpenId(null)} title={open ? open.role || t("untitled") : ""}>
        {open && (
          <ApplicationSheet
            key={open.id}
            app={open}
            cvs={cvs}
            onSave={saveApplication}
            onDelete={async () => {
              await deleteApplication(open.id);
              setOpenId(null);
            }}
          />
        )}
      </Sheet>
      {applications.length > 0 && (
        <p className="text-sm text-ink-2">
          {t("remindersNote")}{" "}
          <Button variant="ghost" className="min-h-0 p-0 text-sm underline" onClick={() => goTo("applied")}>
            {t("seeApplied")}
          </Button>
        </p>
      )}
    </div>
  );
}
