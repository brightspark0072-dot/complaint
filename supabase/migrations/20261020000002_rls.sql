-- Complaint.com — authorization helpers, grants and Row Level Security.
-- Principle: deny by default. `authenticated` can SELECT what policies allow; every write
-- to complaint data goes through a SECURITY DEFINER function in 0003.

-- ---------------------------------------------------------------- helpers
-- SECURITY DEFINER so they can read profiles/assignments without recursing through RLS.
create function public.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and not p.is_suspended);
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and not p.is_suspended
  );
$$;

create function public.is_handler() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'handler' and not p.is_suspended
  );
$$;

-- A handler may handle a case if it is actively assigned to them, or if they hold an
-- organization-wide membership for the complaint's organization. Being a handler alone grants nothing.
create function public.can_handle_complaint(p_complaint uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_handler() and (
    exists (
      select 1 from public.complaint_assignments a
      where a.complaint_id = p_complaint and a.handler_id = auth.uid() and a.unassigned_at is null
    )
    or exists (
      select 1 from public.complaints c
      join public.organization_memberships m on m.organization_id = c.organization_id
      where c.id = p_complaint and m.user_id = auth.uid() and m.scope = 'organization'
    )
  );
$$;

create function public.owns_complaint(p_complaint uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and exists (
    select 1 from public.complaints c where c.id = p_complaint and c.complainant_id = auth.uid()
  );
$$;

create function public.can_view_complaint(p_complaint uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.owns_complaint(p_complaint) or public.is_admin() or public.can_handle_complaint(p_complaint);
$$;

-- ---------------------------------------------------------------- privilege baseline
-- Start from nothing, then grant narrowly. (Supabase grants broad default privileges on public.)
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

grant usage on schema public to authenticated;

grant select on
  public.profiles, public.organizations, public.organization_memberships,
  public.complaint_categories, public.complaints, public.complaint_assignments,
  public.complaint_events, public.complaint_comments, public.complaint_internal_notes,
  public.complaint_attachments, public.audit_logs
to authenticated;

-- Users may edit only these two columns of their own profile (role etc. are NOT grantable).
grant update (full_name, phone) on public.profiles to authenticated;

-- Admin-managed reference data (policies below restrict to admins).
grant insert, update on public.organizations, public.complaint_categories to authenticated;
grant insert, update, delete on public.organization_memberships to authenticated;
grant select on public.status_transitions to authenticated;

grant execute on function
  public.is_active_user(), public.is_admin(), public.is_handler(),
  public.can_handle_complaint(uuid), public.owns_complaint(uuid), public.can_view_complaint(uuid)
to authenticated;

-- ---------------------------------------------------------------- enable RLS everywhere
alter table public.profiles                  enable row level security;
alter table public.organizations             enable row level security;
alter table public.organization_memberships  enable row level security;
alter table public.complaint_categories      enable row level security;
alter table public.complaints                enable row level security;
alter table public.complaint_assignments     enable row level security;
alter table public.complaint_events          enable row level security;
alter table public.complaint_comments        enable row level security;
alter table public.complaint_internal_notes  enable row level security;
alter table public.complaint_attachments     enable row level security;
alter table public.audit_logs                enable row level security;
alter table public.status_transitions        enable row level security;

-- ---------------------------------------------------------------- policies
-- profiles
create policy profiles_select_own   on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_select_admin on public.profiles for select to authenticated using (public.is_admin());
create policy profiles_update_own   on public.profiles for update to authenticated
  using (id = auth.uid() and not is_suspended) with check (id = auth.uid());

-- reference data: readable by any signed-in user (needed by the submission form)
create policy orgs_select on public.organizations for select to authenticated using (is_active or public.is_admin());
create policy orgs_admin_insert on public.organizations for insert to authenticated with check (public.is_admin());
create policy orgs_admin_update on public.organizations for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy cats_select on public.complaint_categories for select to authenticated using (is_active or public.is_admin());
create policy cats_admin_insert on public.complaint_categories for insert to authenticated with check (public.is_admin());
create policy cats_admin_update on public.complaint_categories for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy transitions_select on public.status_transitions for select to authenticated using (true);

-- memberships: own rows readable; only admins manage
create policy memberships_select_own on public.organization_memberships for select to authenticated using (user_id = auth.uid());
create policy memberships_select_admin on public.organization_memberships for select to authenticated using (public.is_admin());
create policy memberships_admin_write on public.organization_memberships for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- complaints: owner, admin, or a handler within scope. No insert/update/delete policies => writes denied.
create policy complaints_select on public.complaints for select to authenticated
  using (
    (complainant_id = auth.uid() and public.is_active_user())
    or public.is_admin()
    or public.can_handle_complaint(id)
  );

-- assignments: staff involved and admins (complainants do not see handler identity)
create policy assignments_select_admin on public.complaint_assignments for select to authenticated using (public.is_admin());
create policy assignments_select_handler on public.complaint_assignments for select to authenticated
  using (handler_id = auth.uid() and public.is_handler());

-- events: owner sees only complainant-visible events; staff in scope see all
create policy events_select_owner on public.complaint_events for select to authenticated
  using (visible_to_complainant and public.owns_complaint(complaint_id));
create policy events_select_staff on public.complaint_events for select to authenticated
  using (public.is_admin() or public.can_handle_complaint(complaint_id));

-- public comments: anyone who can view the case
create policy comments_select on public.complaint_comments for select to authenticated
  using (public.can_view_complaint(complaint_id));

-- internal notes: staff only. Authors do not get to read other handlers' notes unless in scope of the case.
create policy notes_select_staff on public.complaint_internal_notes for select to authenticated
  using (public.is_admin() or public.can_handle_complaint(complaint_id));

-- attachments metadata
create policy attachments_select on public.complaint_attachments for select to authenticated
  using (public.can_view_complaint(complaint_id));

-- audit log: admins only
create policy audit_select_admin on public.audit_logs for select to authenticated using (public.is_admin());
