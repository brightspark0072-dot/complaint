-- Complaint.com — transactional write paths.
-- All are SECURITY DEFINER with an empty search_path and re-check authorization themselves.
-- The caller's identity is ALWAYS auth.uid(); no function accepts a user id from the client
-- except where noted (service_role only).

create function public.write_audit(p_actor uuid, p_action text, p_type text, p_target text, p_meta jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (p_actor, p_action, p_type, p_target, coalesce(p_meta, '{}'::jsonb));
$$;
revoke all on function public.write_audit(uuid, text, text, text, jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------ submit_complaint
create function public.submit_complaint(
  p_category_id uuid,
  p_subcategory_id uuid,
  p_organization_id uuid,
  p_organization_name text,
  p_title text,
  p_description text,
  p_location text
) returns table (id uuid, case_ref text)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_org_name text := btrim(coalesce(p_organization_name, ''));
  v_complaint public.complaints;
begin
  if v_uid is null or not public.is_active_user() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- anti-abuse: at most 5 submissions per rolling hour per account
  if (select count(*) from public.complaints c
      where c.complainant_id = v_uid and c.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'rate limit exceeded: try again later' using errcode = '53400';
  end if;

  if not exists (select 1 from public.complaint_categories c
                 where c.id = p_category_id and c.parent_id is null and c.is_active) then
    raise exception 'invalid category' using errcode = '22023';
  end if;
  if p_subcategory_id is not null and not exists (
       select 1 from public.complaint_categories c
       where c.id = p_subcategory_id and c.parent_id = p_category_id and c.is_active) then
    raise exception 'invalid subcategory' using errcode = '22023';
  end if;

  if p_organization_id is not null then
    select o.name into v_org_name from public.organizations o where o.id = p_organization_id and o.is_active;
    if v_org_name is null then
      raise exception 'invalid organization' using errcode = '22023';
    end if;
  end if;

  -- table CHECK constraints enforce length bounds; trim first so whitespace cannot satisfy them
  insert into public.complaints
    (complainant_id, category_id, subcategory_id, organization_id, organization_name, title, description, location)
  values
    (v_uid, p_category_id, p_subcategory_id, p_organization_id, v_org_name,
     btrim(p_title), btrim(p_description), nullif(btrim(coalesce(p_location, '')), ''))
  returning * into v_complaint;

  insert into public.complaint_events (complaint_id, actor_id, event_type, to_status, message)
  values (v_complaint.id, v_uid, 'submitted', 'submitted', 'Complaint submitted.');
  perform public.write_audit(v_uid, 'complaint.submitted', 'complaint', v_complaint.id::text,
                             jsonb_build_object('case_ref', v_complaint.case_ref));

  return query select v_complaint.id, v_complaint.case_ref;
end $$;

-- ------------------------------------------------------------ transition_complaint
create function public.transition_complaint(
  p_complaint_id uuid,
  p_to public.complaint_status,
  p_message text default null,
  p_resolution text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_role public.app_role;
  v_actor_role public.app_role;
  v_c public.complaints;
  v_rule public.status_transitions;
  v_msg text := nullif(btrim(coalesce(p_message, '')), '');
begin
  select p.role into v_role from public.profiles p where p.id = v_uid and not p.is_suspended;
  if v_role is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into v_c from public.complaints c where c.id = p_complaint_id for update;
  if not found then
    raise exception 'complaint not found' using errcode = 'P0002';
  end if;

  -- Determine which capacity the caller acts in for THIS complaint.
  if v_role = 'admin' then
    v_actor_role := 'admin';
  elsif v_role = 'handler' and public.can_handle_complaint(p_complaint_id) then
    v_actor_role := 'handler';
  elsif v_c.complainant_id = v_uid then
    v_actor_role := 'complainant';
  else
    -- do not reveal whether the case exists
    raise exception 'complaint not found' using errcode = 'P0002';
  end if;

  select * into v_rule from public.status_transitions t
   where t.from_status = v_c.status and t.to_status = p_to and t.actor_role = v_actor_role;
  if not found then
    raise exception 'transition % -> % is not allowed for %', v_c.status, p_to, v_actor_role using errcode = '42501';
  end if;
  if v_rule.requires_message and v_msg is null then
    raise exception 'a message is required for this transition' using errcode = '22023';
  end if;
  -- complainants may only reopen within 30 days of resolution
  if v_actor_role = 'complainant' and v_c.status = 'resolved'
     and v_c.resolved_at < now() - interval '30 days' then
    raise exception 'the reopening window has passed' using errcode = '42501';
  end if;
  if p_to = 'resolved' and nullif(btrim(coalesce(p_resolution, '')), '') is null then
    raise exception 'a resolution summary is required' using errcode = '22023';
  end if;

  update public.complaints c set
    status = p_to,
    resolved_at = case when p_to = 'resolved' then now()
                       when p_to in ('in_progress','under_review') then null
                       else c.resolved_at end,
    resolution_summary = case when p_to = 'resolved' then btrim(p_resolution)
                              when p_to in ('in_progress','under_review') then null
                              else c.resolution_summary end
  where c.id = p_complaint_id;

  insert into public.complaint_events (complaint_id, actor_id, event_type, from_status, to_status, message)
  values (p_complaint_id, v_uid,
          case when v_actor_role = 'complainant' then 'complainant_response' else 'status_changed' end,
          v_c.status, p_to, v_msg);

  if v_actor_role = 'complainant' and v_msg is not null then
    insert into public.complaint_comments (complaint_id, author_id, author_role, body)
    values (p_complaint_id, v_uid, 'complainant', v_msg);
  end if;

  perform public.write_audit(v_uid, 'complaint.status_changed', 'complaint', p_complaint_id::text,
    jsonb_build_object('from', v_c.status, 'to', p_to, 'as', v_actor_role));
end $$;

-- ------------------------------------------------------------ comments / notes
create function public.add_public_update(p_complaint_id uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
begin
  if not (public.is_admin() or public.can_handle_complaint(p_complaint_id)) then
    raise exception 'complaint not found' using errcode = 'P0002';
  end if;
  insert into public.complaint_comments (complaint_id, author_id, author_role, body)
  values (p_complaint_id, v_uid, (select p.role from public.profiles p where p.id = v_uid), v_body);
  insert into public.complaint_events (complaint_id, actor_id, event_type, message)
  values (p_complaint_id, v_uid, 'public_update', v_body);
end $$;

create function public.add_internal_note(p_complaint_id uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
begin
  if not (public.is_admin() or public.can_handle_complaint(p_complaint_id)) then
    raise exception 'complaint not found' using errcode = 'P0002';
  end if;
  insert into public.complaint_internal_notes (complaint_id, author_id, body)
  values (p_complaint_id, v_uid, v_body);
  -- the event records THAT a note exists, never its content, and is hidden from the complainant
  insert into public.complaint_events (complaint_id, actor_id, event_type, visible_to_complainant)
  values (p_complaint_id, v_uid, 'internal_note', false);
end $$;

-- ------------------------------------------------------------ assignment (admin only)
create function public.assign_complaint(p_complaint_id uuid, p_handler_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p
                 where p.id = p_handler_id and p.role = 'handler' and not p.is_suspended) then
    raise exception 'target is not an active handler' using errcode = '22023';
  end if;
  perform 1 from public.complaints c where c.id = p_complaint_id for update;
  if not found then
    raise exception 'complaint not found' using errcode = 'P0002';
  end if;

  update public.complaint_assignments a set unassigned_at = now()
   where a.complaint_id = p_complaint_id and a.unassigned_at is null;
  insert into public.complaint_assignments (complaint_id, handler_id, assigned_by)
  values (p_complaint_id, p_handler_id, v_uid);
  insert into public.complaint_events (complaint_id, actor_id, event_type, visible_to_complainant, message)
  values (p_complaint_id, v_uid, 'assigned', false, 'Case assigned to a handler.');
  perform public.write_audit(v_uid, 'complaint.assigned', 'complaint', p_complaint_id::text,
                             jsonb_build_object('handler_id', p_handler_id));
end $$;

-- ------------------------------------------------------------ attachments metadata
-- The object must already exist in storage under the caller's complaint folder (storage policy enforces
-- who may upload). This registers metadata; status starts as pending_scan.
create function public.register_attachment(
  p_complaint_id uuid, p_storage_path text, p_original_name text, p_mime_type text, p_size_bytes integer
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.owns_complaint(p_complaint_id) then
    raise exception 'complaint not found' using errcode = 'P0002';
  end if;
  if split_part(p_storage_path, '/', 1) <> p_complaint_id::text then
    raise exception 'invalid storage path' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'evidence' and o.name = p_storage_path) then
    raise exception 'object not found' using errcode = 'P0002';
  end if;
  if (select count(*) from public.complaint_attachments a where a.complaint_id = p_complaint_id) >= 10 then
    raise exception 'attachment limit reached' using errcode = '53400';
  end if;
  insert into public.complaint_attachments
    (complaint_id, uploader_id, storage_path, original_name, mime_type, size_bytes)
  values (p_complaint_id, auth.uid(), p_storage_path, left(p_original_name, 200), p_mime_type, p_size_bytes)
  returning complaint_attachments.id into v_id;
  insert into public.complaint_events (complaint_id, actor_id, event_type, message)
  values (p_complaint_id, auth.uid(), 'attachment_added', left(p_original_name, 200));
  return v_id;
end $$;

-- ------------------------------------------------------------ service_role only (called from Edge Functions
-- AFTER they have verified the caller is an active admin from the JWT). auth.uid() is null here, so the
-- profile-protection trigger permits these changes.
create function public.provision_handler(p_user uuid, p_org uuid, p_scope public.membership_scope, p_actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin' and not is_suspended) then
    raise exception 'actor is not an active admin' using errcode = '42501';
  end if;
  update public.profiles set role = 'handler' where id = p_user and role = 'complainant';
  if not found then
    raise exception 'user must exist and currently be a complainant' using errcode = '22023';
  end if;
  insert into public.organization_memberships (user_id, organization_id, scope)
  values (p_user, p_org, p_scope)
  on conflict (user_id, organization_id) do update set scope = excluded.scope;
  perform public.write_audit(p_actor, 'staff.handler_provisioned', 'profile', p_user::text,
                             jsonb_build_object('organization_id', p_org, 'scope', p_scope));
end $$;

create function public.set_user_suspended(p_user uuid, p_suspended boolean, p_actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin' and not is_suspended) then
    raise exception 'actor is not an active admin' using errcode = '42501';
  end if;
  if p_user = p_actor then
    raise exception 'admins cannot suspend themselves' using errcode = '22023';
  end if;
  update public.profiles set is_suspended = p_suspended where id = p_user;
  if p_suspended then
    -- release their cases so they can be reassigned
    update public.complaint_assignments set unassigned_at = now()
     where handler_id = p_user and unassigned_at is null;
  end if;
  perform public.write_audit(p_actor, case when p_suspended then 'staff.suspended' else 'staff.reinstated' end,
                             'profile', p_user::text, '{}'::jsonb);
end $$;

-- ------------------------------------------------------------ audit triggers for admin-managed reference data
create function public.audit_reference_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.write_audit(auth.uid(), lower(tg_table_name || '.' || tg_op), tg_table_name,
                             (to_jsonb(new) ->> 'id'), jsonb_build_object('row', to_jsonb(new)));
  return new;
end $$;
create trigger orgs_audit after insert or update on public.organizations
  for each row execute function public.audit_reference_change();
create trigger cats_audit after insert or update on public.complaint_categories
  for each row execute function public.audit_reference_change();
create trigger memberships_audit after insert or update on public.organization_memberships
  for each row execute function public.audit_reference_change();

-- ------------------------------------------------------------ grants
revoke all on function
  public.submit_complaint(uuid, uuid, uuid, text, text, text, text),
  public.transition_complaint(uuid, public.complaint_status, text, text),
  public.add_public_update(uuid, text),
  public.add_internal_note(uuid, text),
  public.assign_complaint(uuid, uuid),
  public.register_attachment(uuid, text, text, text, integer),
  public.provision_handler(uuid, uuid, public.membership_scope, uuid),
  public.set_user_suspended(uuid, boolean, uuid)
from public, anon, authenticated;

grant execute on function
  public.submit_complaint(uuid, uuid, uuid, text, text, text, text),
  public.transition_complaint(uuid, public.complaint_status, text, text),
  public.add_public_update(uuid, text),
  public.add_internal_note(uuid, text),
  public.assign_complaint(uuid, uuid),
  public.register_attachment(uuid, text, text, text, integer)
to authenticated;

grant execute on function
  public.provision_handler(uuid, uuid, public.membership_scope, uuid),
  public.set_user_suspended(uuid, boolean, uuid)
to service_role;
