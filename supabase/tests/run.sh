#!/usr/bin/env bash
# Applies the migrations to a THROWAWAY local PostgreSQL (with a stub of Supabase's auth/storage
# schemas) and runs the adversarial RLS tests. Never point this at a real project.
#
# Usage: PGHOST=<socket dir or host> PGPORT=<port> PGUSER=postgres supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."            # -> supabase/
DB="complaint_test_$$"
psql -qAt -d postgres -c "create database $DB" >/dev/null
trap 'psql -qAt -d postgres -c "drop database if exists $DB with (force)" >/dev/null' EXIT

run() { psql -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
run -f tests/support/supabase_stub.sql >/dev/null
# 0004 (storage) is applied by the test file after it creates the bucket row, so apply 0001-0003 here.
for f in migrations/20261020000001_schema.sql migrations/20261020000002_rls.sql migrations/20261020000003_functions.sql; do
  echo "applying $f"; run -f "$f" >/dev/null
done
echo "seeding"; run -f seed.sql >/dev/null
echo "running tests"
OUT="$(mktemp)"
if run -t -A -f tests/rls.test.sql >"$OUT" 2>&1; then STATUS=0; else STATUS=$?; fi
grep -E "PASS|FAIL|ERROR" "$OUT" || true
PASSES=$(grep -c "PASS" "$OUT" || true)
if [ "$STATUS" -eq 0 ]; then echo "RESULT: all tests passed ($PASSES assertions)"; else echo "RESULT: FAILED"; tail -5 "$OUT"; exit 1; fi
