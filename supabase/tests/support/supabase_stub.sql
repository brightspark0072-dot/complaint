-- TEST-ONLY stand-in for the parts of the Supabase platform our migrations depend on.
-- Never applied to a real Supabase project (those already provide roles, auth and storage).
-- Used by supabase/tests/run.sh against a throwaway local PostgreSQL.

-- roles are cluster-wide, so create them only if missing (lets the suite run repeatedly)
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Mirrors Supabase: reads the `sub` claim that PostgREST puts into the session from the verified JWT.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets (id),
  name text not null,
  owner uuid,
  created_at timestamptz not null default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert on storage.objects to authenticated;
grant all on storage.objects, storage.buckets to service_role;

-- test helpers
create schema t;
grant usage on schema t to public;
create function t.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), false) $$;
create function t.assert(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAIL: %', p_msg; end if;
  raise notice 'PASS: %', p_msg;
end $$;
-- runs p_sql as the CURRENT role and expects it to fail with the given SQLSTATE
create function t.throws(p_sql text, p_state text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_state then raise notice 'PASS: % (%)', p_msg, sqlerrm; return; end if;
    raise exception 'FAIL: % — expected %, got % (%)', p_msg, p_state, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL: % — statement succeeded but should have been denied', p_msg;
end $$;
create function t.count(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin execute 'select count(*) from (' || p_sql || ') q' into n; return n; end $$;
grant execute on all functions in schema t to public;
