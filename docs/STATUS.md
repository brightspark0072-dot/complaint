# Project status

Last updated: 2026-10-20. Legend: ✅ done and verified · 🟡 written, **not yet verified** · ⛔ blocked · ⬜ not started

## Verification environment (what was and was not possible)

| Item                                           | State                                                                                                                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm install` / build / lint / Vite dev server | ⛔ The build sandbox's egress policy denied `registry.npmjs.org` (HTTP 403 on CONNECT). No dependency was installed, so **the React app has never been compiled or run**. |
| GitHub repository                              | ⛔ No `complaint-com` repo existed, and the sandbox cannot create repositories (only attach existing ones). Nothing has been pushed.                                      |
| Live Supabase project                          | ⛔ No credentials/project available. Auth flows, Edge Functions and real Storage are untested.                                                                            |
| PostgreSQL migrations + RLS                    | ✅ Applied to a throwaway local PostgreSQL 16 with a stub of Supabase's `auth`/`storage` schemas.                                                                         |

## Milestone 1 — Repository and foundation

- ✅ Project layout, `.gitignore` (env files, node_modules, build output), `.env.example`, Prettier config
- ✅ Dependency-free unit tests (`npm test`, Node's built-in runner): 19 passing
- 🟡 Vite + React 19 + TypeScript config, ESLint flat config, CI workflow (versions are caret ranges chosen from memory — **not checked against the registry**; run `npm install` and review)
- ⛔ GitHub repo creation, push

## Milestone 2 — Database and authentication

- ✅ Schema, enums, constraints, indexes (`supabase/migrations/…0001`)
- ✅ Helper functions, grants, RLS policies (`…0002`)
- ✅ Signup trigger always assigns `complainant` and ignores user metadata
- ✅ 84 security assertions pass, and 3 deliberate regressions were each caught (see `supabase/tests/`)
- 🟡 Supabase Auth wiring (sign-up, sign-in, confirmation, recovery, sign-out) — code written, untested against a live project
- 🟡 `supabase/config.toml` key names should be checked against your CLI version

## Milestone 3 — Complaint lifecycle

- ✅ `submit_complaint` (server validation, 5/hour rate limit), `transition_complaint` (data-driven state machine), public updates, internal notes, assignment — all tested in SQL
- 🟡 UI: submission, tracking, case view with role-specific actions, handler queue — written, never rendered

## Milestone 4 — Administrator and evidence workflows

- ✅ Storage bucket + policies (private, 10 MB, MIME allow-list, path pattern) tested in SQL against a stub `storage.objects`
- 🟡 Edge Functions `invite-handler`, `set-user-suspended` — written, never deployed or run (Deno)
- 🟡 Admin UI: assignment, staff invite/suspend, audit log
- ⬜ Organization / category management UI (admins can already write these tables via RLS; no screen yet)
- ⬜ Malware scanning, retention and deletion jobs (designed in docs/SECURITY.md only)
- ⬜ Account-deletion request flow (needs a retention policy)

## Milestone 5 — Quality and deployment

- ⬜ Component and end-to-end tests (registration, confirmation, recovery, session expiry, responsive checks) — need a live Supabase test project
- ⬜ Accessibility audit with real tooling (the CSS follows contrast/focus/skip-link practice but was not measured)
- 🟡 CI workflow written, never run
- ⬜ Deployment (Vercel config provided, not deployed)
- ⬜ Pull requests / branch protection

## Requested tests vs. current coverage

| Required test                                                                 | Status                                                       |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Role escalation attempts (metadata, direct UPDATE, trigger)                   | ✅ SQL                                                       |
| Complainant reads another's case / updates status directly                    | ✅ SQL                                                       |
| Handler accesses unassigned case / changes own role                           | ✅ SQL                                                       |
| Admin invites handler                                                         | ✅ SQL (provisioning function) · ⬜ Edge Function end-to-end |
| Authorized / unauthorized evidence access                                     | ✅ SQL (policies, stub storage) · ⬜ real Storage            |
| Invalid status transitions                                                    | ✅ SQL + ✅ UI/SQL drift test                                |
| Registration, sign-in, email confirmation, recovery, session expiry, sign-out | ⛔ needs live Supabase                                       |
| Responsive UI and form validation                                             | ✅ validation unit tests · ⬜ responsive/browser tests       |
