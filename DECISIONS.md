# Decisions

Sensible defaults chosen during the build, with the reason. Revisit any of them freely.

## Phase 1 (2026-10-19)

**Next.js 16 with Cache Components (the scaffold default).** App pages are client components behind a static shell, because guest data lives in IndexedDB and must render on the device. That also gives a cheap offline shell.

**One `Repo` interface, two implementations.** `LocalRepo` (IndexedDB, guests) and `RemoteRepo` (Supabase with RLS, accounts) are interchangeable, so every screen works in both modes. Ids are client-generated UUIDs, which makes the guest-to-account migration a set of idempotent upserts. `RemoteRepo` mirrors reads to IndexedDB so saved CVs open offline; writes need a connection.

**Guest data migration asks first.** After sign-in, if the device holds guest data, the user chooses "move into account" or "delete from device". Silently merging could mix two people's data on a shared device.

**Consent before sign-in, logged after.** The checkbox is never pre-ticked. The choice is held in `localStorage` until the session exists, then written to `consents`. If a magic link is opened on another device, `/auth/finish` asks again rather than assuming.

**Responsibilities and achievements are both `achievement` facts** with `kind` and `work_id`. That gives every bullet its own citable id. Bullets not linked to a role aren't shown on CVs, and the UI says so.

**The CV summary is CV-level text, not a fact.** The spec's fact types don't include one. It's user-authored, so it doesn't break the "nothing invented" rule. Phase 2 tailoring will propose summary changes through the change list.

**Per-CV edits are overrides.** Tapping a line edits it for that CV only (`text_overrides`). "Update the fact" changes the source. Either way the line keeps its `source_fact_id`.

**Region pack fields are recommendations; each personal field is a per-CV switch** (`null` means follow the pack). Changing the target country or pack resets section order and the switches to that pack's defaults, and the UI says this beforehand.

**Region index is generated.** `scripts/gen-regions.mjs` runs before dev, build and test, so a new JSON file is the only change needed. Packs are validated with Zod at load time and in tests.

**Address shows city only, or city plus country.** No street addresses are stored. They're rarely expected now and add privacy risk. DACH "full address" conventions get a city plus country.

**PDF uses pdf-lib's standard fonts (Helvetica or Times).** They're text-selectable, need no font files, and the bundle stays small. They can't draw non-Latin scripts. Rather than silently replacing characters, export returns `unsupported_characters` and the UI suggests the Word file, which handles every script (tested). **Seam:** embed Noto fonts via `@pdf-lib/fontkit` when Hindi or Arabic UI arrives.

**Page count is real, not estimated.** The builder calls `/api/export/pdf` in `measure` mode (debounced). It returns the true page count, and the extracted text is checked to confirm the PDF is machine-readable.

**Templates: Classic, Modern, Compact.** All are single column with no tables, text boxes or icons. The photo appears only where the CV's settings allow it.

**AI import is opt-out per import.** The import screen has a "Use AI" switch, on by default when a key is configured, with a plain note that the text goes to Anthropic. The basic parser is deterministic and runs server-side without AI.

**LLM "temperature" is controlled by effort.** Current Claude models reject sampling parameters, so extraction uses `effort: "low"` and wording (Phase 2+) will use `"medium"`. Structured output goes through `messages.parse` with a Zod schema, plus one retry and a friendly error. Server-side refusal fallback (`fallbacks: "default"`) is on.

**Default model `claude-opus-5-5`**, overridable with `LLM_MODEL`.

**Uploaded CV files are not stored.** Text is extracted in memory and the file is discarded. That's less data to protect. The private `user-files` bucket and its per-user folder policies exist for later features, and account deletion already empties the user's folder.

**Rate limiting has two layers.** Cloudflare rate-limit bindings (`wrangler.jsonc`) give shared per-minute limits across all Worker instances: import 5/min, export 30/min, account actions 3/min. An in-memory window per instance adds the longer limits (import 15/hour, account export 10/hour, delete 5/hour) as a best-effort backstop. Limits apply by IP and by user. Outside Workers (`next start`, tests) only the in-memory layer runs.

**Version history: snapshot every 5 minutes while editing, plus "Save a version now", keeping the last 10.** A database trigger enforces the 10 for accounts; `LocalRepo` does the same for guests.

**i18n uses next-intl without locale routing yet.** All UI strings are in `messages/en.json`, and the keys are type-checked. Layout uses logical CSS properties (`ps-`, `start-`, `text-start`) and `dir` comes from the locale, so Arabic can be added. The privacy notice is a full English page; legal text will be translated as whole documents.

**Apply and Tracker tabs show honest "coming next" screens.** They're kept in the bottom bar so the navigation stays stable. Home's primary card is still "Paste a job description" and says it arrives in the next update.

**Dark mode follows the system by default, with an override in Me.** The CV preview always renders on white "paper", like the export.

**RLS is tested two ways.** `tests/unit/rls.test.ts` runs the real migration in PGlite with a minimal stand-in for Supabase's auth and storage schemas. `npm run verify:rls` checks a live project.

**Payments are not built.** Razorpay will be added in Phase 5 as server routes plus a `subscriptions` table. Nothing in Phase 1 assumes free or paid.

## Phase 5: seams only, by design (2026-10-22)

The spec says "do not build now, only leave seams". These are the extension points; none of them changes behaviour today.

**Feature flags** (`config/features.ts`). `referrals` and `analytics` are `false`, and a test fails if either is switched on without a matching change. `payments` is now live (see "Quick flow and paid downloads").

**Career snapshot.** Set `NEXT_PUBLIC_CAREER_BLUEPRINT_URL` and a card appears in Me linking out to Real Plannet's Career Blueprint. It's a plain link; nothing is shared. A later integration should pass data only with an explicit, separately consented export.

**Paid extras (Razorpay).** Superseded: built as paid CV downloads (see below). The seam's ground rules held: server-only keys, signature-verified webhooks, a purchases table under RLS, no countdowns or scarcity copy.

**Referral credits.** Not built. Plan: a `referral_codes` table (user_id, code) and `referral_events` (code, referred_user_id, status, created_at) under RLS. Credit only after the referred person confirms their own email; no personal data about the referred person goes back to the referrer beyond a count.

**Arabic, Hindi and Spanish UI.** The scaffolding is ready: all UI strings are typed keys in `messages/en.json`, `dir` comes from the locale (`i18n/config.ts` lists RTL locales), and layout uses logical CSS only. A test now fails if any component uses physical left/right classes (`ml-`, `pr-`, `text-left`…), so Arabic can be added without rework. To add a locale: translate `messages/{locale}.json`, add it to `locales`, and resolve it in `i18n/request.ts` (a locale route segment or cookie). Legal pages (privacy) should be translated as whole documents. Region-pack notes and lint hints are English today.

**Analytics.** `lib/analytics.ts` exposes `track()` with a closed union of event names whose only properties are enums (format, method). The types make it impossible to pass free text, names, CV content or URLs. It's a no-op until a cookie-less, aggregated provider is chosen. It's already called at the key moments (CV created, imported, exported, application created, CV tailored, email composed, follow-up marked), so turning it on needs no new call sites. Turning it on also needs a privacy-notice update and a check that no consent banner is required for the chosen provider.

## Phase 4: tracker and nudges (2026-10-22)

**Board for thumbs.** There are five columns (Saved, Applied, Interview, Offer, Closed). On phones, columns are swipeable scroll-snap panels with tabs showing counts; tabs and swipe stay in sync. On wider screens it's a 5-column grid. Cards open a bottom sheet with large "stage" buttons instead of drag and drop, which is unreliable on touch and hard for keyboard and screen-reader users. Within a column, cards sort by next-action date, then by most recently updated.

**Edits save as you type, and on close.** The sheet saves 400 ms after a change. Closing it sooner flushes the pending save, which was a bug the end-to-end test caught (edits were lost when the sheet closed within the debounce window).

**Moving to Applied sets dates.** `applied_at` becomes today and `next_action_at` becomes day 7, unless the user already set them. "I've sent it" in the composer does the same.

**Reminders at day 7 and day 14, in-app only.** They're computed from `applied_at` while the status is Applied, with per-reminder state (pending, done or dismissed) in `applications.reminders`. When both are due, only the later one shows. Sending a follow-up email marks the due ones done. They appear on Home and the Tracker, with a count badge on the Tracker tab (screen-reader text included).

**Calendar file instead of server reminders.** "Add reminders to my calendar" downloads an RFC 5545 `.ics` with all-day events at day 7 and 14, each with an alarm (escaped and line-folded; tested). This gives real nudges without us sending anything.

**Email/WhatsApp reminders stay behind their opt-in, and aren't live.** The separate consents already exist in Me, and the UI says nothing is sent yet. **Seam:** a Cloudflare Cron Trigger plus an email or WhatsApp provider would read `dueReminders` server-side, only for users whose latest consent for that channel is granted.

**Posting checker: questions, not verdicts.** A deterministic checklist covers payment requests, bank or ID requests, crypto/gift cards/wire transfers, personal-email recruiters, chat-app-only contact, unrealistic pay, guarantees, pressure tactics and an unnamed company. Each finding shows the text that triggered it and a question to ask, plus general tips. It runs in the browser, appears on the analysis step when something is found, and is a standalone tool on the Tracker.

## Phase 2: job description → tailored CV (2026-10-21)

**Six steps, each saved automatically.** The Apply flow is Job → Analysis → Match → Tailor → Details → Email. Analysis, match, gap decisions and proposed changes all live on the application (`jd_analysis`, `match`, `gaps`, `tailor`; migration `20261021000000`), so the user can leave and resume at the right step. Tailoring is optional ("Skip, use my CV as it is"), and follow-up and offer emails can skip straight to the email.

**One AI switch per application.** "Use AI for this application" in step 1 covers analysis, matching, tailoring and email wording. The basic path runs every step without sending anything to the AI provider, which is what the end-to-end tests exercise.

**Boilerplate is set aside, not deleted.** Equal-opportunity statements, benefits sections and recruitment-fraud or privacy notices are separated before analysis, then shown in a collapsed "Set aside" panel.

**Basic analysis is copy-only.** It reads section headings (requirements, nice to have, responsibilities…) and bullets, finds tools from a known list plus acronyms and CamelCase names, and ranks keywords from single words. Two-word phrases count only when they repeat, because one-off pairs were noise ("through planned"). Every keyword must occur in the text. Seniority prefers explicit words ("Senior" beats "Manager").

**AI analysis is grounded.** Requirement lines are kept only when at least 60% of their words come from the job text. Tools, keywords and language hints must appear in it word for word. Unknown enum values become "unspecified".

**Matching cites facts or it's a gap.** The basic matcher compares lightly stemmed content words: 60% or more is strong, 25% or more (or 50% across the top 3 facts) is partial. Filler words like "experience" or "strong" are ignored. The AI matcher's "strong" or "partial" without a valid fact citation is downgraded to a gap, and requirements it skips fall back to the basic result. Only confirmed facts count. A saved match is marked stale when facts or requirements change (fingerprint in `match.basis`).

**Gaps are questions, never guesses.** Must-haves, tools and nice-to-haves that aren't in the facts get "Have you done this?". "Yes" saves the user's own words as a fact on a role they choose, optionally adding the tool as a skill. "I haven't done this" is remembered, never asked again, and that requirement is always a gap. Responsibilities aren't asked about, to keep the list short.

**Tailoring proposes; the user disposes.** Proposals are typed changes (`summary`, `wording`, `order`, `include`) with before/after. Basic mode reorders bullets within each role and the skills by relevance (cited matches weighted by level and kind, plus keyword overlap), and offers to re-show hidden facts that match. AI mode adds rewording (up to 8 bullets) and a summary citing facts. Roles stay chronological, as every region pack expects.

**Truth checks on every rewrite.** A rewrite that adds or changes a number is discarded before the user sees it. New capitalised names, and job-description words the fact didn't use, are flagged ("accept only if true"), as are humanizer errors. "Accept all with no flags" is an explicit action; flagged changes need a decision one by one.

**The base CV is never touched.** Creating the tailored CV copies the base with only accepted changes applied (summary, per-CV wording overrides, order, un-hidden facts), names it "{Role} – {Company}", links it with `base_cv_id`, and makes it the CV for the email. Undecided changes are not applied, and the UI says so.

**Keyword coverage can't be gamed.** A keyword counts only when all its words appear together in a CV line that comes from a fact. The summary is excluded and only fact lines are searched. Uncovered keywords point the user to the gap questions, never to adding words.

## Phase 3: application email composer (2026-10-20)

**Built before Phase 2, on request.** The spec feeds Phase 3 "the tailored CV"; until Phase 2 exists the user picks any CV from their vault, and a tailored CV will simply be another option. Choosing which facts fit the job is a small, contained ranking (overlap between the job description and each fact on the chosen CV), not the full Phase 2 match view.

**Structure is code; wording is filled in.** Each of the 7 variants (`lib/email/variants.ts`) fixes the slots: greeting, opener, evidence, close, sign-off. Code writes the greeting and sign-off, using a recipient name only if the user typed one, or "Dear {Company} team," / "Hello," otherwise. The AI fills only the opener, evidence and close.

**Every evidence sentence must cite facts.** The model receives facts as short refs (F1, F2…), using the chosen CV's wording. Evidence that cites no real fact is dropped before the user sees it. Ids are mapped back and stored per paragraph (`fact_ids`).

**Claims are checked deterministically.** The lint compares numbers, capitalised names and evaluative adjectives against everything the user wrote or confirmed. The job description is deliberately excluded, so the email can't claim the job's requirements as experience. Unsupported numbers are errors; names and praise words are warnings.

**Basic mode, no AI.** Fixed sentences per variant and tone, with fact lines quoted word for word as a short list. It works without an API key, is fully testable, and is the private option: nothing goes to the AI provider. All 21 variant × tone combinations pass their own lint (tested). "Another take" needs AI; in basic mode the user edits paragraphs directly.

**Regenerate once, never hide flags.** If an AI draft fails the lint, it is regenerated once with the findings as constraints. The better of the two is kept (fewer errors, then higher score) and remaining flags are highlighted in the text and listed with hints.

**The lint runs in the browser too.** After every edit the same deterministic lint re-runs client-side against the stored claim source, so flags update instantly. `POST /api/humanize/lint` exposes it per the spec.

**Lint thresholds.** One em dash allowed. Exclamation marks are flagged unless the user's own writing sample uses them (then one is allowed). Buzzwords are flagged at 2 or more hits above 2% density, or 3 or more hits outright. Uniform length is flagged when the sentence-length coefficient of variation is below 0.2 across 4 or more sentences. Score is 100 minus 20 per error and 7 per warning (at most 3 counted per rule); passing needs no errors and a score of 70 or more.

**No server-side sending.** Copy, `mailto:` (CRLF line breaks, `%20` for spaces, with a notice when the link gets long enough for some mail apps to cut it off), or a `.eml` draft with `X-Unsent: 1`, a base64 UTF-8 body and an RFC 2047 subject, which opens as an editable draft in Outlook and Apple Mail. Because `mailto:` can't carry attachments, an "Attach your CV" checklist sits beside a one-tap PDF download of the chosen CV.

**Where things are saved.** Composer inputs live on the application (`applications.compose`). Each email keeps its subject options, paragraphs (for editing), method, tone, claim source and lint report (`emails.meta`, `emails.lint_report`). Both are saved automatically as the user works. "I've sent it" flushes both immediately and marks the application Applied, which seeds Phase 4.

**References must be the user's own.** Foreign keys skip RLS, so a user could have attached an email to someone else's application id (they still couldn't read it). Migration `20261020000100` adds ownership checks for every reference (`applications.cv_id/email_id`, `emails.application_id`, `cv_versions.cv_id`, `cvs.base_cv_id`) through small `security definer` helpers, because a policy on `cvs` that queried `cvs` would recurse. This is covered by the RLS test.

**Separate rate limit for writing.** `LIMIT_COMPOSE` allows 12 a minute, plus 60 an hour per instance, so drafting and "Another take" don't eat the import allowance.

**Lint hints are English for now.** Rule names are translated through `messages`, but the hint strings live in `lib/humanizer/lint.ts`. Move them into messages when a second UI language arrives.

## Hosting on Cloudflare (2026-10-20)

**Cloudflare Workers via OpenNext (`@opennextjs/cloudflare`)**, to sit with realplannet.com on one provider. The custom domain `shortlisted.realplannet.com` is declared in `wrangler.jsonc`.

**No `proxy.ts` (middleware).** OpenNext's Node.js middleware support on Cloudflare is experimental and failed to bundle. Nothing needed it: the browser Supabase client refreshes sessions itself, server routes refresh through `getClaims()`, and the country hint moved to `GET /api/geo`, which the app calls once and caches in a cookie.

**Uploaded CVs are read in the browser.** `pdf.js` (via unpdf) worked only once per Workers isolate and failed on every later call. PDF and Word extraction now runs on the device (`lib/import/extract.ts`, loaded on demand), and only the text is sent to `/api/cv/import`. This is also better for privacy: the file never leaves the device.

**No runtime "is the PDF readable" extraction.** Every PDF uses standard fonts with real text, and rendering refuses characters it can't encode, so a successful render is readable by construction. `tests/unit/export.test.ts` reads the text back to prove it.

**Prompts are bundled at build time** (`scripts/gen-prompts.mjs` → `prompts/index.generated.ts`), because Workers have no filesystem. The `.md` files stay the source of truth.

**Static-assets incremental cache.** Every page is a prerendered shell and nothing uses ISR, so no R2 bucket is needed. Switch to the R2 cache if a route ever revalidates.

**Workers Paid plan required.** The Worker is about 3.7 MB gzipped (the free limit is 3 MB, paid is 10 MB), and PDF and DOCX generation need more CPU per request than the free plan's allowance.

**Build on Linux for production.** OpenNext warns that Windows builds may fail unpredictably, and Windows also blocked its symlinks for `serverExternalPackages` (now removed; the libraries are bundled). Local Windows builds, preview and the Workers end-to-end run all passed. Use WSL or Cloudflare Workers Builds for real deploys.

**Both runtimes are tested.** `npm run test:e2e` runs on Node, and `E2E_TARGET=workers npm run test:e2e` runs the same flows inside workerd, including PDF and DOCX export and importing each format twice.

## Supabase project (2026-10-21)

**`shortlisted-prod` in Mumbai (ap-south-1).** This is closest to the Gulf and India, the first markets, and matches the existing makemycv project. EU and UK users are covered by standard contractual clauses (see COMPLIANCE.md). Moving region later means a full data migration.

**Policies are tightened with ALTER POLICY, never drop and create.** The first attempt used `drop policy` and was declined at the confirmation step. Rewriting with `alter policy` gives identical rules, deletes nothing, and never leaves a gap where a rule is missing. The repo migrations were updated to match and re-tested before applying.

**Hardening from the advisors** (migration `20261021000100`). The signup trigger function can't be called through the API. The ownership helpers live in a non-exposed `private` schema; policies reference them by identity, so they keep working, as the RLS tests confirm. Indexes cover every foreign key. After this, the security advisor reports nothing.

**Publishable key, not the legacy anon key.** `sb_publishable_…` is Supabase's recommended client key and can be rotated independently. The variable is still named `NEXT_PUBLIC_SUPABASE_ANON_KEY` for compatibility.

**Live RLS check.** A rolled-back in-database test with temporary users was declined, so live isolation is verified by `npm run verify:rls` once the service role key is in `.env.local`. The same migrations pass the PGlite RLS suite, and an anonymous read-only probe of the live API returns no rows.

## Quick flow and paid downloads (2026-10-22)

Feedback on the first build: too slow to get to a CV, and the business needs downloads to be paid, matching Real Plannet's MakeMyCV (₹199 including GST). Prototyped in Claude Design first, then built.

**One screen to start.** `/` takes a CV (upload, paste, or saved facts) and a job ad (paste, upload, or clipboard) and runs import → JD analysis → match → tailor in the browser (`lib/quick/run.ts`). It tries AI and falls back to the basic method for the rest of the run if AI is off or failing, so it always finishes.

**Truth rules kept, with one tap.** Imported facts are saved unconfirmed; the review screen shows them as the user's for the preview and marks lines the importer wasn't sure of as "check". "Looks right" confirms them. Tailoring changes with flags (new names, job terms, lint) are left pending, never auto-applied. At most one gap question is asked (a tool the job names that isn't in the CV); "Yes" adds a skill fact, "No" adds nothing.

**Paid per CV, server-enforced.** A file download now sends only `cv_id`; the server loads the CV under the user's RLS session and needs a `purchases` row with `status = 'paid'` (402 otherwise). The old shape (client sends CV content, gets a file) is rejected. Page-count measuring stays free and returns no file. The data export still includes every CV in `data.json` (it's the user's data), but Word files only for paid CVs.

**Razorpay over plain REST** (`lib/pay/razorpay.ts`), WebCrypto HMAC with constant-time compare, so it runs on Workers without the Node SDK. The amount comes from `config/pricing.ts`, never the browser. Purchases are written only with the service role (no insert/update policies), marked paid by either the checkout signature (`/api/pay/verify`) or a verified webhook, whichever comes first.

**Account needed to pay.** Guests can build and preview; paying asks for sign-in so the purchase survives device changes. A pending checkout is remembered across the magic link; `/auth/finish` then moves the guest's data automatically (ids are preserved) and returns to checkout.

**Tax records survive deletion.** `purchases.user_id` is `on delete set null`, so deleting an account removes the person but keeps the amount, date and order reference that GST law needs.
