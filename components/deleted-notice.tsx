"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Notice } from "./ui";

export function DeletedNotice() {
  const t = useTranslations("landing");
  if (useSearchParams().get("deleted") !== "1") return null;
  return (
    <div className="mb-6">
      <Notice tone="ok">{t("deleted")}</Notice>
    </div>
  );
}
