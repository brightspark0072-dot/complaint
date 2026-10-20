-- Complaint.com — private evidence bucket and storage policies.
-- Object path convention: <complaint_uuid>/<random_uuid>-<safe_name>
-- The bucket is PRIVATE: there are no public URLs. Downloads use short-lived signed URLs,
-- and createSignedUrl itself is subject to the SELECT policy below.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence', 'evidence', false, 10485760,
        array['image/jpeg','image/png','image/webp','application/pdf','text/plain'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Returns the complaint id encoded in a well-formed evidence path, else NULL.
-- Doing the regex check first avoids uuid-cast errors on hostile paths.
create function public.evidence_complaint_id(p_name text) returns uuid
language sql immutable set search_path = '' as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9._-]{1,100}$'
    then split_part(p_name, '/', 1)::uuid
  end;
$$;

create function public.can_upload_evidence(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.evidence_complaint_id(p_name) is not null
     and public.owns_complaint(public.evidence_complaint_id(p_name));
$$;

create function public.can_read_evidence(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.evidence_complaint_id(p_name) is not null
     and public.can_view_complaint(public.evidence_complaint_id(p_name))
     and not exists (select 1 from public.complaint_attachments a
                     where a.storage_path = p_name and a.status = 'quarantined');
$$;

revoke all on function public.evidence_complaint_id(text), public.can_upload_evidence(text), public.can_read_evidence(text)
  from public, anon, authenticated;
grant execute on function public.evidence_complaint_id(text), public.can_upload_evidence(text), public.can_read_evidence(text)
  to authenticated;

-- Only the complaint owner may upload; staff in scope and the owner may read. No update/delete for end users
-- (retention and deletion are handled by service-role jobs; see docs/SECURITY.md).
create policy evidence_insert_owner on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence' and public.can_upload_evidence(name));

create policy evidence_select_authorized on storage.objects for select to authenticated
  using (bucket_id = 'evidence' and public.can_read_evidence(name));
