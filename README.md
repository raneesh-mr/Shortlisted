# Shortlisted

A free, mobile-first web app that turns a job seeker's real experience into a clear CV and a short, human application email for a specific job. International by design: CV conventions come from region packs, not code.

Hosted at `shortlisted.realplannet.com` on Cloudflare Workers. Brand name, URL and colours live in [`config/brand.ts`](config/brand.ts) and env vars.

**Status: Phases 1–4 built; Phase 5 has seams only (by design).** Phase 1: foundation, auth, facts, CV import, builder, export and vault. Phase 2: job description analysis, match and gap questions, and tailored CVs from approved changes. Phase 3: the application email composer. Phase 4: the tracker with follow-up reminders and a job-posting checker. Phase 5 extras (career snapshot, referrals, payments, more UI languages, analytics) have documented seams in `config/features.ts`, `lib/payments`, `lib/analytics.ts` and DECISIONS.md. See [DECISIONS.md](DECISIONS.md) and [COMPLIANCE.md](COMPLIANCE.md).

## Stack

Next.js 16 (App Router, Turbopack, Cache Components) on Cloudflare Workers via OpenNext Â· TypeScript strict Â· Tailwind CSS 4 Â· Supabase (Auth + Postgres with RLS) Â· Anthropic API (server only) Â· `docx` + `pdf-lib` Â· Zod Â· next-intl Â· Vitest Â· Playwright.

## Setup

```bash
npm install
cp .env.example .env.local    # fill in values (all optional for guest-mode development)
npm run dev                    # http://localhost:3000
```

Without Supabase keys the app runs in **guest mode only** (data in the browser). Without an Anthropic key, CV import uses the basic (no-AI) parser.

### Supabase

**Production project:** `shortlisted-prod` (ref `bqykhrbcrdpnwghaasfv`, region Mumbai `ap-south-1`). All migrations are applied and the security advisor is clean. `.env.local` holds its public URL and publishable key; add the secret keys yourself.

For a new project:

1. Create a project. In **Authentication â†’ Providers**, enable Email (magic link) and Google.
2. In **Authentication â†’ URL configuration**, set the Site URL to your app URL and add `https://<your-domain>/auth/callback` (and `http://localhost:3000/auth/callback`) to the redirect allow-list.
3. Apply the schema: `npx supabase link --project-ref <ref>` then `npx supabase db push` (or paste `supabase/migrations/*.sql` into the SQL editor).
4. Check isolation on the live project: `npm run verify:rls` (creates two throwaway users and deletes them afterwards).

### Environment variables

| Name | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | build-time, public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | build-time, public | Public anon key (RLS enforces access) |
| `SUPABASE_SERVICE_ROLE_KEY` | Worker secret | Account deletion and `verify:rls`. Never expose. |
| `ANTHROPIC_API_KEY` | Worker secret | AI CV import |
| `LLM_MODEL` | `wrangler.jsonc` var | Model id, default `claude-opus-5-5` |
| `NEXT_PUBLIC_APP_URL` | build-time, public | Canonical URL (metadata) |
| `NEXT_PUBLIC_BRAND_NAME` | build-time, public | Product name |
| `NEXT_PUBLIC_CAREER_BLUEPRINT_URL` | build-time, public | Optional. Shows the Career snapshot link in Me |

Locally, `.env.local` serves `npm run dev`, and `.dev.vars` (copy `.dev.vars.example`) serves `npm run preview`.

### Deploy (Cloudflare Workers)

Shortlisted runs on Cloudflare Workers through the [OpenNext adapter](https://opennext.js.org/cloudflare), alongside realplannet.com on the same account. Config: [`wrangler.jsonc`](wrangler.jsonc), [`open-next.config.ts`](open-next.config.ts).

1. **Plan:** Workers Paid (US$5/month) is required. The Worker is about 3.7 MB gzipped (free limit 3 MB), and PDF generation needs more CPU per request than the free plan allows.
2. **Login:** `npx wrangler login`.
3. **Public settings (baked in at build time):** put `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL=https://shortlisted.realplannet.com` and `NEXT_PUBLIC_BRAND_NAME` in `.env.production.local`. If you use Cloudflare's Git builds, set them as build variables instead.
4. **Secrets (runtime, never in files):**
   ```bash
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   ```
   `LLM_MODEL` is a plain var in `wrangler.jsonc`.
5. **Deploy:** `npm run deploy`. This attaches the custom domain `shortlisted.realplannet.com` from `wrangler.jsonc`, creating the DNS record and certificate. It requires the realplannet.com zone to be in the same Cloudflare account and no existing `shortlisted` DNS record.
6. **Supabase:** add `https://shortlisted.realplannet.com/auth/callback` to the auth redirect allow-list.

Test locally in the real Workers runtime with `npm run preview`. Prefer deploying from Linux (WSL, or Cloudflare Workers Builds connected to Git): OpenNext warns that Windows builds can fail unpredictably.

Country detection reads Cloudflare's `cf-ipcountry` header (with Vercel's header and `Accept-Language` as fallbacks).

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js (region index is regenerated first) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` including typed routes and translation keys |
| `npm test` | Vitest: region packs, render model, PDF/DOCX export, import parser + coverage, ATS check, voice profile, guest repo, humanizer lint, email composers (AI path with the model mocked), mailto/.eml, **RLS against the real migrations** (in-process Postgres via PGlite) |
| `npm run test:e2e` | Playwright smoke test of the guest flow on a mobile viewport against `next start` (run `npx playwright install chromium` once; needs `npm run build`). Set `E2E_TARGET=workers` to run it inside the Workers runtime instead (needs `npx opennextjs-cloudflare build`) |
| `npm run preview` | Build for Cloudflare and serve locally in workerd |
| `npm run deploy` | Build for Cloudflare and deploy |
| `npm run verify:rls` | RLS check against a live Supabase project |
| `npm run gen` | Regenerates `config/regions/index.generated.ts` and `prompts/index.generated.ts` (runs automatically before dev, build and test) |

## Project map

```
app/                    routes (App Router)
  (app)/                signed-in or guest app: home, cvs, cvs/facts, cvs/import, cvs/edit, apply, apply/compose, tracker, me
  api/                  cv/import, cv/tailor, jd/analyze, match, export/[format], email/compose, humanize/lint, account (DELETE), account/export, geo
  auth/                 callback (PKCE code exchange), finish (consent + guest migration)
  welcome, onboarding, privacy, offline
components/             UI primitives, app shell, provider, CV preview, fact forms
config/                 brand, consent texts, regions/*.json (+ Zod schema)
lib/
  cv/                   render model (document.ts), PDF, DOCX, templates, dates
  jd/                   boilerplate split, basic + AI job analysis, matching, keyword coverage
  tailor/               proposed changes (basic + AI), truth checks, applying accepted changes
  email/                variants, fact selection, basic + AI composers, mailto/.eml
  tracker/              reminders (day 7 / 14), calendar (.ics), posting checks
  humanizer/            banned phrases + deterministic lint
  import/               text extraction, heuristic + AI parsers, coverage check
  repo/                 Repo interface: LocalRepo (IndexedDB, guest) / RemoteRepo (Supabase)
  ats/ voice/ supabase/ llm.ts prompts.ts regions.ts geo.ts api.ts
messages/en.json        UI strings (typed; add a locale = add a file)
prompts/*.md            versioned LLM prompts with purpose/constraints headers
supabase/migrations/    schema, RLS, triggers, storage bucket
wrangler.jsonc          Cloudflare Worker config (domain, rate limiters, vars)
```

## Adding a region

Add `config/regions/<id>.json` matching [`config/regions/schema.ts`](config/regions/schema.ts). No code change: the index is regenerated on dev/build/test, and `tests/unit/regions.test.ts` validates every pack and checks that no country is in two packs.

## How truthfulness is enforced

- CV content stores **fact ids**, never copied text. Every rendered line carries `source_fact_id`.
- Unconfirmed facts never render.
- Imports are checked in both directions: every source line a fact doesn't explain goes to "needs your attention", and every fact whose wording isn't in the source is flagged as unverified.
- Per-CV wording edits are stored as overrides. The underlying fact changes only when the user chooses "Update the fact".
- Tailoring: changes are proposals with before/after; nothing applies until accepted, and the base CV is never modified. AI rewrites that add or change a number are discarded; new names and job-description terms are flagged. Keyword coverage only counts words that appear in lines from the user's facts.
- Gap questions: a requirement the user hasn't shown is asked about, never assumed. A fact is only created from the user's own answer; "I haven't done this" is remembered.
- Emails: every evidence sentence must cite a fact on the chosen CV (uncited text is dropped), and a deterministic lint flags any number, name or praise word that isn't in the user's own facts or inputs. Flags are shown, never hidden.
