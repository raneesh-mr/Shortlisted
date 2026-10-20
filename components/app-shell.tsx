"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { brand } from "@/config/brand";
import { dueReminders } from "@/lib/tracker/reminders";
import { useApp } from "./app-provider";
import { Notice, Spinner, cx } from "./ui";

const tabs = [
  { href: "/home", key: "home", icon: "M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z" },
  { href: "/cvs", key: "cvs", icon: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" },
  { href: "/apply", key: "apply", icon: "M4 12h12M12 6l6 6-6 6" },
  { href: "/tracker", key: "tracker", icon: "M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v5h-4z" },
  { href: "/me", key: "me", icon: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0" },
] as const;

function BottomNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const { applications } = useApp();
  const due = dueReminders(applications).length;
  return (
    <nav aria-label={t("main")} className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex max-w-xl">
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cx("flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs", active ? "font-semibold text-accent" : "text-ink-2")}
              >
                <svg aria-hidden viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} strokeLinejoin="round" strokeLinecap="round">
                  <path d={tab.icon} />
                </svg>
                <span className="relative">
                  {t(tab.key)}
                  {tab.key === "tracker" && due > 0 && (
                    <span className="absolute -end-4 -top-5 min-w-5 rounded-full bg-accent px-1 text-[10px] font-semibold leading-5 text-accent-ink">
                      <span aria-hidden>{due}</span>
                      <span className="sr-only"> {t("dueBadge", { count: due })}</span>
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations("common");
  const router = useRouter();
  const { status, profile, online, stale, repo } = useApp();

  useEffect(() => {
    if (status === "signed_out") router.replace("/welcome");
    else if (status === "ready" && profile && !profile.onboarded) router.replace("/onboarding");
  }, [status, profile, router]);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-30 focus:rounded-lg focus:bg-surface focus:p-2">
        {t("skipToContent")}
      </a>
      <header className="mx-auto flex w-full max-w-xl items-center justify-between px-4 pt-4">
        <Link href="/home" className="font-semibold text-accent">
          {brand.name}
        </Link>
        {repo?.kind === "guest" && (
          <Link href="/me" className="rounded-full bg-surface-2 px-3 py-1 text-xs text-ink-2">
            {t("guestBadge")}
          </Link>
        )}
      </header>
      <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 pb-28 pt-4">
        {(!online || stale) && (
          <div className="mb-4">
            <Notice tone="warn" title={t("offlineTitle")}>
              {t("offlineBody")}
            </Notice>
          </div>
        )}
        {status === "ready" && profile?.onboarded ? children : <Spinner label={t("loading")} />}
      </main>
      <Suspense>
        <BottomNav />
      </Suspense>
    </div>
  );
}
