import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TRANSITIONS, allowedTransitions } from './status.ts';

// Parse the authoritative transition table out of the SQL migration and compare it with the UI mirror.
const sql = readFileSync(
  new URL('../../supabase/migrations/20261020000001_schema.sql', import.meta.url),
  'utf8',
);
const block = sql.slice(sql.indexOf('insert into public.status_transitions'));
const rows = [...block.matchAll(/\('(\w+)','(\w+)','(\w+)',(true|false)\)/g)].map(
  (m) => `${m[3]}:${m[1]}>${m[2]}:${m[4]}`,
);

test('UI transition table matches the database table exactly', () => {
  const ui = TRANSITIONS.map((t) => `${t.role}:${t.from}>${t.to}:${t.requiresMessage}`);
  assert.ok(rows.length > 10, 'parsed SQL rows');
  assert.deepEqual([...ui].sort(), [...rows].sort());
});
test('complainants can never close or resolve', () => {
  const bad = TRANSITIONS.filter(
    (t) => t.role === 'complainant' && ['closed', 'resolved', 'rejected'].includes(t.to),
  );
  assert.deepEqual(bad, []);
});
test('handlers cannot reopen closed or rejected cases', () => {
  assert.equal(allowedTransitions('closed', 'handler').length, 0);
  assert.equal(allowedTransitions('rejected', 'handler').length, 0);
});
