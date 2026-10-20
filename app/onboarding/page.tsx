"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { brand } from "@/config/brand";
import { useApp } from "@/components/app-provider";
import { CountrySelect, RegionSummary } from "@/components/region";
import { Button, Checkbox, Notice, Spinner, TextArea } from "@/components/ui";
import { countryName } from "@/lib/geo";
import type { VoiceProfile } from "@/lib/model";
import { regionForCountry, spellingForCountry } from "@/lib/regions";
import { buildVoiceProfile } from "@/lib/voice/profile";

const STEPS = 4;

export default function Onboarding() {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const { status, profile, detectedCountry, updateProfile } = useApp();
  const [step, setStep] = useState(1);
  const [home, setHome] = useState<string | null>(null);
  const [sameTarget, setSameTarget] = useState(true);
  const [target, setTarget] = useState<string | null>(null);
  const [sample, setSample] = useState("");
  const [voice, setVoice] = useState<VoiceProfile | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "signed_out") router.replace("/welcome");
  }, [status, router]);

  useEffect(() => {
    // Prefill once from the saved profile or the detected-country hint.
    if (profile && home === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHome(profile.home_country ?? detectedCountry);
      setTarget(profile.target_country);
      setSameTarget(!profile.target_country || profile.target_country === profile.home_country);
    }
  }, [profile, detectedCountry, home]);

  if (status !== "ready" || !profile) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-10">
        <Spinner label={t("loading")} />
      </main>
    );
  }

  const effectiveTarget = sameTarget ? home : target;

  async function finish(next: "/cvs/import" | "/cvs/facts") {
    setBusy(true);
    await updateProfile({
      home_country: home,
      target_country: effectiveTarget,
      detected_country: detectedCountry,
      spelling: voice?.spelling ?? spellingForCountry(effectiveTarget),
      voice_profile: voice,
      onboarded: true,
    });
    router.replace(next);
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-8">
      <p className="text-sm font-semibold text-accent">{brand.name}</p>
      <p className="mt-4 text-sm text-ink-2" aria-live="polite">
        {t("progress", { step, total: STEPS })}
      </p>
      <div className="mt-2 h-1.5 w-full rounded-full bg-surface-2" aria-hidden>
        <div className="h-1.5 rounded-full bg-accent" style={{ width: `${(step / STEPS) * 100}%` }} />
      </div>

      {step === 1 && (
        <section className="mt-6 flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">{t("homeTitle")}</h1>
          {detectedCountry && home === detectedCountry && <Notice>{t("detected", { country: countryName(detectedCountry) })}</Notice>}
          <CountrySelect label={t("homeLabel")} value={home} onChange={setHome} />
          <Button disabled={!home} onClick={() => setStep(2)}>
            {t("next")}
          </Button>
        </section>
      )}

      {step === 2 && (
        <section className="mt-6 flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">{t("targetTitle")}</h1>
          <p className="text-ink-2">{t("targetLead")}</p>
          <Checkbox checked={sameTarget} onChange={setSameTarget} label={t("sameAsHome", { country: countryName(home) })} />
          {!sameTarget && <CountrySelect label={t("targetLabel")} hint={t("targetHint")} value={target} onChange={setTarget} />}
          {effectiveTarget && <RegionSummary pack={regionForCountry(effectiveTarget)} />}
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(1)}>
              {t("back")}
            </Button>
            <Button className="flex-1" disabled={!effectiveTarget} onClick={() => setStep(3)}>
              {t("next")}
            </Button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="mt-6 flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">{t("voiceTitle")}</h1>
          <p className="text-ink-2">{t("voiceLead")}</p>
          <TextArea
            label={t("voiceLabel")}
            hint={t("voiceHint")}
            value={sample}
            onChange={(e) => {
              setSample(e.target.value);
              setVoice(buildVoiceProfile(e.target.value, spellingForCountry(effectiveTarget)));
            }}
            rows={6}
          />
          {voice && (
            <Notice tone="ok" title={t("voiceFound")}>
              {t("voiceSummary", {
                words: Math.round(voice.avg_sentence_words),
                formality: t(`formality.${voice.formality}`),
                contractions: voice.uses_contractions ? t("yes") : t("no"),
              })}
            </Notice>
          )}
          {sample.trim() && !voice && <p className="text-sm text-ink-2">{t("voiceMore")}</p>}
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(2)}>
              {t("back")}
            </Button>
            <Button className="flex-1" onClick={() => setStep(4)}>
              {voice ? t("next") : t("skip")}
            </Button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="mt-6 flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">{t("startTitle")}</h1>
          <p className="text-ink-2">{t("startLead")}</p>
          <Button disabled={busy} onClick={() => finish("/cvs/import")}>
            {t("import")}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => finish("/cvs/facts")}>
            {t("blank")}
          </Button>
          <Button variant="ghost" onClick={() => setStep(3)}>
            {t("back")}
          </Button>
        </section>
      )}
    </main>
  );
}
