-- Adversarial authorization tests. Synthetic users only. Any FAIL aborts the run (ON_ERROR_STOP).
\set ON_ERROR_STOP on
\set QUIET on
\set alice  '00000000-0000-0000-0000-00000000a11c'
\set bob    '00000000-0000-0000-0000-0000000000b0'
\set hana   '00000000-0000-0000-0000-00000000ba7a'
\set hugo   '00000000-0000-0000-0000-00000000bac0'
\set ada    '00000000-0000-0000-0000-00000000ada0'
\set as_alice 'reset role; select t.login(:\'alice\'); set role authenticated;'
\set as_bob   'reset role; select t.login(:\'bob\'); set role authenticated;'
\set as_hana  'reset role; select t.login(:\'hana\'); set role authenticated;'
\set as_hugo  'reset role; select t.login(:\'hugo\'); set role authenticated;'
\set as_ada   'reset role; select t.login(:\'ada\'); set role authenticated;'
\set as_service 'reset role; select t.login(null); set role service_role;'
\set as_anon  'reset role; select t.login(null); set role anon;'
\set as_root  'reset role; select t.login(null);'

-- ===================================================== setup (as superuser = platform bootstrap)
:as_root
insert into auth.users (id, email, raw_user_meta_data) values
  (:'alice', 'alice@example.test', '{"full_name":"Alice Test"}'),
  (:'bob',   'bob@example.test',   '{"full_name":"Bob Test"}'),
  (:'hana',  'hana@example.test',  '{"full_name":"Hana Handler"}'),
  (:'hugo',  'hugo@example.test',  '{"full_name":"Hugo Handler"}'),
  (:'ada',   'ada@example.test',   '{"full_name":"Ada Admin"}');
-- hostile signup: user-controlled metadata tries to claim the admin role
insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000000ee', 'mallory@example.test',
        '{"role":"admin","app_role":"admin","is_admin":true,"full_name":"Mallory"}');
select t.assert((select role = 'complainant' from public.profiles where email = 'mallory@example.test'),
  'signup with role=admin in user metadata still yields complainant');
select t.assert((select count(*) = 6 and bool_and(role = 'complainant') from public.profiles),
  'all new accounts start as complainant');

-- bootstrap the first admin out-of-band (SQL editor / migration), as documented in README
update public.profiles set role = 'admin' where id = :'ada';
insert into public.organizations (name, type) values ('Org A', 'public_service'), ('Org B', 'consumer');
insert into public.complaint_categories (id, name) values ('00000000-0000-0000-0000-00000000c001', 'Cat');
insert into public.complaint_categories (id, parent_id, name)
values ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-00000000c001', 'Sub');
select id as org_a from public.organizations where name = 'Org A' \gset

-- ===================================================== privilege escalation
:as_alice
select t.throws(format('update public.profiles set role = %L where id = %L', 'admin', :'alice'), '42501',
  'complainant cannot set own role (column grant)');
select t.throws(format('update public.profiles set is_suspended = false where id = %L', :'alice'), '42501',
  'complainant cannot touch is_suspended');
select t.throws('insert into public.profiles (id, email, role) values (gen_random_uuid(), ''x@x.test'', ''admin'')', '42501',
  'complainant cannot insert profiles');
update public.profiles set full_name = 'Alice Renamed' where id = :'alice';
select t.assert((select full_name = 'Alice Renamed' from public.profiles where id = :'alice'), 'complainant can edit own name');
select t.assert(t.count('select 1 from public.profiles') = 1, 'complainant sees only own profile');
select t.throws('select public.provision_handler(gen_random_uuid(), gen_random_uuid(), ''assigned_only'', gen_random_uuid())', '42501',
  'complainant cannot call provision_handler');
select t.throws('select public.set_user_suspended(gen_random_uuid(), true, gen_random_uuid())', '42501',
  'complainant cannot call set_user_suspended');

-- defense in depth: even if a grant were mistakenly widened, the trigger still blocks end users
:as_root
grant update (role) on public.profiles to authenticated;
:as_alice
select t.throws(format('update public.profiles set role = %L where id = %L', 'admin', :'alice'), '42501',
  'trigger blocks role change even with a (mistaken) column grant');
:as_root
revoke update (role) on public.profiles from authenticated;

-- ===================================================== anonymous access
:as_anon
select t.throws('select * from public.complaints', '42501', 'anon cannot read complaints');
select t.throws('select * from public.profiles', '42501', 'anon cannot read profiles');
select t.throws('select public.submit_complaint(null,null,null,''x'',''x'',''x'',''x'')', '42501', 'anon cannot submit');

-- ===================================================== submission + isolation
:as_alice
select t.throws('insert into public.complaints (complainant_id, category_id, organization_name, title, description) values (gen_random_uuid(), gen_random_uuid(), ''x'', ''title'', ''description description'')', '42501',
  'no direct INSERT on complaints');
select id as c_alice, case_ref as ref_alice from public.submit_complaint(
  '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000c002', :'org_a', null,
  'Broken streetlight outside school', 'The streetlight has been broken for three weeks and it is unsafe.', 'Main Road') \gset
select t.assert(:'ref_alice' ~ '^CMP-[0-9]{4}-[0-9]{6}$', 'case reference has expected format: ' || :'ref_alice');
select t.assert(t.count('select 1 from public.complaints') = 1, 'alice sees her complaint');
select t.throws(format('update public.complaints set status = %L where id = %L', 'resolved', :'c_alice'), '42501',
  'complainant cannot UPDATE status directly');
select t.throws(format('update public.complaints set complainant_id = %L where id = %L', :'bob', :'c_alice'), '42501',
  'complainant cannot reassign ownership');
select t.throws('select public.submit_complaint(''00000000-0000-0000-0000-00000000c001'', null, null, ''Org'', ''abc'', ''too short'', null)', '23514',
  'server-side validation rejects short title/description');
select t.throws('select public.submit_complaint(gen_random_uuid(), null, null, ''Org'', ''A valid title'', ''A sufficiently long description.'', null)', '22023',
  'invalid category rejected');

:as_bob
select t.assert(t.count('select 1 from public.complaints') = 0, 'bob cannot see alice''s complaint');
select t.throws(format('select public.transition_complaint(%L, %L, %L)', :'c_alice', 'closed', 'x'), 'P0002',
  'bob cannot transition alice''s complaint (and learns nothing about it)');
select t.throws(format('select public.add_public_update(%L, %L)', :'c_alice', 'hi'), 'P0002', 'bob cannot post updates on alice''s case');

-- rate limit: alice has 1, add 4 more then the 6th must fail
:as_alice
do $$ begin for i in 1..4 loop
  perform public.submit_complaint('00000000-0000-0000-0000-00000000c001', null, null, 'Org ' || i,
    'Rate limit test ' || i, 'Synthetic description for rate limiting test number ' || i, null);
end loop; end $$;
select t.throws('select public.submit_complaint(''00000000-0000-0000-0000-00000000c001'', null, null, ''Org'', ''Sixth submission'', ''This one should be rate limited by the server.'', null)', '53400',
  'sixth submission within an hour is rate limited');

-- ===================================================== handler provisioning (service role path)
:as_service
select t.throws(format('select public.provision_handler(%L, %L, %L, %L)', :'hana', :'org_a', 'assigned_only', :'bob'), '42501',
  'provisioning with a non-admin actor is refused');
select public.provision_handler(:'hana', :'org_a', 'assigned_only', :'ada');
select public.provision_handler(:'hugo', :'org_a', 'assigned_only', :'ada');
:as_root
select t.assert((select role = 'handler' from public.profiles where id = :'hana'), 'admin-verified provisioning grants handler role');
select t.assert(exists (select 1 from public.audit_logs where action = 'staff.handler_provisioned'), 'provisioning is audited');

-- ===================================================== handler scope
:as_hana
select t.assert(t.count('select 1 from public.complaints') = 0, 'handler with no assignment sees NO complaints');
select t.throws(format('select public.transition_complaint(%L, %L, null)', :'c_alice', 'under_review'), 'P0002',
  'unassigned handler cannot transition a case');
select t.throws(format('select public.add_internal_note(%L, %L)', :'c_alice', 'peek'), 'P0002', 'unassigned handler cannot add notes');
select t.throws(format('update public.profiles set role = %L where id = %L', 'admin', :'hana'), '42501',
  'handler cannot promote self');
select t.throws('select public.provision_handler(gen_random_uuid(), gen_random_uuid(), ''assigned_only'', gen_random_uuid())', '42501',
  'handler cannot call provisioning');
select t.throws(format('select public.assign_complaint(%L, %L)', :'c_alice', :'hana'), '42501', 'handler cannot self-assign');
select t.throws(format('insert into public.complaint_assignments (complaint_id, handler_id, assigned_by) values (%L, %L, %L)', :'c_alice', :'hana', :'hana'), '42501',
  'handler cannot write assignments directly');
select t.throws('insert into public.organizations (name) values (''Evil Org'')', '42501', 'handler cannot create organizations');

-- ===================================================== admin assignment
:as_alice
select t.throws(format('select public.assign_complaint(%L, %L)', :'c_alice', :'hana'), '42501', 'complainant cannot assign');
:as_ada
select public.assign_complaint(:'c_alice', :'hana');
select t.throws(format('select public.assign_complaint(%L, %L)', :'c_alice', :'bob'), '22023', 'cannot assign to a non-handler');
select t.assert(t.count('select 1 from public.complaint_assignments') = 1, 'admin can read assignments');
select t.assert(t.count('select 1 from public.audit_logs') > 0, 'admin can read audit logs');

:as_hana
select t.assert(t.count(format('select 1 from public.complaints where id = %L', :'c_alice')) = 1, 'assigned handler sees the case');
select t.assert(t.count('select 1 from public.complaints') = 1, 'handler sees ONLY assigned cases (not alice''s other 4)');
:as_hugo
select t.assert(t.count('select 1 from public.complaints') = 0, 'other handler (not assigned) sees nothing');

-- ===================================================== lifecycle
:as_hana
select t.throws(format('select public.transition_complaint(%L, %L, %L, %L)', :'c_alice', 'resolved', 'done', 'fixed'), '42501',
  'invalid transition submitted -> resolved is refused');
select public.transition_complaint(:'c_alice', 'under_review', null);
select public.transition_complaint(:'c_alice', 'in_progress', null);
select t.throws(format('select public.transition_complaint(%L, %L, null)', :'c_alice', 'awaiting_complainant'), '22023',
  'requesting information requires a message');
select public.transition_complaint(:'c_alice', 'awaiting_complainant', 'Please send the exact location.');
select t.throws(format('select public.transition_complaint(%L, %L, %L)', :'c_alice', 'resolved', 'x'), '42501',
  'cannot resolve while awaiting complainant');

:as_bob
select t.throws(format('select public.transition_complaint(%L, %L, %L)', :'c_alice', 'in_progress', 'I am not alice'), 'P0002',
  'another complainant cannot answer an information request');
:as_alice
select t.throws(format('select public.transition_complaint(%L, %L, %L)', :'c_alice', 'closed', 'close it'), '42501',
  'complainant cannot close a case');
select t.throws(format('select public.transition_complaint(%L, %L, null)', :'c_alice', 'in_progress'), '22023',
  'complainant response requires a message');
select public.transition_complaint(:'c_alice', 'in_progress', 'It is at the junction of Main Road and 5th Street.');
select t.assert((select status = 'in_progress' from public.complaints where id = :'c_alice'), 'complainant response returns case to in_progress');
select t.assert(t.count(format('select 1 from public.complaint_comments where complaint_id = %L', :'c_alice')) = 1, 'response stored as a visible comment');

-- notes and updates
:as_hana
select public.add_internal_note(:'c_alice', 'INTERNAL: complainant has filed before; verify.');
select public.add_public_update(:'c_alice', 'A repair crew has been scheduled.');
select t.assert(t.count(format('select 1 from public.complaint_internal_notes where complaint_id = %L', :'c_alice')) = 1, 'handler can read internal notes');
:as_alice
select t.assert(t.count('select 1 from public.complaint_internal_notes') = 0, 'complainant cannot read internal notes');
select t.assert(t.count(format('select 1 from public.complaint_events where complaint_id = %L and event_type in (''internal_note'',''assigned'')', :'c_alice')) = 0,
  'complainant cannot see internal-note or assignment events');
select t.assert(t.count(format('select 1 from public.complaint_comments where complaint_id = %L and author_role = ''handler''', :'c_alice')) = 1,
  'complainant sees handler public update');
select t.throws(format('select public.add_internal_note(%L, %L)', :'c_alice', 'x'), 'P0002', 'complainant cannot add internal notes');
select t.throws('delete from public.complaint_internal_notes', '42501', 'no delete on notes');

-- resolution + reopen
:as_hana
select t.throws(format('select public.transition_complaint(%L, %L, %L)', :'c_alice', 'resolved', 'fixed'), '22023',
  'resolution requires a summary');
select public.transition_complaint(:'c_alice', 'resolved', 'Streetlight replaced.', 'Streetlight replaced on 20 Oct.');
:as_alice
select t.assert((select resolution_summary is not null from public.complaints where id = :'c_alice'), 'resolution summary recorded and visible');
:as_root
update public.complaints set resolved_at = now() - interval '40 days' where id = :'c_alice';
:as_alice
select t.throws(format('select public.transition_complaint(%L, %L, %L)', :'c_alice', 'in_progress', 'still broken'), '42501',
  'reopening after the 30-day window is refused');
:as_root
update public.complaints set resolved_at = now() - interval '2 days' where id = :'c_alice';
:as_alice
select public.transition_complaint(:'c_alice', 'in_progress', 'The light failed again.');
select t.assert((select status = 'in_progress' and resolution_summary is null from public.complaints where id = :'c_alice'), 'complainant can reopen within window');

-- ===================================================== reassignment and suspension
:as_ada
select public.assign_complaint(:'c_alice', :'hugo');
:as_hana
select t.assert(t.count('select 1 from public.complaints') = 0, 'reassignment immediately removes previous handler''s access');
:as_hugo
select t.assert(t.count('select 1 from public.complaints') = 1, 'new handler gains access');
:as_service
select public.set_user_suspended(:'hugo', true, :'ada');
:as_hugo
select t.assert(t.count('select 1 from public.complaints') = 0, 'suspended handler loses access');
select t.throws(format('select public.transition_complaint(%L, %L, null)', :'c_alice', 'under_review'), '42501', 'suspended handler cannot act');
:as_service
select t.throws(format('select public.set_user_suspended(%L, true, %L)', :'ada', :'ada'), '22023', 'admin cannot suspend self');

-- ===================================================== admin-only data
:as_alice
select t.assert(t.count('select 1 from public.audit_logs') = 0, 'complainant cannot read audit logs');
select t.throws('insert into public.complaint_categories (name) values (''Evil'')', '42501', 'complainant cannot create categories');
:as_ada
insert into public.complaint_categories (name) values ('Admin created');
select t.assert(t.count('select 1 from public.audit_logs where action like ''complaint_categories.%''') >= 1, 'category changes are audited');
:as_root
select t.throws('update public.audit_logs set action = ''tampered''', '42501', 'audit log is append-only');
select t.throws('delete from public.complaint_events', '42501', 'event history is append-only');

-- ===================================================== evidence storage
:as_root
insert into storage.buckets (id, name, public) values ('evidence', 'evidence', false);
\i migrations/20261020000004_storage.sql
:as_alice
select format('%s/%s-photo.png', :'c_alice', gen_random_uuid()) as good_path \gset
select t.assert(true, 'storage migration applied');
insert into storage.objects (bucket_id, name, owner) values ('evidence', :'good_path', :'alice');
select t.assert(t.count(format('select 1 from storage.objects where name = %L', :'good_path')) = 1, 'owner can upload and read own evidence');
select t.throws(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'evidence', :'c_alice' || '/../../x'), '42501',
  'path traversal / malformed path rejected');
select t.throws(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'evidence', 'not-a-uuid/' || gen_random_uuid() || '-x.png'), '42501',
  'path without a complaint folder rejected');
select t.assert(public.register_attachment(:'c_alice', :'good_path', 'photo.png', 'image/png', 1000) is not null, 'owner can register attachment metadata');
select t.throws(format('select public.register_attachment(%L, %L, %L, %L, %s)', :'c_alice', :'good_path', 'x.exe', 'application/x-msdownload', 10), '23514',
  'disallowed mime type rejected');

:as_bob
select t.assert(t.count('select 1 from storage.objects') = 0, 'other complainant cannot read evidence');
select t.throws(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'evidence', :'c_alice' || '/' || gen_random_uuid() || '-evil.png'), '42501',
  'other complainant cannot upload into alice''s case folder');
select t.throws(format('select public.register_attachment(%L, %L, %L, %L, %s)', :'c_alice', :'good_path', 'p.png', 'image/png', 10), 'P0002',
  'other complainant cannot register attachment on alice''s case');
:as_hana
select t.assert(t.count('select 1 from storage.objects') = 0, 'handler not on the case cannot read evidence');
:as_ada
select t.assert(t.count('select 1 from storage.objects') = 1, 'admin can read evidence');
select t.throws(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'evidence', :'c_alice' || '/' || gen_random_uuid() || '-a.png'), '42501',
  'admin cannot upload as complainant');
:as_root
update public.complaint_attachments set status = 'quarantined';
:as_alice
select t.assert(t.count('select 1 from storage.objects') = 0, 'quarantined evidence is no longer readable');
:as_root
select t.assert(true, 'ALL SECURITY TESTS COMPLETED');
