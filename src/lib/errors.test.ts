import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTH_MESSAGES,
  actionErrorMessage,
  signInErrorMessage,
  signUpErrorMessage,
} from './errors.ts';

test('sign-in errors never distinguish unknown email from wrong password', () => {
  const a = signInErrorMessage({ message: 'Invalid login credentials', status: 400 });
  const b = signInErrorMessage({ message: 'User not found', status: 400 });
  const c = signInErrorMessage({ message: 'Email not confirmed', status: 400 });
  assert.equal(a, b);
  assert.equal(b, c);
});
test('sign-up swallows account-exists errors', () => {
  assert.equal(signUpErrorMessage({ code: 'user_already_exists', status: 422 }), undefined);
});
test('rate limiting is surfaced', () => {
  assert.equal(signInErrorMessage({ status: 429 }), AUTH_MESSAGES.rateLimited);
});
test('database error messages are not leaked verbatim, except safe validation text', () => {
  assert.equal(
    actionErrorMessage({ code: 'XX000', message: 'relation "secret_table" does not exist' }),
    AUTH_MESSAGES.generic,
  );
  assert.equal(
    actionErrorMessage({ code: 'P0002', message: 'complaint not found' }),
    'That complaint could not be found.',
  );
});
