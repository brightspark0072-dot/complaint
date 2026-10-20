import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evidenceObjectPath,
  validateComplaint,
  validateEmail,
  validateEvidenceFile,
  validateNewPassword,
} from './validation.ts';

const valid = {
  categoryId: 'c',
  organizationId: '',
  organizationName: 'Sample City Office',
  title: 'Streetlight is broken',
  description: 'The streetlight outside the school has not worked for weeks.',
  location: 'Main Road',
  acknowledgedPrivacy: true,
};

test('valid complaint has no errors', () => assert.deepEqual(validateComplaint(valid), {}));
test('short title and description are rejected', () => {
  const e = validateComplaint({ ...valid, title: 'abc', description: 'too short' });
  assert.ok(e.title && e.description);
});
test('whitespace cannot satisfy length rules', () => {
  const e = validateComplaint({ ...valid, title: '        ', description: ' '.repeat(40) });
  assert.ok(e.title && e.description);
});
test('organization is required unless one is selected', () => {
  assert.ok(validateComplaint({ ...valid, organizationName: '' }).organizationName);
  assert.equal(
    validateComplaint({ ...valid, organizationName: '', organizationId: 'o' }).organizationName,
    undefined,
  );
});
test('privacy acknowledgement is required', () =>
  assert.ok(validateComplaint({ ...valid, acknowledgedPrivacy: false }).acknowledgedPrivacy));
test('email validation', () => {
  assert.equal(validateEmail('a@b.co'), undefined);
  assert.ok(validateEmail('nope'));
  assert.ok(validateEmail(''));
});
test('password validation', () => {
  assert.ok(validateNewPassword('short1'));
  assert.ok(validateNewPassword('onlyletterslong'));
  assert.equal(validateNewPassword('longenough123'), undefined);
});
test('evidence file validation', () => {
  assert.equal(validateEvidenceFile({ name: 'a.png', size: 100, type: 'image/png' }), undefined);
  assert.ok(validateEvidenceFile({ name: 'a.exe', size: 100, type: 'application/x-msdownload' }));
  assert.ok(
    validateEvidenceFile({ name: 'a.pdf', size: 11 * 1024 * 1024, type: 'application/pdf' }),
  );
  assert.ok(validateEvidenceFile({ name: 'a.pdf', size: 0, type: 'application/pdf' }));
});
test('evidence path always matches the storage policy pattern', () => {
  const policy =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9._-]{1,100}$/;
  const cid = '11111111-1111-1111-1111-111111111111';
  const rid = '22222222-2222-2222-2222-222222222222';
  for (const name of [
    'photo.PNG',
    '../../etc/passwd',
    'résumé final (1).pdf',
    '....',
    'a'.repeat(300) + '.jpg',
    '日本語.png',
  ]) {
    const p = evidenceObjectPath(cid, name, rid);
    assert.match(p, policy, `path for ${name}: ${p}`);
    assert.ok(!p.includes('..'));
  }
});
