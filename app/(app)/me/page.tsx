"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { brand } from "@/config/brand";
import { features } from "@/config/features";
import { spellings, type Spelling } from "@/config/regions/schema";
import { consentTexts, type ConsentPurpose } from "@/config/consents";
import { GUEST_FLAG, useApp } from "@/components/app-provider";
import { CountrySelect, DISMISS_KEY, RegionSummary } from "@/components/region";
import { Button, Card, Notice, PageHeader, Select, Switch, TextArea, TextInput } from "@/components/ui";
import { DELETE_PHRASE } from "@/lib/account";
import { apiFetch, downloadBlob, errorKey } from "@/lib/client-api";
import { consentRecord, currentConsents } from "@/lib/consent";
import type { Consent } from "@/lib/model";
import { regionForCountry, spellingForCountry } from "@/lib/regions";
import { LocalRepo } from "@/lib/repo/local";
import { RemoteRepo } from "@/lib/repo/remote";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { buildVoiceProfile } from "@/lib/voice/profile";

type Theme = "system" | "light" | "dark";
const THEME_KEY = `${brand.slug}_theme`;

export default function Me() {
  const t = useTranslations("me");
  const te = useTranslations("errors");
  const router = useRouter();
  const { repo, user, profile, updateProfile, signOut, online } = useApp();
  const [consents, setConsents] = useState<Consent[]>([]);
  const [sample, setSample] = useState("");
  const [theme, setTheme] = useState<Theme>("system");
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    repo?.listConsents().then(setConsents).catch(() => setConsents([]));
    const saved = localStorage.getItem(THEME_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, [repo]);

  if (!profile || !repo) return null;
  const guest = repo.kind === "guest";
  const current = currentConsents(consents);
  const target = profile.target_country ?? profile.home_country;

  function applyTheme(next: Theme) {
    setTheme(next);
    if (next === "system") {
      localStorage.removeItem(THEME_KEY);
      delete document.documentElement.dataset.theme;
    } else {
      localStorage.setItem(THEME_KEY, next);
      document.documentElement.dataset.theme = next;
    }
  }

  async function toggleConsent(purpose: ConsentPurpose, granted: boolean) {
    const record = consentRecord(purpose, granted);
    await repo!.addConsents([record]);
    setConsents((prev) => [...prev, record]);
  }

  async function exportData() {
    setBusy("export");
    setError(null);
    try {
      const init: RequestInit = guest
        ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(await repo!.exportAll()) }
        : { method: "POST" };
      const res = await apiFetch("/api/account/export", init);
      downloadBlob(await res.blob(), `${brand.slug}-export-${new Date().toISOString().slice(0, 10)}.zip`);
    } catch (err) {
      setError(te(errorKey(err)));
    } finally {
      setBusy(null);
    }
  }

  async function deleteEverything() {
    if (phrase.trim().toLowerCase() !== DELETE_PHRASE) return;
    setBusy("delete");
    setError(null);
    try {
      if (guest) {
        await new LocalRepo().clearAll();
        localStorage.removeItem(GUEST_FLAG);
      } else {
        await apiFetch("/api/account", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: DELETE_PHRASE }),
        });
        await RemoteRepo.clearCache(user!.id);
        await getBrowserSupabase()?.auth.signOut({ scope: "local" });
      }
      localStorage.removeItem(DISMISS_KEY);
      // Full reload so no in-memory copy of the deleted data survives.
      window.location.replace("/?deleted=1");
    } catch (err) {
      setError(te(errorKey(err)));
      setBusy(null);
    }
  }

  const voice = profile.voice_profile;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} />

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("account")}</h2>
        {guest ? (
          <>
            <p className="text-ink-2">{t("guestBody")}</p>
            <Link href="/welcome?upgrade=1" className="font-semibold text-accent underline">
              {t("saveToAccount")}
            </Link>
          </>
        ) : (
          <p className="text-ink-2">{t("signedInAs", { email: user?.email ?? "" })}</p>
        )}
        <Button variant="secondary" onClick={() => signOut().then(() => router.replace("/"))}>
          {guest ? t("leaveGuest") : t("signOut")}
        </Button>
        {guest && <p className="text-sm text-ink-2">{t("leaveGuestHint")}</p>}
      </Card>

      <Card id="regions" className="flex scroll-mt-4 flex-col gap-4">
        <h2 className="text-lg font-semibold">{t("regions")}</h2>
        <CountrySelect label={t("home")} value={profile.home_country} onChange={(c) => updateProfile({ home_country: c || null })} />
        <CountrySelect
          label={t("target")}
          hint={t("targetHint")}
          value={profile.target_country}
          onChange={(c) => updateProfile({ target_country: c || null, spelling: spellingForCountry(c || profile.home_country) })}
        />
        <Select
          label={t("spelling")}
          value={profile.spelling ?? spellingForCountry(target)}
          onChange={(e) => updateProfile({ spelling: e.target.value as Spelling })}
          options={spellings.map((s) => ({ value: s, label: s }))}
        />
        {target && <RegionSummary pack={regionForCountry(target)} />}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("voice")}</h2>
        <p className="text-ink-2">{voice ? t("voiceHave", { words: voice.sample_words, formality: voice.formality }) : t("voiceNone")}</p>
        <TextArea label={t("voiceLabel")} hint={t("voiceHint")} rows={5} value={sample} onChange={(e) => setSample(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!buildVoiceProfile(sample)}
            onClick={async () => {
              await updateProfile({ voice_profile: buildVoiceProfile(sample, profile.spelling) });
              setSample("");
            }}
          >
            {t("voiceSave")}
          </Button>
          {voice && (
            <Button variant="ghost" onClick={() => updateProfile({ voice_profile: null })}>
              {t("voiceClear")}
            </Button>
          )}
        </div>
      </Card>

      {features.careerSnapshotUrl && (
        <Card className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{t("careerTitle")}</h2>
          <p className="text-ink-2">{t("careerBody", { parent: brand.parent.name })}</p>
          <a href={features.careerSnapshotUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent underline">
            {t("careerLink")}
          </a>
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("appearance")}</h2>
        <Select
          label={t("theme")}
          value={theme}
          onChange={(e) => applyTheme(e.target.value as Theme)}
          options={[
            { value: "system", label: t("themeSystem") },
            { value: "light", label: t("themeLight") },
            { value: "dark", label: t("themeDark") },
          ]}
        />
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">{t("privacy")}</h2>
        <p className="text-ink-2">{t("privacyPromise")}</p>
        <Link href="/privacy" className="text-accent underline">
          {t("privacyLink")}
        </Link>

        <div>
          <h3 className="font-semibold">{t("consents")}</h3>
          <p className="mt-1 text-sm text-ink-2">
            {current.core?.granted ? t("coreGiven", { date: new Date(current.core.granted_at).toLocaleDateString() }) : t("coreMissing")}
          </p>
          <Switch label={t("emailUpdates")} hint={consentTexts.email_updates.text} checked={!!current.email_updates?.granted} onChange={(v) => toggleConsent("email_updates", v)} />
          <Switch label={t("whatsapp")} hint={consentTexts.whatsapp.text} checked={!!current.whatsapp?.granted} onChange={(v) => toggleConsent("whatsapp", v)} />
          <p className="mt-1 text-sm text-ink-2">{t("remindersNotLive")}</p>
        </div>

        <div>
          <h3 className="font-semibold">{t("exportTitle")}</h3>
          <p className="mt-1 text-sm text-ink-2">{t("exportBody")}</p>
          <Button className="mt-2 w-full" variant="secondary" disabled={busy !== null || !online} onClick={exportData}>
            {busy === "export" ? t("exporting") : t("exportAction")}
          </Button>
        </div>

        <div className="rounded-xl border border-danger p-3">
          <h3 className="font-semibold text-danger">{guest ? t("deleteGuestTitle") : t("deleteTitle")}</h3>
          <p className="mt-1 text-sm text-ink-2">{guest ? t("deleteGuestBody") : t("deleteBody")}</p>
          <div className="mt-3">
            <TextInput label={t("deleteType", { phrase: DELETE_PHRASE })} value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" />
          </div>
          <Button
            variant="danger"
            className="mt-3 w-full"
            disabled={phrase.trim().toLowerCase() !== DELETE_PHRASE || busy !== null || (!guest && !online)}
            onClick={deleteEverything}
          >
            {busy === "delete" ? t("deleting") : t("deleteAction")}
          </Button>
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
      </Card>
    </div>
  );
}
