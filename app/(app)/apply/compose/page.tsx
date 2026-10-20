"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useApp } from "@/components/app-provider";
import { EmailEditor, LintSummary } from "@/components/email-editor";
import { ReadAloud } from "@/components/read-aloud";
import { SendPanel } from "@/components/send-panel";
import { Button, Card, Notice, PageHeader, Select, Spinner, Switch, TextArea, TextInput, cx } from "@/components/ui";
import { apiFetch, errorKey } from "@/lib/client-api";
import { bodyText, type Paragraph, type Slot } from "@/lib/email/assemble";
import { lintDraft, type ComposeResult } from "@/lib/email/compose";
import type { LintReport } from "@/lib/humanizer/lint";
import { variants } from "@/lib/email/variants";
import { MAX_TEXT_CHARS } from "@/lib/import/limits";
import { emailVariants, newId, nowIso, type Application, type ComposeInputs, type EmailLength, type EmailRecord, type EmailVariant, type Tone } from "@/lib/model";
import { buildCvDocument } from "@/lib/cv/document";
import { getRegionPack } from "@/lib/regions";

type Step = 1 | 2 | 3;

interface Draft {
  emailId: string;
  variant: EmailVariant;
  subjects: string[];
  subject: string;
  paragraphs: Paragraph[];
  method: "ai" | "basic";
  tone: Tone;
  length: EmailLength;
  claimSource: string;
  regenerated: boolean;
  edited: boolean;
  createdAt: string;
}

function emailRecord(draft: Draft, app: Application, lint: LintReport): EmailRecord {
  return {
    id: draft.emailId,
    application_id: app.id,
    variant: draft.variant,
    subject: draft.subject,
    body: bodyText(draft.paragraphs),
    recipient: app.compose.recipient_email || null,
    meta: {
      subjects: draft.subjects,
      tone: draft.tone,
      length: draft.length,
      method: draft.method,
      used_fact_ids: [...new Set(draft.paragraphs.flatMap((p) => p.fact_ids))],
      claim_source: draft.claimSource,
      edited: draft.edited,
      paragraphs: draft.paragraphs,
    },
    lint_report: lint,
    created_at: draft.createdAt,
    updated_at: nowIso(),
  };
}

function Composer() {
  const t = useTranslations("compose");
  const te = useTranslations("errors");
  const params = useSearchParams();
  const router = useRouter();
  const { applications, cvs, facts, profile, repo, online, saveApplication } = useApp();
  const id = params.get("id");
  const stored = applications.find((a) => a.id === id) ?? null;

  const [app, setApp] = useState<Application | null>(stored);
  const [step, setStep] = useState<Step>(stored?.email_id ? 3 : 1);
  const [variant, setVariant] = useState<EmailVariant>("apply_direct");
  const [useAi, setUseAi] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [rewriting, setRewriting] = useState<Slot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedEmail, setLoadedEmail] = useState(false);
  const skipSave = useRef(true);

  useEffect(() => {
    // Adopt the stored application once it has loaded.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!app && stored) setApp(stored);
  }, [app, stored]);

  // Load the saved email, if any.
  useEffect(() => {
    if (!app?.email_id || !repo || loadedEmail) return;
    repo
      .listEmails(app.id)
      .then((emails) => {
        const e = emails.find((x) => x.id === app.email_id);
        if (e) {
          setVariant(e.variant);
          setDraft({
            emailId: e.id,
            variant: e.variant,
            subjects: e.meta.subjects,
            subject: e.subject,
            paragraphs: e.meta.paragraphs.length ? e.meta.paragraphs : [{ slot: "opener", text: e.body, fact_ids: [] }],
            method: e.meta.method,
            tone: e.meta.tone,
            length: e.meta.length,
            claimSource: e.meta.claim_source,
            regenerated: false,
            edited: e.meta.edited,
            createdAt: e.created_at,
          });
        } else setStep(1);
      })
      .catch(() => setStep(1))
      .finally(() => setLoadedEmail(true));
  }, [app, repo, loadedEmail]);

  // Autosave the application (job details and composer inputs).
  useEffect(() => {
    if (!app) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    const h = setTimeout(() => void saveApplication({ ...app, updated_at: nowIso() }).catch(() => setError(te("server_error"))), 600);
    return () => clearTimeout(h);
    // saveApplication identity changes with app state; the application value is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app]);

  const cv = cvs.find((c) => c.id === app?.cv_id) ?? null;
  const pack = getRegionPack(cv?.region_id);
  const cvDoc = useMemo(() => (cv ? buildCvDocument(cv, facts) : null), [cv, facts]);
  const lint = useMemo(
    () => (draft ? lintDraft({ subjects: [draft.subject], paragraphs: draft.paragraphs }, { source: draft.claimSource, voice: profile?.voice_profile ?? null }) : null),
    [draft, profile],
  );

  // Save the email whenever it changes (debounced), and link it to the application.
  useEffect(() => {
    if (!draft || !app || !repo || !lint) return;
    const h = setTimeout(async () => {
      try {
        await repo.saveEmail(emailRecord(draft, app, lint));
        if (app.email_id !== draft.emailId) setApp((prev) => (prev ? { ...prev, email_id: draft.emailId } : prev));
      } catch {
        setError(te("server_error"));
      }
    }, 700);
    return () => clearTimeout(h);
  }, [draft, app, repo, lint, te]);

  if (!app) {
    return applications.length || !id ? <Notice tone="warn">{t("notFound")}</Notice> : <Spinner label={t("loading")} />;
  }

  const spec = variants[variant];
  const setField = (patch: Partial<Application>) => setApp((prev) => (prev ? { ...prev, ...patch } : prev));
  const setInput = (patch: Partial<ComposeInputs>) => setApp((prev) => (prev ? { ...prev, compose: { ...prev.compose, ...patch } } : prev));
  const missing = spec.requires.filter((k) => !String(app.compose[k] ?? "").trim());

  async function compose(rewriteSlot?: "opener" | "evidence" | "close") {
    if (!app || !cv) return;
    setError(null);
    if (rewriteSlot) setRewriting(rewriteSlot);
    else setBusy(true);
    try {
      const res = await apiFetch("/api/email/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: useAi ? "ai" : "basic",
          variant,
          role: app.role,
          company: app.company,
          jd_text: app.jd_text,
          inputs: app.compose,
          cv: { region_id: cv.region_id, template_id: cv.template_id, content: cv.content },
          facts,
          voice: profile?.voice_profile ?? null,
          spelling: profile?.spelling ?? null,
          rewrite: rewriteSlot && draft ? { slot: rewriteSlot, paragraphs: draft.paragraphs, subjects: draft.subjects } : undefined,
        }),
      });
      const r = (await res.json()) as ComposeResult;
      setDraft((prev) => ({
        emailId: rewriteSlot && prev ? prev.emailId : newId(),
        variant,
        subjects: r.subjects,
        subject: rewriteSlot && prev ? prev.subject : (r.subjects[0] ?? ""),
        paragraphs: r.paragraphs,
        method: r.method,
        tone: r.tone,
        length: r.length,
        claimSource: r.claim_source,
        regenerated: r.regenerated,
        edited: rewriteSlot && prev ? prev.edited : false,
        createdAt: rewriteSlot && prev ? prev.createdAt : nowIso(),
      }));
      setStep(3);
    } catch (err) {
      setError(te(errorKey(err)));
    } finally {
      setBusy(false);
      setRewriting(null);
    }
  }

  async function pasteJd() {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) setField({ jd_text: text.slice(0, MAX_TEXT_CHARS) });
    } catch {
      setError(t("clipboardBlocked"));
    }
  }

  const steps: { n: Step; label: string }[] = [
    { n: 1, label: t("step1") },
    { n: 2, label: t("step2") },
    { n: 3, label: t("step3") },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={app.role || t("newTitle")} subtitle={app.company || undefined} />
      <ol className="grid grid-cols-3 gap-1" aria-label={t("progress")}>
        {steps.map((s) => (
          <li key={s.n}>
            <button
              type="button"
              disabled={s.n === 3 && !draft}
              onClick={() => setStep(s.n)}
              aria-current={step === s.n ? "step" : undefined}
              className={cx("min-h-11 w-full rounded-lg border text-sm", step === s.n ? "border-accent bg-accent-soft font-semibold" : "border-line text-ink-2", s.n === 3 && !draft && "opacity-50")}
            >
              {s.n}. {s.label}
            </button>
          </li>
        ))}
      </ol>
      {error && <Notice tone="danger">{error}</Notice>}

      {step === 1 && (
        <section className="flex flex-col gap-4">
          <TextInput label={t("role")} value={app.role} maxLength={160} onChange={(e) => setField({ role: e.target.value })} />
          <TextInput label={t("company")} value={app.company} maxLength={160} onChange={(e) => setField({ company: e.target.value })} />
          <TextArea
            label={t("jd")}
            hint={t("jdHint")}
            rows={10}
            value={app.jd_text}
            maxLength={MAX_TEXT_CHARS}
            onChange={(e) => setField({ jd_text: e.target.value })}
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              const file = e.dataTransfer.files[0];
              if (file && (file.type.startsWith("text/") || file.name.endsWith(".txt"))) {
                e.preventDefault();
                setField({ jd_text: (await file.text()).slice(0, MAX_TEXT_CHARS) });
              }
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={pasteJd}>
              {t("pasteClipboard")}
            </Button>
            <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-line px-4 text-sm">
              {t("openTxt")}
              <input
                type="file"
                accept=".txt,text/plain"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setField({ jd_text: (await f.text()).slice(0, MAX_TEXT_CHARS) });
                }}
              />
            </label>
          </div>
          {cvs.length ? (
            <Select
              label={t("cv")}
              hint={t("cvHint")}
              value={app.cv_id ?? ""}
              onChange={(e) => setField({ cv_id: e.target.value || null })}
              options={[{ value: "", label: t("chooseCv") }, ...cvs.map((c) => ({ value: c.id, label: c.title }))]}
            />
          ) : (
            <Notice tone="warn" action={<Link href="/cvs" className="font-semibold underline">{t("buildCv")}</Link>}>
              {t("noCv")}
            </Notice>
          )}
          <Button disabled={!cv} onClick={() => setStep(2)}>
            {t("next")}
          </Button>
        </section>
      )}

      {step === 2 && (
        <section className="flex flex-col gap-4">
          <fieldset>
            <legend className="mb-2 font-semibold">{t("variantTitle")}</legend>
            <div className="grid gap-2">
              {emailVariants.map((v) => (
                <label key={v} className={cx("flex min-h-11 cursor-pointer gap-3 rounded-xl border p-3", variant === v ? "border-accent bg-accent-soft" : "border-line bg-surface")}>
                  <input type="radio" name="variant" checked={variant === v} onChange={() => setVariant(v)} className="mt-1" />
                  <span>
                    <span className="font-medium">{t(`variant.${v}.label`)}</span>
                    <span className="block text-sm text-ink-2">{t(`variant.${v}.hint`)}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <TextInput label={t("recipientName")} hint={t("recipientNameHint")} value={app.compose.recipient_name} onChange={(e) => setInput({ recipient_name: e.target.value })} />
          <TextInput label={t("recipientEmail")} type="email" inputMode="email" value={app.compose.recipient_email} onChange={(e) => setInput({ recipient_email: e.target.value })} />
          {(variant === "apply_direct" || variant === "referral") && (
            <>
              <TextInput
                label={variant === "referral" ? t("referrer") : t("source")}
                hint={variant === "referral" ? t("referrerHint") : t("sourceHint")}
                value={app.compose.source}
                onChange={(e) => setInput({ source: e.target.value })}
              />
              <TextArea label={t("companyDetail")} hint={t("companyDetailHint")} rows={3} value={app.compose.company_detail} onChange={(e) => setInput({ company_detail: e.target.value })} />
            </>
          )}
          {(variant === "after_interview" || variant === "thank_you") && (
            <TextArea label={t("interviewDetail")} hint={t("interviewDetailHint")} rows={3} value={app.compose.interview_detail} onChange={(e) => setInput({ interview_detail: e.target.value })} />
          )}
          {(variant === "follow_up" || variant === "accept_offer") && (
            <TextInput
              label={variant === "follow_up" ? t("appliedOn") : t("startDate")}
              hint={t("dateHint")}
              value={app.compose.date_note}
              onChange={(e) => setInput({ date_note: e.target.value })}
            />
          )}
          {variant === "decline_offer" && (
            <TextArea label={t("reason")} hint={t("reasonHint")} rows={2} value={app.compose.reason} onChange={(e) => setInput({ reason: e.target.value })} />
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label={t("tone")}
              value={app.compose.tone ?? ""}
              onChange={(e) => setInput({ tone: (e.target.value || null) as Tone | null })}
              options={[
                { value: "", label: t("toneDefault", { tone: t(`toneName.${pack.email_tone}`) }) },
                { value: "direct", label: t("toneName.direct") },
                { value: "warm", label: t("toneName.warm") },
                { value: "formal", label: t("toneName.formal") },
              ]}
            />
            <Select
              label={t("length")}
              value={app.compose.length}
              onChange={(e) => setInput({ length: e.target.value as EmailLength })}
              options={[
                { value: "short", label: t("lengthShort") },
                { value: "standard", label: t("lengthStandard") },
              ]}
            />
          </div>
          <Card>
            <Switch label={t("aiLabel")} hint={t("aiHint")} checked={useAi} onChange={setUseAi} />
          </Card>
          {cvDoc && (cvDoc.hidden.unconfirmed > 0 || !cvDoc.name) && (
            <Notice tone="warn" action={<Link href="/cvs/facts" className="font-semibold underline">{t("reviewFacts")}</Link>}>
              {!cvDoc.name ? t("noName") : t("unconfirmed", { count: cvDoc.hidden.unconfirmed })}
            </Notice>
          )}
          {missing.length > 0 && <Notice tone="warn">{t("missing")}</Notice>}
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(1)}>
              {t("back")}
            </Button>
            <Button className="flex-1" disabled={busy || missing.length > 0 || !online || !cv} onClick={() => compose()}>
              {busy ? t("writing") : draft ? t("writeAgain") : t("write")}
            </Button>
          </div>
          {!online && <p className="text-sm text-ink-2">{t("offline")}</p>}
        </section>
      )}

      {step === 3 && !draft && !loadedEmail && <Spinner label={t("loading")} />}
      {step === 3 && draft && lint && (
        <section className="flex flex-col gap-4">
          <Notice>
            {draft.method === "ai" ? t("madeAi") : t("madeBasic")} {draft.regenerated ? t("regenerated") : ""}
          </Notice>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-semibold">{t("subjectTitle")}</legend>
            {draft.subjects.map((s, i) => (
              <label key={i} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface px-3">
                <input type="radio" name="subject" checked={draft.subject === s} onChange={() => setDraft({ ...draft, subject: s })} />
                <span>{s}</span>
              </label>
            ))}
            <TextInput label={t("subjectEdit")} value={draft.subject} maxLength={300} onChange={(e) => setDraft({ ...draft, subject: e.target.value, edited: true })} />
          </fieldset>

          <p className="text-sm text-ink-2">{t("tapToEdit")}</p>
          <EmailEditor
            subject={draft.subject}
            paragraphs={draft.paragraphs}
            lint={lint}
            rewriting={rewriting}
            onParagraphs={(paragraphs) => setDraft({ ...draft, paragraphs, edited: true })}
            onAnotherTake={draft.method === "ai" && online ? (slot) => compose(slot) : undefined}
          />
          {draft.method === "basic" && <p className="text-sm text-ink-2">{t("anotherTakeAi")}</p>}
          <Card>
            <LintSummary lint={lint} />
          </Card>
          <div className="flex flex-wrap gap-2">
            <ReadAloud text={`${draft.subject}. ${bodyText(draft.paragraphs)}`} lang={profile?.spelling ?? pack.spelling} />
            <Button variant="ghost" onClick={() => setStep(2)}>
              {t("changeDetails")}
            </Button>
          </div>

          <SendPanel
            to={app.compose.recipient_email}
            subject={draft.subject}
            body={bodyText(draft.paragraphs)}
            cv={cv}
            facts={facts}
            online={online}
            onSent={async () => {
              // Save now: the debounced saves would be cancelled by navigating away.
              try {
                await repo!.saveEmail(emailRecord(draft, app, lint));
                await saveApplication({ ...app, email_id: draft.emailId, status: app.status === "saved" ? "applied" : app.status, updated_at: nowIso() });
                router.push("/apply");
              } catch {
                setError(te("server_error"));
              }
            }}
          />
        </section>
      )}
    </div>
  );
}

export default function ComposePage() {
  return (
    <Suspense>
      <Composer />
    </Suspense>
  );
}
