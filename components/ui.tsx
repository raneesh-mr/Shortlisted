"use client";

import Link from "next/link";
import { useId, type ComponentProps, type ReactNode } from "react";

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "btn-gold",
  secondary: "border border-line bg-transparent text-ink hover:border-accent hover:text-accent-strong",
  ghost: "text-ink hover:bg-surface-2",
  danger: "bg-danger text-bg hover:opacity-90",
};
const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-base font-medium transition disabled:cursor-not-allowed disabled:opacity-50";

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button type="button" className={cx(base, variants[variant], className)} {...props} />;
}

export function LinkButton({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cx(base, variants[variant], className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("rounded-2xl border border-line bg-surface p-4", className)} {...props} />;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-3xl font-light tracking-tight text-ink-strong">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-2">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

type Tone = "info" | "warn" | "danger" | "ok";
const tones: Record<Tone, string> = {
  info: "bg-accent-soft text-ink",
  warn: "bg-warn-soft text-ink",
  danger: "bg-danger-soft text-ink",
  ok: "bg-ok-soft text-ink",
};
const toneLabel: Record<Tone, string> = { info: "Note", warn: "Check", danger: "Problem", ok: "Done" };

/** Status is always carried by a text label, never by colour alone. */
export function Notice({ tone = "info", title, children, action }: { tone?: Tone; title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("rounded-xl p-3 text-sm", tones[tone])}>
      <p>
        <span className="font-semibold">{title ?? toneLabel[tone]}: </span>
        {children}
      </p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children(id, describedBy)}
      {hint && (
        <p id={hintId} className="text-sm text-ink-2">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const inputCls = "min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base text-ink placeholder:text-ink-2/70";

export function TextInput({ label, hint, error, className, ...props }: Omit<ComponentProps<"input">, "id"> & { label: string; hint?: string; error?: string }) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id, d) => <input id={id} aria-describedby={d} aria-invalid={error ? true : undefined} className={cx(inputCls, className)} {...props} />}
    </Field>
  );
}

export function TextArea({ label, hint, error, className, ...props }: Omit<ComponentProps<"textarea">, "id"> & { label: string; hint?: string; error?: string }) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id, d) => (
        <textarea id={id} aria-describedby={d} aria-invalid={error ? true : undefined} className={cx(inputCls, "min-h-28 py-2", className)} {...props} />
      )}
    </Field>
  );
}

export function Select({
  label,
  hint,
  options,
  className,
  ...props
}: Omit<ComponentProps<"select">, "id"> & { label: string; hint?: string; options: { value: string; label: string }[] }) {
  return (
    <Field label={label} hint={hint}>
      {(id, d) => (
        <select id={id} aria-describedby={d} className={cx(inputCls, className)} {...props}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function Switch({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <div>
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        {hint && <p className="text-sm text-ink-2">{hint}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx("relative h-7 w-12 shrink-0 rounded-full border border-line transition", checked ? "bg-accent" : "bg-surface-2")}
      >
        <span className={cx("absolute top-0.5 size-5.5 rounded-full bg-white shadow transition-all", checked ? "start-6" : "start-0.5")} />
        <span className="sr-only">{checked ? "On" : "Off"}</span>
      </button>
    </div>
  );
}

export function Checkbox({ label, checked, onChange, required }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; required?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        required={required}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-5 shrink-0 accent-[var(--accent)]"
      />
      <label htmlFor={id} className="text-sm leading-relaxed">
        {label}
      </label>
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-2 text-ink-2">
      <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label}
    </div>
  );
}

export { cx };
