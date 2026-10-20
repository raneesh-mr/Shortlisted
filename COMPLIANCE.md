# Compliance

What is implemented for GDPR, UK GDPR and India's DPDP Act 2023, as of Phase 1. This is an engineering record, not legal advice; have counsel review before launch.

| Requirement | Implementation | Where |
| --- | --- | --- |
| Lawful basis, consent | Required core consent before an account or guest session. Never pre-ticked. Plain-language, versioned text | `config/consents.ts`, `app/welcome`, `app/auth/finish` |
| Consent records | Append-only `consents` table (purpose, text version, granted, timestamp). Users can't edit history (RLS) | migration, `tests/unit/rls.test.ts` |
| Separate optional consents | Email updates and WhatsApp are separate switches, off by default, withdrawable in Me → Privacy | `app/(app)/me` |
| Transparency | Plain-language privacy notice: purposes, processors, rights, AI use | `app/privacy` |
| No sale, sharing or training | Stated in the UI and the notice. The AI provider (Anthropic API) doesn't train on API data | privacy page, import screen |
| Data minimisation | No street address, no IP storage, uploaded CV files read in the browser and never uploaded (only their text is sent), writing sample reduced to statistics on device | `lib/voice/profile.ts`, `lib/import/extract.ts` |
| Right of access / portability | One-tap export: ZIP with all rows as JSON plus each CV as DOCX. Works for guests too | `/api/account/export`, `lib/export/bundle.ts` |
| Right to erasure | Hard delete after a typed confirmation phrase. Removes storage files, then the auth user, and every row cascades. Offline caches are cleared. Guests: IndexedDB wiped | `DELETE /api/account`, `app/(app)/me` |
| Rectification | Every fact and CV is editable | facts page, builder |
| Security: access control | RLS on every table (`auth.uid() = user_id`). Private storage bucket with per-user folders. Service role used only for deletion | migration, `lib/supabase/server.ts` |
| Security: verified isolation | Automated test: a second user can't read, update, delete or insert another user's rows or files | `tests/unit/rls.test.ts`, `scripts/verify-rls.mjs` |
| No personal data in logs | Server logs record error class or status only. Zod errors return field paths, never values. Audit table stores event names only | `lib/api.ts`, `lib/llm.ts`, API routes |
| No personal data in caches | The service worker never caches `/api/*` or `/auth/*`. Exports are `Cache-Control: no-store` | `public/sw.js` |
| Job descriptions and tailoring | The job text is stored with the application (deleted with it). With AI off, analysis, matching and tailoring run without sending anything to the AI provider. Gap answers become facts only when the user types them | `app/(app)/apply`, `lib/jd`, `lib/tailor` |
| Reminders | In-app only (Home, Tracker, a badge on the tab) or the user's own calendar through an .ics file. Nothing is sent by us. Email/WhatsApp opt-ins are recorded separately and the UI says they aren't live yet | `lib/tracker`, `app/(app)/me` |
| Posting checker | Runs entirely in the browser. The pasted posting isn't sent or stored unless it's part of an application | `lib/tracker/scam.ts` |
| Email composer | No server-side sending: emails open in the user's own mail app. With AI off, nothing goes to the AI provider. Applications and emails are covered by export and deletion | `app/(app)/apply`, `lib/email` |
| Referential ownership | Rows can only reference the user's own applications, CVs and emails (RLS with-check helpers) | migration `20261020000100`, `tests/unit/rls.test.ts` |
| Guest mode | Data stays in the browser (IndexedDB). Nothing is sent unless the user exports or migrates | `lib/repo/local.ts` |
| No dark patterns | No pre-ticked boxes, countdowns or fake scarcity. Destructive actions confirmed inline | UI |
| Processors | Supabase (DB and auth), Cloudflare (hosting), Anthropic (AI, only when used). Listed in the notice | privacy page |
| Location | Country is a suggestion from Cloudflare's `cf-ipcountry` header or Accept-Language, kept as a cookie hint, always overridable. The IP is not stored | `app/api/geo`, `lib/geo.ts` |

## Before launch (not yet done)

- Data Processing Agreements with Supabase, Cloudflare and Anthropic. Pick the EU region for Supabase if most users are EU or UK.
- Record of processing activities (GDPR Art. 30) and a short DPIA covering AI CV parsing.
- Named grievance officer contact for DPDP (India) on the privacy page.
- Breach notification runbook (72 hours under GDPR).
- Retention rule for accounts inactive for a long period (proposal: warn at 24 months, delete at 25).
- Cookie notice is not needed today: only strictly necessary auth and preference cookies are set, with no analytics or advertising. Re-check when Phase 5 analytics arrives.
