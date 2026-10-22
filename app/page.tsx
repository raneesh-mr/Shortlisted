import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { DeletedNotice } from "@/components/deleted-notice";
import { QuickHeader } from "@/components/quick/header";
import { QuickStart } from "@/components/quick/start";

/** The front door is the product: your CV + a job → a tailored CV. */
export default function Start() {
  const t = useTranslations("landing");
  return (
    <>
      <QuickHeader />
      <main id="main" className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-10 pt-4">
        <Suspense>
          <DeletedNotice />
        </Suspense>
        <QuickStart />
        <footer className="mt-auto pt-10 text-center text-sm text-ink-2">
          <a className="underline" href="/privacy">
            {t("privacy")}
          </a>
        </footer>
      </main>
    </>
  );
}
