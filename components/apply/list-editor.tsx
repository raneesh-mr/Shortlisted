"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "../ui";

/** Editable list of short strings: remove any item, add your own. */
export function ListEditor({ label, items, onChange, max = 30, chips = false }: { label: string; items: string[]; onChange: (next: string[]) => void; max?: number; chips?: boolean }) {
  const t = useTranslations("tailor");
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v || items.includes(v) || items.length >= max) return;
    onChange([...items, v]);
    setDraft("");
  };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-semibold">{label}</legend>
      {items.length === 0 && <p className="text-sm text-ink-2">{t("noneFound")}</p>}
      <ul className={chips ? "flex flex-wrap gap-2" : "flex flex-col gap-1"}>
        {items.map((it, i) => (
          <li key={`${it}-${i}`} className={chips ? "flex items-center rounded-full border border-line bg-surface ps-3" : "flex items-start gap-2 rounded-lg border border-line bg-surface p-2"}>
            <span className={chips ? "text-sm" : "flex-1 text-sm"}>{it}</span>
            <button type="button" className="min-h-9 min-w-9 rounded-full text-ink-2" aria-label={t("remove", { item: it })} onClick={() => onChange(items.filter((_, j) => j !== i))}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <label className="sr-only" htmlFor={`add-${label}`}>
          {t("addTo", { list: label })}
        </label>
        <input
          id={`add-${label}`}
          className="min-h-11 flex-1 rounded-xl border border-line bg-surface px-3 text-base"
          value={draft}
          placeholder={t("addPlaceholder")}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button variant="secondary" onClick={add} disabled={!draft.trim()}>
          {t("add")}
        </Button>
      </div>
    </fieldset>
  );
}
