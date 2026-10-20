# Security model and known limitations

This is **not** a claim that the system is production-secure. It records what is enforced, how it was tested, and what remains.

## Enforcement layers

1. **Roles live in `public.profiles.role`**, set only by (a) the signup trigger (always `complainant`) and (b) service-role functions called by Edge Functions after they verify the caller is an active admin. User metadata is never read for authorization.
2. **Grants**: `authenticated` has `SELECT` on most tables and may `UPDATE` only `profiles(full_name, phone)`. It has no `INSERT/UPDATE/DELETE` on complaint data. Defaults are revoked in `…0002`.
3. **RLS** on every table; helper functions (`is_admin`, `can_handle_complaint`, …) are `SECURITY DEFINER` with `search_path = ''`.
4. **Writes go through RPC functions** that re-derive the caller from `auth.uid()`, lock the row, and check the transition table. Unauthorized callers get "not found" so case existence is not disclosed.
5. **Defense in depth**: a trigger blocks end users from changing `role`, `is_suspended`, `email`, `id` even if a grant were widened (tested).
6. **Append-only** history: `complaint_events`, `complaint_comments`, `complaint_internal_notes`, `audit_logs` reject UPDATE/DELETE (tested).
7. **Storage**: private bucket, 10 MB, MIME allow-list, strict `<complaint_uuid>/<uuid>-<name>` path pattern validated before any cast; owner-only upload; signed URLs of 60 s.

## Operating the first admin

There is deliberately no UI path to create an administrator. Bootstrap once, from the Supabase SQL editor (which runs as a privileged role where `auth.uid()` is null):

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

## Known limitations / open items

- **Not verified against a live Supabase project.** The tests use a stub of `auth` and `storage`; real Supabase adds platform behaviour (e.g. default privileges, storage internals) that must be re-tested after deployment.
- **Evidence uploads are off** (`VITE_EVIDENCE_UPLOADS_ENABLED=false`). Enable only after the storage migration is applied and re-tested on the real project.
- **Malware scanning is not implemented.** Files are stored as `pending_scan`; handlers can open them. Add a scanner (e.g. a storage-webhook Edge Function calling a scanning service) that flips status to `available` or `quarantined` (quarantined files are already blocked by policy) before opening evidence to staff.
- **Retention/deletion**: append-only history prevents `ON DELETE CASCADE` of events. Account deletion should be implemented as anonymisation of `profiles` plus removal of storage objects by a service-role job, after a retention policy is defined by legal counsel.
- **Organization-scoped handlers** (`scope = 'organization'`) see every case for that organization, including cases created later. Use sparingly.
- **Rate limiting**: submissions are limited in SQL (5/hour/user). Sign-in, sign-up and email limits rely on Supabase Auth rate limits (`config.toml`) — verify they are set on the hosted project. No CAPTCHA yet; add Supabase's CAPTCHA integration if abuse appears.
- **Edge Functions** read `ALLOWED_ORIGIN` and `SITE_URL` secrets; unset means CORS is denied. `SUPABASE_SERVICE_ROLE_KEY` is supplied by the platform and must never appear in any `VITE_*` variable (the client refuses to start if it does).
- **Privacy/Terms pages are placeholders** needing legal review. No public complaint pages exist by design until a redaction/moderation/disclosure policy is written.
- Suspending a user ends their live sessions via the Edge Function; access tokens already issued remain valid until expiry (≤1 h), but RLS checks `is_suspended` on every query so data access stops immediately.
