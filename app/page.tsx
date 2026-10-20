import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { DeletedNotice } from "@/components/deleted-notice";
import { brand } from "@/config/brand";
import { LinkButton } from "@/components/ui";
import { OpenAppRedirect } from "@/components/open-app-redirect";

export default function Landing() {
  const t = useTranslations("landing");
  const points = ["truth", "region", "private"] as const;
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 py-10">
      <OpenAppRedirect />
      <Suspense>
        <DeletedNotice />
      </Suspense>
      <p className="text-lg font-semibold text-accent">{brand.name}</p>
      <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight">{t("title")}</h1>
      <p className="mt-4 text-lg text-ink-2">{t("lead")}</p>
      <div className="mt-8 flex flex-col gap-3">
        <LinkButton href="/welcome" className="w-full">
          {t("start")}
        </LinkButton>
      </div>
      <ul className="mt-10 flex flex-col gap-4">
        {points.map((p) => (
          <li key={p} className="rounded-2xl border border-line bg-surface p-4">
            <p className="font-semibold">{t(`points.${p}.title`)}</p>
            <p className="mt-1 text-ink-2">{t(`points.${p}.body`)}</p>
          </li>
        ))}
      </ul>
      <footer className="mt-auto pt-10 text-sm text-ink-2">
        <a className="underline" href="/privacy">
          {t("privacy")}
        </a>
        <span aria-hidden> · </span>
        {t("free")}
      </footer>
    </main>
  );
}
