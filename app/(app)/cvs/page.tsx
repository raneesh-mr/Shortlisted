"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useApp } from "@/components/app-provider";
import { Button, Card, LinkButton, Notice, PageHeader, TextInput } from "@/components/ui";
import { track } from "@/lib/analytics";
import { duplicateCv, newCv } from "@/lib/cv/create";
import { getRegionPack } from "@/lib/regions";

export default function Vault() {
  const t = useTranslations("vault");
  const router = useRouter();
  const { cvs, facts, profile, saveCv, deleteCv } = useApp();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const unconfirmed = facts.filter((f) => !f.confirmed).length;

  async function create() {
    const cv = newCv(t("newTitle"), profile);
    await saveCv(cv, { snapshot: true });
    track({ name: "cv_created" });
    router.push(`/cvs/edit?id=${cv.id}`);
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="grid grid-cols-2 gap-3">
        <LinkButton href="/cvs/facts" variant="secondary">
          {t("facts", { count: facts.length })}
        </LinkButton>
        <LinkButton href="/cvs/import" variant="secondary">
          {t("import")}
        </LinkButton>
      </div>
      {unconfirmed > 0 && (
        <Notice tone="warn" action={<Link href="/cvs/facts" className="font-semibold underline">{t("review")}</Link>}>
          {t("unconfirmed", { count: unconfirmed })}
        </Notice>
      )}
      <Button onClick={create}>+ {t("new")}</Button>

      {cvs.length === 0 ? (
        <Card className="text-center">
          <p className="font-semibold">{t("emptyTitle")}</p>
          <p className="mt-1 text-ink-2">{facts.length ? t("emptyWithFacts") : t("emptyNoFacts")}</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {cvs.map((cv) => (
            <li key={cv.id}>
              <Card>
                {renaming === cv.id ? (
                  <form
                    className="flex flex-col gap-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (name.trim()) await saveCv({ ...cv, title: name.trim().slice(0, 120) });
                      setRenaming(null);
                    }}
                  >
                    <TextInput label={t("rename")} value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={120} />
                    <div className="flex gap-2">
                      <Button type="submit">{t("save")}</Button>
                      <Button variant="ghost" onClick={() => setRenaming(null)}>
                        {t("cancel")}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <>
                    <Link href={`/cvs/edit?id=${cv.id}`} className="block">
                      <p className="font-semibold">{cv.title}</p>
                      <p className="text-sm text-ink-2">
                        {getRegionPack(cv.region_id).label} · {t("updated", { date: new Date(cv.updated_at).toLocaleDateString() })}
                      </p>
                    </Link>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <LinkButton href={`/cvs/edit?id=${cv.id}`} variant="ghost">
                        {t("open")}
                      </LinkButton>
                      <Button variant="ghost" onClick={() => saveCv(duplicateCv(cv, t("copyOf", { title: cv.title }).slice(0, 120)), { snapshot: true })}>
                        {t("duplicate")}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setRenaming(cv.id);
                          setName(cv.title);
                        }}
                      >
                        {t("rename")}
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirmDelete(cv.id)}>
                        {t("delete")}
                      </Button>
                    </div>
                    {confirmDelete === cv.id && (
                      <div className="mt-2">
                        <Notice
                          tone="danger"
                          title={t("deleteTitle")}
                          action={
                            <div className="flex gap-2">
                              <Button variant="danger" onClick={() => deleteCv(cv.id).then(() => setConfirmDelete(null))}>
                                {t("deleteYes")}
                              </Button>
                              <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
                                {t("cancel")}
                              </Button>
                            </div>
                          }
                        >
                          {t("deleteBody")}
                        </Notice>
                      </div>
                    )}
                  </>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
