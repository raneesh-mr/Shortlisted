"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useApp } from "@/components/app-provider";
import { BrandMark } from "@/components/brand-mark";

/** Slim header for the quick flow: brand, then sign in or a way into the full app. */
export function QuickHeader() {
  const t = useTranslations("quick");
  const { status, user } = useApp();
  return (
    <header className="mx-auto flex w-full max-w-lg items-center justify-between px-4 pt-5">
      <BrandMark href="/" />
      {status === "ready" ? (
        <Link href="/cvs" className="text-sm text-ink-2 hover:text-accent-strong">
          {t("myAccount")}
        </Link>
      ) : (
        status === "signed_out" &&
        !user && (
          <Link href="/welcome" className="text-sm text-ink-2 hover:text-accent-strong">
            {t("signIn")}
          </Link>
        )
      )}
    </header>
  );
}
