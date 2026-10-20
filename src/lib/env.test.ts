import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secretKeyProblem } from './env.ts';

const jwt = (role: string) => `h.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.s`;

test('service_role JWT is rejected', () => assert.ok(secretKeyProblem(jwt('service_role'))));
test('sb_secret_ key is rejected', () => assert.ok(secretKeyProblem('sb_secret_abc')));
test('anon JWT and publishable keys are allowed', () => {
  assert.equal(secretKeyProblem(jwt('anon')), undefined);
  assert.equal(secretKeyProblem('sb_publishable_abc'), undefined);
  assert.equal(secretKeyProblem(undefined), undefined);
});
