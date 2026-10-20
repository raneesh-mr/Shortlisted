"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useApp } from "@/components/app-provider";
import { RegionBanner } from "@/components/region";
import { Button, Card } from "@/components/ui";
import { newApplication } from "@/lib/email/new-application";

export default function Home() {
  const t = useTranslations("home");
  const router = useRouter();
  const { facts, cvs, applications, saveApplication } = useApp();
  const confirmed = facts.filter((f) => f.confirmed);
  const hasRole = confirmed.some((f) => f.type === "work");
  const hasContact = confirmed.some((f) => f.type === "contact");
  const steps = [
    { done: hasContact && hasRole, label: t("stepFacts"), href: "/cvs/facts" },
    { done: cvs.length > 0, label: t("stepCv"), href: "/cvs" },
    { done: applications.some((a) => a.email_id), label: t("stepEmail"), href: "/apply" },
  ];

  async function startApplication() {
    const app = newApplication(cvs);
    await saveApplication(app);
    router.push(`/apply/compose?id=${app.id}`);
  }

  return (
    <div className="flex flex-col gap-5">
      <RegionBanner />
      <Card className="border-accent">
        <h1 className="text-xl font-semibold">{t("jdTitle")}</h1>
        <p className="mt-1 text-ink-2">{t("jdComing")}</p>
        <Button className="mt-3 w-full" onClick={startApplication} disabled={cvs.length === 0}>
          {t("jdAction")}
        </Button>
        {cvs.length === 0 && <p className="mt-2 text-sm text-ink-2">{t("jdNeedsCv")}</p>}
      </Card>

      <section aria-labelledby="ready">
        <h2 id="ready" className="mb-2 text-lg font-semibold">
          {t("readyTitle")}
        </h2>
        <ol className="flex flex-col gap-2">
          {steps.map((s, i) => (
            <li key={s.href}>
              <Link href={s.href} className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-surface p-3">
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${s.done ? "bg-ok-soft text-ok" : "bg-surface-2"}`}>
                  {s.done ? "✓" : i + 1}
                </span>
                <span className="flex-1">{s.label}</span>
                <span className="text-sm text-ink-2">{s.done ? t("done") : t("todo")}</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {cvs.length > 0 && (
        <section aria-labelledby="recent">
          <h2 id="recent" className="mb-2 text-lg font-semibold">
            {t("recent")}
          </h2>
          <ul className="flex flex-col gap-2">
            {cvs.slice(0, 3).map((cv) => (
              <li key={cv.id}>
                <Link href={`/cvs/edit?id=${cv.id}`} className="block rounded-2xl border border-line bg-surface p-3">
                  <span className="font-medium">{cv.title}</span>
                  <span className="block text-sm text-ink-2">{new Date(cv.updated_at).toLocaleDateString()}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
