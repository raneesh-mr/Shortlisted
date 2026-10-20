"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useApp } from "@/components/app-provider";
import { FactForm } from "@/components/fact-forms";
import { Sheet } from "@/components/sheet";
import { Button, Card, Notice, PageHeader } from "@/components/ui";
import { formatRange } from "@/lib/cv/dates";
import { makeFact, nowIso, type Fact, type FactData, type FactOf, type FactType } from "@/lib/model";

type Editing = { type: FactType; fact?: Fact; preset?: Record<string, unknown> } | null;

function ConfirmBadge({ fact, onConfirm }: { fact: Fact; onConfirm: () => void }) {
  const t = useTranslations("facts");
  if (fact.confirmed) return null;
  return (
    <span className="mt-2 flex flex-wrap items-center gap-2">
      <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-semibold">{t("notConfirmed")}</span>
      <button type="button" onClick={onConfirm} className="min-h-11 rounded-lg px-2 text-sm font-semibold text-accent underline">
        {t("confirm")}
      </button>
    </span>
  );
}

export default function FactsPage() {
  const t = useTranslations("facts");
  const { facts, saveFacts, deleteFacts } = useApp();
  const [editing, setEditing] = useState<Editing>(null);

  const of = <T extends FactType>(type: T) => facts.filter((f): f is FactOf<T> => f.type === type);
  const contact = of("contact")[0];
  const works = of("work").sort((a, b) => (b.data.start ?? "").localeCompare(a.data.start ?? ""));
  const achievements = of("achievement");
  const workIds = new Set(works.map((w) => w.id));
  const unlinked = achievements.filter((a) => !a.data.work_id || !workIds.has(a.data.work_id));
  const unconfirmed = facts.filter((f) => !f.confirmed);

  const confirm = (f: Fact) => saveFacts([{ ...f, confirmed: true, updated_at: nowIso() }]);

  async function save<T extends FactType>(type: T, data: FactData<T>) {
    const existing = editing?.fact;
    const fact = existing
      ? ({ ...existing, data, confirmed: true, updated_at: nowIso() } as Fact)
      : (makeFact(type, data) as Fact);
    await saveFacts([fact]);
    setEditing(null);
  }

  const open = (type: FactType, fact?: Fact, preset?: Record<string, unknown>) => setEditing({ type, fact, preset });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {unconfirmed.length > 0 && (
        <Notice
          tone="warn"
          action={
            <Button variant="secondary" onClick={() => saveFacts(unconfirmed.map((f) => ({ ...f, confirmed: true, updated_at: nowIso() })))}>
              {t("confirmAll", { count: unconfirmed.length })}
            </Button>
          }
        >
          {t("unconfirmedNote", { count: unconfirmed.length })}
        </Notice>
      )}

      <section aria-labelledby="h-contact">
        <h2 id="h-contact" className="mb-2 text-lg font-semibold">
          {t("contact")}
        </h2>
        {contact ? (
          <Card>
            <button type="button" className="w-full text-start" onClick={() => open("contact", contact)}>
              <p className="font-semibold">{contact.data.full_name || t("noName")}</p>
              <p className="text-sm text-ink-2">{[contact.data.email, contact.data.phone, contact.data.city].filter(Boolean).join(" · ")}</p>
              <p className="mt-1 text-sm text-accent underline">{t("edit")}</p>
            </button>
            <ConfirmBadge fact={contact} onConfirm={() => confirm(contact)} />
          </Card>
        ) : (
          <Button variant="secondary" className="w-full" onClick={() => open("contact")}>
            {t("addContact")}
          </Button>
        )}
      </section>

      <section aria-labelledby="h-work">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="h-work" className="text-lg font-semibold">
            {t("experience")}
          </h2>
          <Button variant="ghost" onClick={() => open("work")}>
            + {t("addRole")}
          </Button>
        </div>
        {works.length === 0 && <p className="text-ink-2">{t("noRoles")}</p>}
        <div className="flex flex-col gap-3">
          {works.map((w) => (
            <Card key={w.id}>
              <button type="button" className="w-full text-start" onClick={() => open("work", w)}>
                <p className="font-semibold">{w.data.title || t("untitled")}</p>
                <p className="text-sm text-ink-2">
                  {[w.data.employer, w.data.location].filter(Boolean).join(", ")}
                  {" · "}
                  {formatRange(w.data.start, w.data.end, w.data.current, "MMM YYYY") || t("noDates")}
                </p>
              </button>
              <ConfirmBadge fact={w} onConfirm={() => confirm(w)} />
              <ul className="mt-3 flex flex-col gap-1">
                {achievements
                  .filter((a) => a.data.work_id === w.id)
                  .map((a) => (
                    <li key={a.id}>
                      <button type="button" onClick={() => open("achievement", a)} className="flex w-full gap-2 rounded-lg py-1.5 text-start text-sm hover:bg-surface-2">
                        <span aria-hidden>•</span>
                        <span className="flex-1">
                          {a.data.text}
                          {a.data.kind === "achievement" && <span className="ms-2 rounded bg-accent-soft px-1.5 text-xs">{t("result")}</span>}
                        </span>
                      </button>
                      <ConfirmBadge fact={a} onConfirm={() => confirm(a)} />
                    </li>
                  ))}
              </ul>
              <Button variant="ghost" className="mt-1" onClick={() => open("achievement", undefined, { work_id: w.id })}>
                + {t("addBullet")}
              </Button>
            </Card>
          ))}
        </div>
        {unlinked.length > 0 && (
          <div className="mt-3">
            <Notice tone="warn" title={t("unlinkedTitle")}>
              {t("unlinkedBody")}
            </Notice>
            <ul className="mt-2 flex flex-col gap-1">
              {unlinked.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => open("achievement", a)} className="w-full rounded-lg py-1.5 text-start text-sm underline">
                    {a.data.text}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <SimpleList
        title={t("education")}
        addLabel={t("addEducation")}
        items={of("education").map((e) => ({
          fact: e,
          main: [e.data.qualification, e.data.field].filter(Boolean).join(", "),
          sub: [e.data.institution, formatRange(e.data.start, e.data.end, false, "MMM YYYY")].filter(Boolean).join(" · "),
        }))}
        onAdd={() => open("education")}
        onOpen={(f) => open("education", f)}
        onConfirm={confirm}
      />
      <ChipList title={t("skills")} addLabel={t("addSkill")} items={of("skill").map((s) => ({ fact: s, label: s.data.name }))} onAdd={() => open("skill")} onOpen={(f) => open("skill", f)} />
      <ChipList
        title={t("languages")}
        addLabel={t("addLanguage")}
        items={of("language").map((l) => ({ fact: l, label: l.data.level ? `${l.data.name} (${l.data.level})` : l.data.name }))}
        onAdd={() => open("language")}
        onOpen={(f) => open("language", f)}
      />
      <SimpleList
        title={t("certs")}
        addLabel={t("addCert")}
        items={of("cert").map((c) => ({ fact: c, main: c.data.name, sub: c.data.issuer ?? "" }))}
        onAdd={() => open("cert")}
        onOpen={(f) => open("cert", f)}
        onConfirm={confirm}
      />

      <div className="flex flex-col gap-3">
        <Link href="/cvs/import" className="text-accent underline">
          {t("importInstead")}
        </Link>
      </div>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing ? t(`sheet.${editing.type}`) : ""}>
        {editing && (
          <FactForm
            key={editing.fact?.id ?? "new"}
            type={editing.type}
            initial={(editing.fact?.data ?? editing.preset) as FactData<typeof editing.type> | undefined}
            works={works}
            onSave={(data) => save(editing.type, data)}
            onDelete={
              editing.fact
                ? async () => {
                    await deleteFacts([editing.fact!.id]);
                    setEditing(null);
                  }
                : undefined
            }
          />
        )}
      </Sheet>
    </div>
  );
}

function SimpleList({
  title,
  addLabel,
  items,
  onAdd,
  onOpen,
  onConfirm,
}: {
  title: string;
  addLabel: string;
  items: { fact: Fact; main: string; sub: string }[];
  onAdd: () => void;
  onOpen: (f: Fact) => void;
  onConfirm: (f: Fact) => void;
}) {
  const t = useTranslations("facts");
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Button variant="ghost" onClick={onAdd}>
          + {addLabel}
        </Button>
      </div>
      {items.length === 0 && <p className="text-ink-2">{t("none")}</p>}
      <div className="flex flex-col gap-2">
        {items.map(({ fact, main, sub }) => (
          <Card key={fact.id}>
            <button type="button" className="w-full text-start" onClick={() => onOpen(fact)}>
              <p className="font-semibold">{main || t("untitled")}</p>
              {sub && <p className="text-sm text-ink-2">{sub}</p>}
            </button>
            <ConfirmBadge fact={fact} onConfirm={() => onConfirm(fact)} />
          </Card>
        ))}
      </div>
    </section>
  );
}

function ChipList({
  title,
  addLabel,
  items,
  onAdd,
  onOpen,
}: {
  title: string;
  addLabel: string;
  items: { fact: Fact; label: string }[];
  onAdd: () => void;
  onOpen: (f: Fact) => void;
}) {
  const t = useTranslations("facts");
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Button variant="ghost" onClick={onAdd}>
          + {addLabel}
        </Button>
      </div>
      {items.length === 0 && <p className="text-ink-2">{t("none")}</p>}
      <ul className="flex flex-wrap gap-2">
        {items.map(({ fact, label }) => (
          <li key={fact.id}>
            <button
              type="button"
              onClick={() => onOpen(fact)}
              className={`min-h-11 rounded-full border px-3 text-sm ${fact.confirmed ? "border-line bg-surface" : "border-warn bg-warn-soft"}`}
            >
              {label}
              {!fact.confirmed && <span className="sr-only"> ({t("notConfirmed")})</span>}
              {!fact.confirmed && <span aria-hidden> ?</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
