# Complaint.com

A complaint management platform: complainants submit and track complaints; handlers work only on cases assigned to them; administrators provision staff and assign cases. React + TypeScript + Vite on Supabase (Auth, PostgreSQL with RLS, private Storage, Edge Functions).

> **Status: foundation, not production-ready.** See [docs/STATUS.md](docs/STATUS.md) for exactly what is verified and what is not, and [docs/SECURITY.md](docs/SECURITY.md) for the security model and open items.

## Setup

Requires Node.js ≥ 20.19 and npm.

```bash
npm install
cp .env.example .env.local      # set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (publishable/anon key ONLY)
npm run dev
```

Never put a service-role/secret key in any `VITE_*` variable — the client refuses to start if it detects one.

## Database

1. Create a Supabase project (use a **test** project for development; synthetic data only).
2. Apply `supabase/migrations/*.sql` in filename order (SQL editor or `supabase db push`), then optionally `supabase/seed.sql`.
3. Bootstrap the first administrator once (see [docs/SECURITY.md](docs/SECURITY.md#operating-the-first-admin)).
4. Auth settings: email confirmation on, minimum password length 10, rate limits, redirect URLs for `/sign-in`, `/reset-password`, `/staff/sign-in` (mirrors `supabase/config.toml`).
5. Deploy the functions: `supabase functions deploy invite-handler set-user-suspended`, and set secrets `ALLOWED_ORIGIN` (your site origin) and `SITE_URL`.

## Tests

| Command                                                     | What it runs                                                                                                                                                                                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                                  | Unit tests (validation, safe error messages, status-table/SQL drift check, key guard). No dependencies.                                                                                                                         |
| `npm run test:db`                                           | Applies the migrations to a **throwaway** local PostgreSQL (needs `psql` and `PGHOST/PGPORT/PGUSER`) with a stub of Supabase's auth/storage and runs 84 adversarial authorization assertions. Never point it at a real project. |
| `npm run typecheck`, `npm run lint`, `npm run format:check` | Static checks (also run in CI).                                                                                                                                                                                                 |

## Roles

Complainant (public sign-up), Handler and Administrator (never self-service; handlers are invited by an admin through an Edge Function). A handler sees only cases assigned to them or within an organization scope an admin granted.

## Deployment

Static hosting with SPA rewrites (`vercel.json` included) plus the Supabase project. Set the two `VITE_` variables in the host. Do not enable evidence uploads (`VITE_EVIDENCE_UPLOADS_ENABLED`) until storage policies are verified on the real project.

## Environment variables

| Variable                        | Where                               | Notes                            |
| ------------------------------- | ----------------------------------- | -------------------------------- |
| `VITE_SUPABASE_URL`             | frontend                            | public                           |
| `VITE_SUPABASE_ANON_KEY`        | frontend                            | publishable/anon key only        |
| `VITE_EVIDENCE_UPLOADS_ENABLED` | frontend                            | `false` by default               |
| `ALLOWED_ORIGIN`, `SITE_URL`    | Edge Function secrets               | CORS origin and invite redirect  |
| `SUPABASE_SERVICE_ROLE_KEY`     | Edge Functions only (auto-provided) | never in the browser or the repo |
