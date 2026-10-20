"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import type { CvLine, RenderedCv } from "@/lib/cv/document";
import { templates } from "@/lib/cv/templates";
import { cx } from "./ui";

export type LineTarget = { kind: "fact"; factId: string; text: string } | { kind: "summary"; text: string };

/** HTML twin of the PDF/DOCX layout. Lines are buttons so they can be edited in place. */
export function CvPreview({ doc, onSelect, selected }: { doc: RenderedCv; onSelect?: (t: LineTarget) => void; selected?: string | null }) {
  const t = useTranslations("builder");
  const tpl = templates[doc.template_id];
  const font: CSSProperties = { fontFamily: tpl.pdfFont === "Times" ? "'Times New Roman', Times, Georgia, serif" : "Arial, Helvetica, sans-serif" };
  const heading = (s: string) => (tpl.headingUppercase ? s.toUpperCase() : s);
  const centered = tpl.centerHeader && !doc.photo;

  const renderLine = (line: CvLine, className?: string) => {
    const id = line.source_fact_id;
    if (!onSelect || !id) return <span className={className}>{line.text}</span>;
    // A span with button semantics: a real <button> is inline-block, which breaks
    // list-marker alignment and text wrapping inside the CV layout.
    const activate = () => onSelect({ kind: "fact", factId: id, text: line.text });
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={activate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            activate();
          }
        }}
        className={cx("cursor-pointer rounded hover:bg-yellow-100 focus:bg-yellow-100", selected === id && "bg-yellow-100", className)}
        aria-label={t("editLine", { text: line.text })}
      >
        {line.text}
        {line.overridden && <span className="sr-only"> ({t("editedForCv")})</span>}
      </span>
    );
  };

  if (!doc.name && doc.sections.length === 0) {
    return <div className="cv-paper rounded-xl border border-line p-6 text-sm text-neutral-600">{t("emptyPreview")}</div>;
  }

  return (
    <article className="cv-paper rounded-xl border border-line p-5 text-[13px] leading-snug shadow-sm sm:p-8" style={font} aria-label={t("previewLabel")}>
      <header className={cx("flex gap-4", centered && "text-center")}>
        <div className="flex-1">
          <h2 className="font-bold" style={{ fontSize: tpl.sizes.name * 1.15 }}>
            {doc.name}
          </h2>
          {doc.headline && <p className="text-neutral-600">{doc.headline}</p>}
          {doc.contact.length > 0 && <p className="mt-1 text-[12px] text-neutral-600">{doc.contact.join("  |  ")}</p>}
        </div>
        {doc.photo && (
          // eslint-disable-next-line @next/next/no-img-element -- local data URL
          <img src={doc.photo} alt="" className="h-24 w-20 shrink-0 object-cover" />
        )}
      </header>
      {doc.sections.map((s) => (
        <section key={s.id} className="mt-4">
          <h3
            className={cx("font-bold", tpl.headingRule && "border-b border-neutral-400 pb-0.5")}
            style={{ color: tpl.accent, fontSize: tpl.sizes.heading * 1.15 }}
          >
            {heading(s.title)}
          </h3>
          <div className="mt-1.5 flex flex-col gap-2">
            {s.blocks.map((b, i) => {
              if (b.kind === "paragraph") {
                return onSelect ? (
                  <button key={i} type="button" onClick={() => onSelect({ kind: "summary", text: b.line.text })} className={cx("rounded text-start hover:bg-yellow-100", selected === "summary" && "bg-yellow-100")}>
                    {b.line.text}
                  </button>
                ) : (
                  <p key={i}>{b.line.text}</p>
                );
              }
              if (b.kind === "inline") {
                return (
                  <p key={i}>
                    {b.items.map((it, j) => (
                      <span key={j}>
                        {renderLine(it)}
                        {j < b.items.length - 1 && ", "}
                      </span>
                    ))}
                  </p>
                );
              }
              if (b.kind === "pairs") {
                return (
                  <dl key={i} className="grid grid-cols-[auto_1fr] gap-x-3">
                    {b.items.map((p) => (
                      <div key={p.label} className="contents">
                        <dt className="font-semibold">{p.label}</dt>
                        <dd>{p.value}</dd>
                      </div>
                    ))}
                  </dl>
                );
              }
              return (
                <div key={i}>
                  <div className="flex items-baseline justify-between gap-3">
                    {renderLine(b.title, "font-bold")}
                    {b.dates && <span className="shrink-0 text-[12px] text-neutral-600">{b.dates}</span>}
                  </div>
                  {b.subtitle && <p className="italic text-neutral-600">{b.subtitle}</p>}
                  {b.bullets.length > 0 && (
                    <ul className="mt-1 list-disc ps-5">
                      {b.bullets.map((bl, j) => (
                        <li key={j}>
                          {renderLine(bl)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {doc.footer && <p className="mt-4 text-[12px] text-neutral-600">{doc.footer}</p>}
    </article>
  );
}
