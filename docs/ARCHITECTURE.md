# Architecture (plain English)

**Browser app (React + Vite)** talks directly to Supabase using only the public URL and publishable key. Because the browser is untrusted, _the app never decides who may see or do what_ — the screens just hide buttons. The database decides.

**Database (PostgreSQL + RLS)** holds all rules. Reading is filtered by row-level security; changing anything important is only possible through named functions (`submit_complaint`, `transition_complaint`, `assign_complaint`, …) that check the caller's identity and role, then change data and write history in one transaction.

**Edge Functions** are the only place the powerful service key exists. They handle actions that must create or alter _accounts_ (inviting a handler, suspending a user). Each one re-verifies from the database that the caller is an active admin before doing anything.

## Tables

`profiles` (role, suspension) · `organizations` · `organization_memberships` (handler scope) · `complaint_categories` (parent = category, child = subcategory) · `complaints` · `complaint_assignments` (one active per complaint) · `complaint_events` (timeline) · `complaint_comments` (visible updates) · `complaint_internal_notes` (staff only) · `complaint_attachments` · `audit_logs` · `status_transitions` (the lifecycle rules as data).

## Lifecycle

`submitted → under_review → in_progress ⇄ awaiting_complainant → resolved → closed`, plus `rejected`.

- Handler: review, progress, request info, resolve (needs summary), reject (needs reason), close.
- Complainant: answer an information request, or reopen a resolved case within 30 days — both require a message. Cannot resolve, close or reject.
- Admin: all handler transitions plus reopening closed (→ in_progress) and rejected (→ under_review) cases.

## Why these choices

- _Rules as data_ (`status_transitions`) so the lifecycle is reviewable in one place; a test fails if the UI's copy drifts from it.
- _Few dependencies_: React, React Router, supabase-js at runtime. Unit tests use Node's built-in runner, so no test framework is needed yet.
- _Organization model_: complaints carry an optional `organization_id` plus a free-text `organization_name`, so complaints about organizations not yet registered are still accepted.

## Deployment

Frontend: any static host with SPA rewrites (Vercel config included). Backend: a Supabase project; apply `supabase/migrations` in order, deploy the two functions, set `ALLOWED_ORIGIN` and `SITE_URL` secrets, configure Auth (email confirmation on, min password 10, rate limits, redirect URLs).
