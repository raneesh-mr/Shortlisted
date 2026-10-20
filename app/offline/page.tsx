import Link from "next/link";
import { useTranslations } from "next-intl";

export default function Offline() {
  const t = useTranslations("offline");
  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-2 text-ink-2">{t("body")}</p>
      <Link href="/cvs" className="mt-4 inline-block font-semibold text-accent underline">
        {t("action")}
      </Link>
    </main>
  );
}
