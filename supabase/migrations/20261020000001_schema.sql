-- Complaint.com — core schema.
-- All writes to sensitive tables go through SECURITY DEFINER functions (see 0003).
-- Direct table privileges for `authenticated` are granted in 0002 (RLS) and are SELECT-only
-- except for the narrow profile column grant.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums
create type public.app_role as enum ('complainant', 'handler', 'admin');
create type public.org_type as enum ('public_service', 'consumer', 'education', 'workplace', 'other');
create type public.membership_scope as enum ('assigned_only', 'organization');
create type public.complaint_status as enum (
  'submitted', 'under_review', 'in_progress', 'awaiting_complainant',
  'resolved', 'closed', 'rejected'
);
create type public.attachment_status as enum ('pending_scan', 'available', 'quarantined');

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  full_name    text not null default '' check (char_length(full_name) <= 120),
  phone        text check (phone is null or char_length(phone) <= 30),
  role         public.app_role not null default 'complainant',
  is_suspended boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- organizations
create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 2 and 160),
  type       public.org_type not null default 'other',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (name, type)
);

create table public.organization_memberships (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  scope           public.membership_scope not null default 'assigned_only',
  created_at      timestamptz not null default now(),
  unique (user_id, organization_id)
);
create index on public.organization_memberships (user_id);

-- ---------------------------------------------------------------- categories (parent = category, child = subcategory)
create table public.complaint_categories (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references public.complaint_categories (id) on delete restrict,
  name       text not null check (char_length(name) between 2 and 120),
  org_type   public.org_type,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (parent_id, name)
);

-- ---------------------------------------------------------------- complaints
create sequence public.complaint_ref_seq start 1001;

create table public.complaints (
  id                  uuid primary key default gen_random_uuid(),
  case_ref            text not null unique
                      default ('CMP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.complaint_ref_seq')::text, 6, '0')),
  complainant_id      uuid not null references public.profiles (id) on delete restrict,
  category_id         uuid not null references public.complaint_categories (id),
  subcategory_id      uuid references public.complaint_categories (id),
  organization_id     uuid references public.organizations (id),
  organization_name   text not null check (char_length(organization_name) between 2 and 160),
  title               text not null check (char_length(title) between 5 and 120),
  description         text not null check (char_length(description) between 20 and 5000),
  location            text check (location is null or char_length(location) <= 160),
  status              public.complaint_status not null default 'submitted',
  resolution_summary  text check (resolution_summary is null or char_length(resolution_summary) <= 2000),
  resolved_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on public.complaints (complainant_id, created_at desc);
create index on public.complaints (status);
create index on public.complaints (organization_id);

create table public.complaint_assignments (
  id            uuid primary key default gen_random_uuid(),
  complaint_id  uuid not null references public.complaints (id) on delete cascade,
  handler_id    uuid not null references public.profiles (id),
  assigned_by   uuid not null references public.profiles (id),
  assigned_at   timestamptz not null default now(),
  unassigned_at timestamptz
);
-- at most one active assignment per complaint
create unique index complaint_one_active_assignment
  on public.complaint_assignments (complaint_id) where unassigned_at is null;
create index on public.complaint_assignments (handler_id) where unassigned_at is null;

-- Append-only activity history. visible_to_complainant controls what the owner may read.
create table public.complaint_events (
  id                      uuid primary key default gen_random_uuid(),
  complaint_id            uuid not null references public.complaints (id) on delete cascade,
  actor_id                uuid references public.profiles (id),
  event_type              text not null check (event_type in
                            ('submitted','status_changed','assigned','public_update','complainant_response','internal_note','attachment_added')),
  from_status             public.complaint_status,
  to_status               public.complaint_status,
  message                 text check (message is null or char_length(message) <= 2000),
  visible_to_complainant  boolean not null default true,
  created_at              timestamptz not null default now()
);
create index on public.complaint_events (complaint_id, created_at);

-- Public-facing comments (handler updates and complainant responses).
create table public.complaint_comments (
  id           uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  author_id    uuid not null references public.profiles (id),
  author_role  public.app_role not null,
  body         text not null check (char_length(body) between 1 and 2000),
  created_at   timestamptz not null default now()
);
create index on public.complaint_comments (complaint_id, created_at);

-- Internal notes: never readable by complainants.
create table public.complaint_internal_notes (
  id           uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  author_id    uuid not null references public.profiles (id),
  body         text not null check (char_length(body) between 1 and 4000),
  created_at   timestamptz not null default now()
);
create index on public.complaint_internal_notes (complaint_id, created_at);

create table public.complaint_attachments (
  id            uuid primary key default gen_random_uuid(),
  complaint_id  uuid not null references public.complaints (id) on delete cascade,
  uploader_id   uuid not null references public.profiles (id),
  storage_path  text not null unique,
  original_name text not null check (char_length(original_name) between 1 and 200),
  mime_type     text not null check (mime_type in ('image/jpeg','image/png','image/webp','application/pdf','text/plain')),
  size_bytes    integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  status        public.attachment_status not null default 'pending_scan',
  created_at    timestamptz not null default now()
);
create index on public.complaint_attachments (complaint_id);

create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  action      text not null,
  target_type text not null,
  target_id   text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index on public.audit_logs (created_at desc);
create index on public.audit_logs (actor_id);

-- Data-driven lifecycle. actor_role 'complainant' transitions additionally require ownership (enforced in function).
create table public.status_transitions (
  from_status public.complaint_status not null,
  to_status   public.complaint_status not null,
  actor_role  public.app_role not null,
  requires_message boolean not null default false,
  primary key (from_status, to_status, actor_role)
);

insert into public.status_transitions (from_status, to_status, actor_role, requires_message) values
  -- handler (must also be able to handle the case)
  ('submitted','under_review','handler',false),
  ('under_review','in_progress','handler',false),
  ('under_review','rejected','handler',true),
  ('in_progress','awaiting_complainant','handler',true),
  ('in_progress','resolved','handler',true),
  ('in_progress','rejected','handler',true),
  ('awaiting_complainant','in_progress','handler',false),
  ('resolved','closed','handler',false),
  -- complainant (owner only): respond to an information request, or reopen a resolved case
  ('awaiting_complainant','in_progress','complainant',true),
  ('resolved','in_progress','complainant',true),
  -- admin: everything a handler can do, plus reopening closed/rejected cases
  ('submitted','under_review','admin',false),
  ('under_review','in_progress','admin',false),
  ('under_review','rejected','admin',true),
  ('in_progress','awaiting_complainant','admin',true),
  ('in_progress','resolved','admin',true),
  ('in_progress','rejected','admin',true),
  ('awaiting_complainant','in_progress','admin',false),
  ('resolved','closed','admin',false),
  ('closed','in_progress','admin',true),
  ('rejected','under_review','admin',true);

-- ---------------------------------------------------------------- updated_at trigger
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger complaints_touch before update on public.complaints
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- new-user provisioning
-- ALWAYS 'complainant'. raw_user_meta_data is user-controlled and is never read for the role.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
    'complainant'
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Defense in depth: any attempt by an end user (auth.uid() is set) to change privileged
-- profile columns is rejected, even if a grant or policy were ever loosened by mistake.
-- Privileged changes run as service_role (auth.uid() is null) via the functions in 0003.
create function public.protect_profile_privileges() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and (
       new.role is distinct from old.role
    or new.is_suspended is distinct from old.is_suspended
    or new.id is distinct from old.id
    or new.email is distinct from old.email
  ) then
    raise exception 'protected profile fields cannot be changed' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- Append-only guard for history tables.
create function public.forbid_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end $$;

create trigger events_append_only before update or delete on public.complaint_events
  for each row execute function public.forbid_mutation();
create trigger audit_append_only before update or delete on public.audit_logs
  for each row execute function public.forbid_mutation();
create trigger notes_append_only before update or delete on public.complaint_internal_notes
  for each row execute function public.forbid_mutation();
create trigger comments_append_only before update or delete on public.complaint_comments
  for each row execute function public.forbid_mutation();
