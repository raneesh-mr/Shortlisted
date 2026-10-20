"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { brand } from "@/config/brand";
import { downloadBlob, safeFilename } from "@/lib/client-api";
import { applicationStatuses, nowIso, type Application, type ApplicationStatus, type Cv } from "@/lib/model";
import { followUpIcs } from "@/lib/tracker/ics";
import { onStatusChange } from "@/lib/tracker/reminders";
import { Button, Notice, TextArea, TextInput, cx } from "../ui";

/** Details for one application, in the bottom sheet. Every change saves automatically. */
export function ApplicationSheet({
  app,
  cvs,
  onSave,
  onDelete,
}: {
  app: Application;
  cvs: Cv[];
  onSave: (a: Application) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const t = useTranslations("tracker");
  const ts = useTranslations("apply.status");
  const [draft, setDraft] = useState(app);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const first = useRef(true);
  // Latest unsaved draft, so closing the sheet mid-debounce still saves.
  const pending = useRef<Application | null>(null);
  const saveRef = useRef(onSave);
  useEffect(() => {
    saveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    pending.current = draft;
    const h = setTimeout(() => {
      pending.current = null;
      void saveRef.current({ ...draft, updated_at: nowIso() });
    }, 400);
    return () => clearTimeout(h);
  }, [draft]);

  useEffect(
    () => () => {
      if (pending.current) void saveRef.current({ ...pending.current, updated_at: nowIso() });
    },
    [],
  );

  const set = (patch: Partial<Application>) => setDraft((d) => ({ ...d, ...patch }));
  const cv = cvs.find((c) => c.id === draft.cv_id);

  return (
    <div className="flex flex-col gap-4">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{t("stage")}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {applicationStatuses.map((s: ApplicationStatus) => (
            <button
              key={s}
              type="button"
              aria-pressed={draft.status === s}
              onClick={() => setDraft((d) => onStatusChange(d, s))}
              className={cx("min-h-12 rounded-xl border text-sm font-medium", draft.status === s ? "border-accent bg-accent-soft" : "border-line bg-surface")}
            >
              {ts(s)}
            </button>
          ))}
        </div>
      </fieldset>

      <TextInput label={t("role")} value={draft.role} maxLength={160} onChange={(e) => set({ role: e.target.value })} />
      <TextInput label={t("company")} value={draft.company} maxLength={160} onChange={(e) => set({ company: e.target.value })} />
      <div className="grid grid-cols-2 gap-3">
        <TextInput label={t("appliedOn")} type="date" value={draft.applied_at ?? ""} onChange={(e) => set({ applied_at: e.target.value || null })} />
        <TextInput label={t("nextAction")} type="date" value={draft.next_action_at ?? ""} onChange={(e) => set({ next_action_at: e.target.value || null })} />
      </div>
      <TextInput label={t("source")} hint={t("sourceHint")} value={draft.compose.source} maxLength={160} onChange={(e) => set({ compose: { ...draft.compose, source: e.target.value } })} />
      <TextArea label={t("notes")} rows={4} maxLength={4000} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />

      <div className="flex flex-col gap-1 text-sm">
        <p>
          <span className="font-medium">{t("cvUsed")}: </span>
          {cv ? (
            <Link href={`/cvs/edit?id=${cv.id}`} className="text-accent underline">
              {cv.title}
            </Link>
          ) : (
            t("none")
          )}
        </p>
        <p>
          <span className="font-medium">{t("emailUsed")}: </span>
          <Link href={`/apply/compose?id=${draft.id}`} className="text-accent underline">
            {draft.email_id ? t("openEmail") : t("writeEmail")}
          </Link>
        </p>
      </div>

      {draft.status === "applied" && draft.applied_at && (
        <div className="flex flex-col gap-2 rounded-xl border border-line p-3">
          <p className="text-sm">{t("reminderInfo")}</p>
          <Button
            variant="secondary"
            onClick={() =>
              downloadBlob(
                new Blob([followUpIcs({ id: draft.id, role: draft.role, company: draft.company, appliedAt: draft.applied_at!, product: brand.name })], { type: "text/calendar" }),
                `${safeFilename(`follow-up ${draft.role || "application"}`)}.ics`,
              )
            }
          >
            {t("addToCalendar")}
          </Button>
          <Link href={`/apply/compose?id=${draft.id}&variant=follow_up`} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-4">
            {t("writeFollowUp")}
          </Link>
        </div>
      )}

      {confirmDelete ? (
        <Notice
          tone="danger"
          title={t("deleteTitle")}
          action={
            <div className="flex gap-2">
              <Button variant="danger" onClick={onDelete}>
                {t("deleteYes")}
              </Button>
              <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                {t("cancel")}
              </Button>
            </div>
          }
        >
          {t("deleteBody")}
        </Notice>
      ) : (
        <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
          {t("delete")}
        </Button>
      )}
    </div>
  );
}
