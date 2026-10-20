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
