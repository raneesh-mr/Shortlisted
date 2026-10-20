"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { RegionPack } from "@/config/regions/schema";
import { countryCodes, countryName } from "@/lib/geo";
import { regionForCountry } from "@/lib/regions";
import { useApp } from "./app-provider";
import { Notice, Select } from "./ui";

export function CountrySelect({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string | null;
  onChange: (code: string) => void;
}) {
  const t = useTranslations("region");
  const options = useMemo(
    () => countryCodes.map((c) => ({ value: c, label: countryName(c) })).sort((a, b) => a.label.localeCompare(b.label)),
    [],
  );
  return (
    <Select
      label={label}
      hint={hint}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      options={[{ value: "", label: t("chooseCountry") }, ...options]}
    />
  );
}

export function RegionSummary({ pack }: { pack: RegionPack }) {
  const t = useTranslations("region");
  const shows = (v: string) => (v === "common" ? t("usuallyIncluded") : v === "optional" || v === "optional_if_relevant" ? t("optional") : t("usuallyLeftOff"));
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 text-sm">
      <p className="font-semibold">{t("styleTitle", { label: pack.label })}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        <dt className="text-ink-2">{t("documentName")}</dt>
        <dd>{pack.document_name}</dd>
        <dt className="text-ink-2">{t("paper")}</dt>
        <dd>{pack.paper}</dd>
        <dt className="text-ink-2">{t("length")}</dt>
        <dd>{t("upToPages", { count: pack.max_pages })}</dd>
        <dt className="text-ink-2">{t("photo")}</dt>
        <dd>{pack.photo === "avoid" ? t("usuallyLeftOff") : shows(pack.photo)}</dd>
        <dt className="text-ink-2">{t("dob")}</dt>
        <dd>{shows(pack.date_of_birth)}</dd>
        <dt className="text-ink-2">{t("spelling")}</dt>
        <dd>{pack.spelling}</dd>
      </dl>
      {pack.support === "partial" && pack.support_note && (
        <div className="mt-3">
          <Notice tone="warn" title={t("partial")}>
            {pack.support_note}
          </Notice>
        </div>
      )}
      <ul className="mt-3 list-disc ps-5 text-ink-2">
        {pack.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <p className="mt-3 text-ink-2">
        {t("vary")} {t("reviewed", { date: pack.last_reviewed })}
      </p>
    </div>
  );
}

const DISMISS_KEY = "landed_region_banner_dismissed";

/** "Looks like you're in X. CV style set to Y. Change" */
export function RegionBanner() {
  const t = useTranslations("region");
  const { profile, detectedCountry } = useApp();
  const [dismissed, setDismissed] = useState(() => typeof window !== "undefined" && localStorage.getItem(DISMISS_KEY) === "1");
  const country = profile?.target_country ?? profile?.home_country ?? detectedCountry;
  if (dismissed || !country) return null;
  const pack = regionForCountry(country);
  const detected = !profile?.home_country && detectedCountry;
  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-xl bg-accent-soft p-3 text-sm">
      <p>
        {detected ? t("bannerDetected", { country: countryName(country), region: pack.label }) : t("bannerSet", { country: countryName(country), region: pack.label })}{" "}
        <Link href="/me#regions" className="font-semibold underline">
          {t("change")}
        </Link>
      </p>
      <button
        type="button"
        className="-m-2 min-h-11 min-w-11 rounded-lg p-2 text-ink-2"
        aria-label={t("dismiss")}
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, "1");
          setDismissed(true);
        }}
      >
        ✕
      </button>
    </div>
  );
}
