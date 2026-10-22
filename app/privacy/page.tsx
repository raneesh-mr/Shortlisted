import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";
import { formatMoney, products } from "@/config/pricing";

export const metadata: Metadata = { title: "Privacy" };

const updated = "19 October 2026";

/** Plain-language privacy notice. Kept as content, not legal boilerplate. */
export default function Privacy() {
  const name = brand.name;
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <Link href="/" className="font-semibold text-accent">
        {name}
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Privacy</h1>
      <p className="mt-2 text-ink-2">Last updated {updated}.</p>

      <div className="mt-8 flex flex-col gap-6 leading-relaxed [&_h2]:text-xl [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:ps-5">
        <section>
          <h2>The short version</h2>
          <ul>
            <li>We store what you type so we can build your CVs and emails. That&apos;s it.</li>
            <li>We never sell your data, share it with advertisers or use it to train AI models.</li>
            <li>You can export everything or delete your account at any time from Me → Privacy.</li>
          </ul>
        </section>

        <section>
          <h2>Who we are</h2>
          <p>
            {name} is run by {brand.parent.name}. Questions or requests: <a className="underline" href={`mailto:${brand.contactEmail}`}>{brand.contactEmail}</a>.
          </p>
        </section>

        <section>
          <h2>What we store and why</h2>
          <ul>
            <li>Your account email, so you can sign in.</li>
            <li>The facts you enter or confirm (work history, education, skills and so on), your CVs and their last 10 versions.</li>
            <li>Your country settings and, if you give one, a short writing-style summary (sentence length, formality). We keep the style measurements, not your sample text.</li>
            <li>A record of what you agreed to and when (consent log).</li>
            <li>Basic security events, like &quot;data exported&quot;, without any CV content.</li>
          </ul>
          <p className="mt-2">
            Legal basis: your consent and the service you asked for (GDPR / UK GDPR Art. 6(1)(a) and (b); consent under India&apos;s DPDP Act 2023).
          </p>
        </section>

        <section>
          <h2>Guest mode</h2>
          <p>
            If you continue without an account, your data stays in this browser only (IndexedDB). We don&apos;t receive it unless you
            export a file or move it into an account. Clearing your browser data deletes it.
          </p>
        </section>

        <section>
          <h2>Uploaded CVs and AI</h2>
          <p>
            When you import a CV, your file is opened on your own device and never uploaded. Only its text is sent to us, to suggest
            facts for you to confirm, and we don&apos;t keep it. If you leave &quot;Use AI&quot; on, that text is sent to our AI provider,
            Anthropic, which processes it on our behalf and does not use it to train models. Turn it off to use our basic reader, which
            runs only on our own servers.
          </p>
        </section>

        <section>
          <h2>Job descriptions, tailoring and emails</h2>
          <p>
            The job description you paste is used to list what the job asks for, check it against your facts, suggest changes to
            a copy of your CV and choose which facts to mention in your email. Nothing about the job is ever added to your facts
            unless you type it yourself in answer to a question. If &quot;Use AI&quot;
            is on, your relevant facts, the details you typed and the job description go to Anthropic for these steps; they
            aren&apos;t used to train models. With AI off, a plain template quotes your facts word for word. We never send email for
            you: it opens in your own email app. Your applications and emails are saved like your CVs (in your browser as a guest, or
            in your account) and you can delete them at any time.
          </p>
        </section>

        <section>
          <h2>Who processes your data</h2>
          <ul>
            <li>Supabase: database and sign-in.</li>
            <li>Cloudflare: hosting.</li>
            <li>Anthropic: AI processing, only when you use an AI feature.</li>
            <li>Razorpay: card, UPI and net-banking payments. We never see or store your card or bank details.</li>
          </ul>
          <p className="mt-2">Data may be processed outside your country under standard contractual safeguards.</p>
        </section>

        <section>
          <h2>Your rights</h2>
          <ul>
            <li>Access and portability: Me → Privacy → Export my data (JSON with everything, plus Word files of the CVs you&apos;ve paid for).</li>
            <li>Erasure: Me → Privacy → Delete my account. This is a hard delete of your rows and files and cannot be undone. Payment records (amount, date, order reference) are kept without your name or account, because tax law requires it.</li>
            <li>Correction: edit any fact or CV directly.</li>
            <li>Withdraw optional consents (email updates, WhatsApp) any time in Me → Privacy.</li>
            <li>You can complain to your local data protection authority.</li>
          </ul>
        </section>

        <section>
          <h2>Logs and analytics</h2>
          <p>Our logs record errors and event names only, never CV text or personal details. We don&apos;t run advertising trackers.</p>
        </section>

        <section>
          <h2>Location</h2>
          <p>
            We use your approximate country (from your connection or browser language) only to suggest a CV style. It&apos;s a suggestion you can
            change, and we don&apos;t store your IP address.
          </p>
        </section>

        <section id="refunds">
          <h2>Payments and refunds</h2>
          <p>
            Building and previewing a CV is free. Downloading a finished CV (PDF and Word) costs {formatMoney(products.cv_download.amount)} per CV, including 18% GST.
            You pay once per CV and can edit it and download it again as often as you like.
          </p>
          <p className="mt-2">
            If a download fails or the file is broken and we can&apos;t fix it, email <a className="underline" href={`mailto:${brand.contactEmail}`}>{brand.contactEmail}</a> within
            7 days of paying and we&apos;ll refund you in full to the original payment method (usually 5–7 working days). If you were charged twice for the same CV, we refund the
            extra payment automatically when we spot it, or as soon as you tell us.
          </p>
        </section>

        <section id="terms">
          <h2>Terms</h2>
          <ul>
            <li>Your CV must describe your own, real experience. We help with wording and layout; you are responsible for what it says.</li>
            <li>We don&apos;t promise interviews or jobs.</li>
            <li>Don&apos;t use {name} to send spam or to apply in someone else&apos;s name.</li>
            <li>The service is provided by {brand.parent.name}, India. These terms are governed by Indian law.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
