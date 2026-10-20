"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useApp } from "@/components/app-provider";
import { Button, Card, Notice, PageHeader } from "@/components/ui";
import { track } from "@/lib/analytics";
import { newApplication } from "@/lib/email/new-application";

export default function Apply() {
  const t = useTranslations("apply");
  const router = useRouter();
  const { applications, cvs, saveApplication, deleteApplication } = useApp();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function start() {
    const app = newApplication(cvs);
    await saveApplication(app);
    track({ name: "application_created" });
    router.push(`/apply/compose?id=${app.id}`);
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <Button onClick={start}>+ {t("new")}</Button>
      {cvs.length === 0 && (
        <Notice tone="warn" action={<Link href="/cvs" className="font-semibold underline">{t("buildCv")}</Link>}>
          {t("noCv")}
        </Notice>
      )}
      <Card>
        <p className="font-semibold">{t("phase2Title")}</p>
        <p className="mt-1 text-sm text-ink-2">{t("phase2Body")}</p>
      </Card>

      <section aria-labelledby="apps">
        <h2 id="apps" className="mb-2 text-lg font-semibold">
          {t("listTitle")}
        </h2>
        {applications.length === 0 ? (
          <p className="text-ink-2">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {applications.map((a) => (
              <li key={a.id}>
                <Card>
                  <Link href={`/apply/compose?id=${a.id}`} className="block">
                    <p className="font-semibold">{a.role || t("untitledRole")}</p>
                    <p className="text-sm text-ink-2">
                      {[a.company, t(`status.${a.status}`), new Date(a.updated_at).toLocaleDateString()].filter(Boolean).join(" · ")}
                    </p>
                    <p className="mt-1 text-sm">{a.email_id ? t("hasEmail") : t("noEmail")}</p>
                  </Link>
                  {confirmDelete === a.id ? (
                    <div className="mt-2 flex gap-2">
                      <Button variant="danger" onClick={() => deleteApplication(a.id).then(() => setConfirmDelete(null))}>
                        {t("deleteYes")}
                      </Button>
                      <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
                        {t("cancel")}
                      </Button>
                    </div>
                  ) : (
                    <Button variant="ghost" className="mt-1 text-sm" onClick={() => setConfirmDelete(a.id)}>
                      {t("delete")}
                    </Button>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
