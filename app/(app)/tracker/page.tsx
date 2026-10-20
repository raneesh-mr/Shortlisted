"use client";

import { useTranslations } from "next-intl";
import { Card, PageHeader } from "@/components/ui";

/** Kanban tracker arrives in Phase 4. */
export default function Tracker() {
  const t = useTranslations("tracker");
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <Card>
        <p className="font-semibold">{t("comingTitle")}</p>
        <p className="mt-1 text-ink-2">{t("comingBody")}</p>
      </Card>
    </div>
  );
}
